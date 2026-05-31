import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ═══════════════════════════════════════════════════════════════
//  Admeasy — command edge function  v4  (slim)
//
//  Responsibilities:
//   • School AI: fee reminders, attendance alerts, call queues,
//     email drafts, general school queries
//   • Timetable intent → proxy to timetable-ai function
//   • Email dispatch (confirmed_emails flow)
//   • Schema inference (type: "infer_schema")
//
//  NOT handled here (separate functions):
//   • Browser automation → browser-agent function
//   • Voice forwarding  → voice-session function
//   • Calls             → call-agent / call-script functions
// ═══════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Model list ───────────────────────────────────────────────
const MODELS = [
  "openai/gpt-oss-20b:free",
  "openai/gpt-oss-120b:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
  "microsoft/phi-4:free",
];

// ─── Intent detection ─────────────────────────────────────────
function inferIntent(input: string): string {
  const lc = String(input || "").toLowerCase();
  if (/timetable|period|schedule|class now|who.*teach|today.*period|current.*period|generate.*timetable/i.test(lc))
    return "timetable";
  if (/(student|attendance|fees|mentor|teacher|parent|school|call queue|email|reminder|alert)/i.test(lc))
    return "school";
  return "general";
}

// ─── Knowledge retrieval (global + workspace RAG) ─────────────
export type RagSource = {
  scope: "workspace" | "global";
  source_id?: string | null;
  source_name?: string | null;
  board?: string | null;
  class?: string | null;
  subject?: string | null;
  chapter?: string | null;
  similarity?: number | null;
  source_type?: string | null;
  chunk_index?: number | null;
  content_snippet?: string | null;
};

async function fetchKnowledgeContext(
  supa: any,
  query: string,
  workspaceId: string | null,
): Promise<{ context: string; sources: RagSource[] }> {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY || !query?.trim()) return { context: "", sources: [] };
    const embRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: query.slice(0, 4000),
        dimensions: 1536,
      }),
    });
    if (!embRes.ok) return { context: "", sources: [] };
    const embJson = await embRes.json();
    const vec = embJson?.data?.[0]?.embedding;
    if (!vec) return { context: "", sources: [] };

    const m = query.match(/\bclass\s*(\d{1,2})\b/i);
    const classHint = m ? m[1] : null;
    const boardMatch = query.match(/\b(CBSE|ICSE|MP|NCERT)\b/i);
    const boardHint = boardMatch ? boardMatch[1].toUpperCase().replace("NCERT", "CBSE") : null;

    const [gRes, wRes] = await Promise.all([
      supa.rpc("match_global_chunks", {
        query_embedding: vec,
        match_count: 6,
        p_board: boardHint,
        p_class: classHint,
        p_subject: null,
      }),
      workspaceId
        ? supa.rpc("match_workspace_chunks", {
            query_embedding: vec,
            p_workspace_id: workspaceId,
            match_count: 3,
          })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const merged = [
      ...((wRes?.data ?? []) as any[]).map((r) => ({ tag: "[school]", text: r.content })),
      ...((gRes?.data ?? []) as any[]).map((r) => ({
        tag: `[${[r.board, r.class && `Class ${r.class}`, r.subject, r.chapter].filter(Boolean).join(" / ")}]`,
        text: r.content,
      })),
    ];

    const snip = (t: string | null | undefined) =>
      t ? (t.length > 400 ? t.slice(0, 400) + "…" : t) : null;
    const sources: RagSource[] = [
      ...((wRes?.data ?? []) as any[]).map((r) => ({
        scope: "workspace" as const,
        source_id: r.source_id ?? null,
        source_name: r.source_name ?? null,
        source_type: r.source_type ?? null,
        similarity: r.similarity ?? null,
        chunk_index: r.chunk_index ?? null,
        content_snippet: snip(r.content),
      })),
      ...((gRes?.data ?? []) as any[]).map((r) => ({
        scope: "global" as const,
        source_id: r.source_id ?? null,
        source_name: r.source_name ?? null,
        board: r.board ?? null,
        class: r.class ?? null,
        subject: r.subject ?? null,
        chapter: r.chapter ?? null,
        similarity: r.similarity ?? null,
        chunk_index: r.chunk_index ?? null,
        content_snippet: snip(r.content),
      })),
    ];

    if (!merged.length) return { context: "", sources };
    return {
      context: merged.map((x) => `${x.tag}\n${x.text}`).join("\n\n---\n\n"),
      sources,
    };
  } catch (e) {
    console.error("knowledge retrieval failed", e);
    return { context: "", sources: [] };
  }
}

// ─── Safe DB helpers ──────────────────────────────────────────
function makeSafeHelpers(sb: ReturnType<typeof createClient>) {
  async function safeInsert(table: string, payload: any) {
    try {
      const { error } = await sb.from(table).insert(payload);
      if (error) console.error(`[INSERT_${table}]`, error.message);
      return !error;
    } catch (e: any) {
      console.error(`[INSERT_FATAL_${table}]`, e.message);
      return false;
    }
  }
  async function safeUpsert(table: string, payload: any, options?: any) {
    try {
      const { error } = await sb.from(table).upsert(payload, options);
      if (error) console.error(`[UPSERT_${table}]`, error.message);
      return !error;
    } catch (e: any) {
      console.error(`[UPSERT_FATAL_${table}]`, e.message);
      return false;
    }
  }
  return { safeInsert, safeUpsert };
}

// ─── Fetch with timeout ───────────────────────────────────────
async function fetchWithTimeout(url: string, options: any, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Proxy to timetable-ai ────────────────────────────────────
async function proxyToTimetableAI(body: any, supabaseUrl: string, serviceKey: string): Promise<Response> {
  const ttUrl = `${supabaseUrl}/functions/v1/timetable-ai`;
  try {
    const res = await fetchWithTimeout(
      ttUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      },
      25000,
    );
    const data = await res.json().catch(() => ({}));
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return json(500, { ok: false, error: `timetable-ai proxy failed: ${e.message}` });
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return json(200, { ok: true });

    const rawBody = await req.text();
    if (!rawBody?.trim()) return json(400, { error: "Empty request body" });

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;

    const {
      workspace_id: workspaceIdRaw,
      input,
      command,
      mode,
      ts,
      command_id,
      confirmed_emails,
      student_data,
      teacher_data,
      mentor_data,
      conversation_id,
      conversation_history,
      voice_mode,
      page_context,
    } = body;

    if (!workspaceIdRaw) return json(400, { error: "Missing workspace_id" });

    const workspace_id = String(workspaceIdRaw).trim();
    const commandText = String(command ?? input ?? "").trim();
    const cmdId = String(command_id ?? crypto.randomUUID());
    const cmdTs = Number(ts ?? Date.now());
    const cmdMode = String(mode ?? "agent");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { safeInsert, safeUpsert } = makeSafeHelpers(sb);

    // ── Timetable intent → proxy directly to timetable-ai ──────
    // Handles: generate, save, fetch, fetch_settings, export, parse_xlsx
    const isTimetableMode = ["generate", "save", "fetch", "fetch_settings", "export", "parse_xlsx"].includes(body.mode);
    const isTimetableCommand = !isTimetableMode && inferIntent(commandText) === "timetable";

    if (isTimetableMode) {
      // Direct timetable operation (from timetable UI)
      return proxyToTimetableAI({ ...body, workspace_id }, SUPABASE_URL, SERVICE_KEY);
    }

    if (isTimetableCommand && commandText) {
      // AI command like "generate timetable for class 9A" — proxy with generate mode
      // Parse class/section from command if present
      const classMatch = commandText.match(/class\s*([0-9]+)/i);
      const sectionMatch =
        commandText.match(/section\s*([A-Za-z])|([A-Za-z])\s*section/i) || commandText.match(/\b([A-Z])\b/);
      const classNum = classMatch?.[1] ?? null;
      const section = sectionMatch?.[1] ?? sectionMatch?.[2] ?? "A";

      if (classNum) {
        return proxyToTimetableAI(
          { mode: "generate", workspace_id, class: classNum, section, constraints: commandText },
          SUPABASE_URL,
          SERVICE_KEY,
        );
      }
      // If class not parseable, fall through to school AI with context
    }

    // ── Email dispatch (confirmed_emails flow) ──────────────────
    if (Array.isArray(confirmed_emails) && confirmed_emails.length > 0) {
      const results: any[] = [];

      for (const em of confirmed_emails) {
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Admeasy School <team@school.admeasy.in>",
              to: [em.to],
              subject: em.subject,
              html: `<div style="font-family:sans-serif;max-width:600px;padding:24px;line-height:1.7">
                ${(em.body ?? "").replace(/\n/g, "<br>")}
                <hr style="margin-top:32px;border:none;border-top:1px solid #eee"/>
                <p style="color:#aaa;font-size:11px">Sent via Admeasy AI · team@school.admeasy.in</p>
              </div>`,
            }),
          });
          const j = await r.json().catch(() => ({}));
          results.push({
            to: em.to,
            status: r.ok ? "sent" : "failed",
            error: r.ok ? null : (j.message ?? "Resend error"),
          });
        } catch (e: any) {
          results.push({ to: em.to, status: "failed", error: e.message });
        }
      }

      const sent = results.filter((r) => r.status === "sent").length;
      const failed = results.filter((r) => r.status === "failed").length;

      await safeInsert("command_history", {
        workspace_id,
        command: "confirmed_emails_dispatch",
        mode: cmdMode,
        intent: "communication",
        model: "resend",
        command_id: cmdId,
        created_at: new Date(cmdTs).toISOString(),
        metadata: { sent, failed, total: confirmed_emails.length },
      });

      return json(200, {
        phase: "done",
        response: `📧 ${sent}/${confirmed_emails.length} emails sent${failed > 0 ? ` · ❌ ${failed} failed` : " · ✅ All delivered"}`,
        email_results: results,
      });
    }

    // ── Schema inference ────────────────────────────────────────
    if (body.type === "infer_schema") {
      const { headers, workspace_id: ws } = body;

      const { data: memory } = await sb
        .from("canonical_schema_memory")
        .select("source_header, canonical_field, confidence")
        .eq("workspace_id", ws)
        .in("source_header", headers)
        .gte("confidence", 0.85);

      const memorized = Object.fromEntries((memory ?? []).map((m: any) => [m.source_header, m]));
      const uncached = headers.filter((h: string) => !memorized[h]);

      let aiMappings: any = {};
      if (uncached.length > 0) {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ai.admeasy.in",
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b:free",
            messages: [
              {
                role: "system",
                content: `Map school CSV headers to canonical fields. Canonical: student_id, name, class, section, student_email, parent_name, parent_email, parent_phone, attendance_pct, total_fees, paid, amount_due, fee_status, interests, teacher_id, subject, phone, assigned_classes, mentor_id, institution, program, expertise_tags. Return ONLY JSON: {"entity":"student|teacher|mentor|unknown","mappings":{"raw":"canonical"},"confidence":0.0-1.0}`,
              },
              { role: "user", content: JSON.stringify(uncached) },
            ],
            response_format: { type: "json_object" },
          }),
        });
        const d = await res.json();
        try {
          aiMappings = JSON.parse(d.choices[0].message.content);
        } catch {
          /* ignore */
        }

        const toSave = Object.entries((aiMappings as any).mappings ?? {}).map(([src, canonical]) => ({
          workspace_id: ws,
          source_header: src,
          canonical_field: canonical,
          entity_type: (aiMappings as any).entity ?? "unknown",
          confidence: (aiMappings as any).confidence ?? 0.7,
        }));
        if (toSave.length) {
          await sb.from("canonical_schema_memory").upsert(toSave, { onConflict: "workspace_id,source_header" });
        }
      }

      return json(200, { mappings: { ...memorized, ...((aiMappings as any).mappings ?? {}) }, source: "hybrid" });
    }

    // ── Load conversation history from DB ───────────────────────
    // If conversation_id provided, load last 20 messages from DB
    // (more reliable than relying on frontend to pass history)
    let historyMessages: Array<{ role: string; content: string }> = [];

    if (conversation_id) {
      try {
        const { data: msgs } = await sb
          .from("ai_messages")
          .select("role, content")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (msgs && msgs.length > 0) {
          historyMessages = msgs.reverse(); // chronological order
        }
      } catch (e: any) {
        console.warn("[CONV_HISTORY]", e.message);
      }
    } else if (Array.isArray(conversation_history) && conversation_history.length > 0) {
      // Fallback: use frontend-passed history if no conversation_id
      historyMessages = conversation_history.slice(-20);
    }

    // ── Load school data ────────────────────────────────────────
    let students: any[] = Array.isArray(student_data) && student_data.length > 0 ? student_data : [];
    let teachers: any[] = Array.isArray(teacher_data) && teacher_data.length > 0 ? teacher_data : [];
    let mentors: any[] = Array.isArray(mentor_data) && mentor_data.length > 0 ? mentor_data : [];

    let transportVehicles: any[] = [];
    let transportRoutes: any[] = [];
    let transportStaff: any[] = [];
    let transportAssignments: any[] = [];
    let transportFees: any[] = [];

    try {
      const [r1, r2, r3, t1, t2, t3, t4, t5] = await Promise.all([
        sb.from("students").select("*").eq("workspace_id", workspace_id).limit(500),
        sb.from("teachers").select("*").eq("workspace_id", workspace_id).limit(50),
        sb.from("mentors").select("*").eq("workspace_id", workspace_id).limit(50),
        sb.from("transport_vehicles").select("id,vehicle_number,capacity,assigned_driver_id,assigned_conductor_id,route_id,insurance_expiry,pollution_expiry,fitness_expiry,active").eq("workspace_id", workspace_id),
        sb.from("transport_routes").select("id,route_name,route_code,start_location,end_location,vehicle_id,monthly_fee,active").eq("workspace_id", workspace_id),
        sb.from("non_teaching_staff").select("id,name,role,phone,license_number,license_expiry,assigned_vehicle_id,active").eq("workspace_id", workspace_id).in("role", ["driver", "conductor", "helper"]),
        sb.from("transport_assignments").select("id,student_id,route_id,vehicle_id,active").eq("workspace_id", workspace_id).eq("active", true),
        sb.from("transport_fees").select("id,student_id,amount,status,period_month,period_year").eq("workspace_id", workspace_id).in("status", ["pending", "overdue", "partial"]),
      ]);
      if (students.length === 0) students = r1.data ?? [];
      teachers = r2.data ?? [];
      mentors = r3.data ?? [];
      transportVehicles = t1.data ?? [];
      transportRoutes = t2.data ?? [];
      transportStaff = t3.data ?? [];
      transportAssignments = t4.data ?? [];
      transportFees = t5.data ?? [];
    } catch (e: any) {
      console.warn("[DATA_LOAD]", e.message);
    }

    // ── Context slicing — send only what's needed ───────────────
    const lc = commandText.toLowerCase();

    const isFeeQuery = /fee|due|unpaid|payment|overdue/i.test(lc);
    const isAttendanceQuery = /attendance|absent|low.*attend|attend.*low/i.test(lc);
    const isCallQuery = /call|phone|ring|dial/i.test(lc);
    const isMentorQuery = /mentor|career|guidance|counsell/i.test(lc);

    // Pre-filter fee & attendance candidates
    const feeCandidates = students.filter((s: any) => {
      const due = Number(s.due ?? s.amount_due ?? 0);
      const status = String(s.fee_status ?? "").toLowerCase();
      return due > 0 || status === "unpaid" || status === "partial";
    });

    const attendanceCandidates = students.filter((s: any) => {
      const pct = parseFloat(String(s.attendance_pct ?? "100").replace(/[^0-9.]/g, ""));
      return !isNaN(pct) && pct < 75;
    });

    // Decide what student data to pass — send ONLY relevant subset
    let studentContextLabel = "";
    let studentContextData: any[] = [];

    if (isFeeQuery && !isAttendanceQuery) {
      studentContextLabel = "FEE_CANDIDATES (students with due > 0 or fee_status unpaid/partial)";
      studentContextData = feeCandidates.slice(0, 200).map((s: any) => ({
        student_id: s.student_id,
        name: s.name,
        class: s.class,
        section: s.section,
        due: Number(s.due ?? s.amount_due ?? 0),
        fee_status: s.fee_status,
        parent_name: s.parent_name,
        parent_phone: s.parent_phone,
        parent_email: s.parent_email,
      }));
    } else if (isAttendanceQuery && !isFeeQuery) {
      studentContextLabel = "ATTENDANCE_CANDIDATES (students with attendance_pct < 75)";
      studentContextData = attendanceCandidates.slice(0, 200).map((s: any) => ({
        student_id: s.student_id,
        name: s.name,
        class: s.class,
        section: s.section,
        attendance_pct: s.attendance_pct,
        parent_name: s.parent_name,
        parent_phone: s.parent_phone,
        parent_email: s.parent_email,
      }));
    } else {
      // General query — send compact full list
      studentContextLabel = "ALL_STUDENTS";
      studentContextData = students.slice(0, 300).map((s: any) => ({
        student_id: s.student_id,
        name: s.name,
        class: s.class,
        section: s.section,
        attendance_pct: Number(s.attendance_pct ?? 0),
        fee_status: s.fee_status,
        due: Number(s.due ?? s.amount_due ?? 0),
        paid: Number(s.paid ?? 0),
        parent_name: s.parent_name,
        parent_phone: s.parent_phone,
        parent_email: s.parent_email,
        interests: s.interests || null,
      }));
    }

    const teacherContext = teachers.slice(0, 20).map((t: any) => ({
      teacher_id: t.teacher_id,
      name: t.name,
      subject: t.subject,
      email: t.email,
      phone: t.phone,
    }));

    const mentorContext =
      isMentorQuery || isCallQuery
        ? mentors.slice(0, 15).map((m: any) => ({
            mentor_id: m.mentor_id,
            name: m.name,
            institution: m.institution,
            expertise_tags: m.expertise_tags,
            phone: m.phone ?? m.contact_phone ?? null,
            email: m.contact_email ?? m.email ?? null,
          }))
        : [];

    // ── Time context ────────────────────────────────────────────
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDay = days[istNow.getUTCDay()];
    const hours = istNow.getUTCHours();
    const minutes = istNow.getUTCMinutes();
    const h12 = hours % 12 || 12;
    const ampm = hours >= 12 ? "PM" : "AM";
    const timeStr = `${h12}:${String(minutes).padStart(2, "0")} ${ampm} IST`;
    const dayAbbr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][istNow.getUTCDay()].toUpperCase();
    const nowMin = hours * 60 + minutes;

    // ── Active timetable periods ────────────────────────────────
    let activePeriods: [number, string, string][] = [
      [1, "08:00", "08:45"],
      [2, "08:45", "09:30"],
      [3, "09:30", "10:15"],
      [4, "10:30", "11:15"],
      [5, "11:15", "12:00"],
      [6, "12:45", "13:30"],
      [7, "13:30", "14:15"],
      [8, "14:15", "15:00"],
    ];
    try {
      const { data: s } = await sb
        .from("timetable_settings")
        .select(
          "start_time,period_duration,periods_per_day,short_break_after,short_break_duration,lunch_break_after,lunch_break_duration",
        )
        .eq("workspace_id", workspace_id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      if (s) {
        const [sh, sm] = s.start_time.split(":").map(Number);
        let cur = sh * 60 + sm;
        const dur = Number(s.period_duration ?? 45);
        const ppd = Number(s.periods_per_day ?? 8);
        const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        activePeriods = [];
        for (let p = 1; p <= ppd; p++) {
          activePeriods.push([p, fmt(cur), fmt(cur + dur)]);
          cur += dur;
          if (Number(s.short_break_after ?? 0) > 0 && p === Number(s.short_break_after))
            cur += Number(s.short_break_duration ?? 0);
          if (p === Number(s.lunch_break_after ?? 5)) cur += Number(s.lunch_break_duration ?? 30);
        }
      }
    } catch {
      /* use defaults */
    }

    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const cp = activePeriods.find((p) => nowMin >= toMin(p[1]) && nowMin < toMin(p[2]));
    const periodInfo = cp ? `Period ${cp[0]} (${cp[1]}–${cp[2]})` : "Outside school hours";

    // ── Today's timetable (only if needed) ─────────────────────
    let timetableRows: any[] = [];
    if (/timetable|period|who.*teach|today.*class|current.*period/i.test(commandText) || cp) {
      try {
        const { data: tt } = await sb
          .from("timetable")
          .select("class,section,day,period_number,subject,teacher_name")
          .eq("workspace_id", workspace_id)
          .eq("day", dayAbbr)
          .order("class")
          .order("section")
          .order("period_number");
        timetableRows = tt ?? [];
      } catch {
        /* ignore */
      }
    }

    // ── Build context string ────────────────────────────────────
    const cmdStartedAt = Date.now();
    const { context: knowledge, sources: ragSources } = await fetchKnowledgeContext(sb, commandText, workspace_id);
    const context = `WORKSPACE: ${workspace_id}
TIME: ${currentDay}, ${timeStr} | Current Period: ${periodInfo}

TODAY'S TIMETABLE (${currentDay}):
${
  timetableRows.length > 0
    ? timetableRows
        .map((r: any) => `Class ${r.class}-${r.section} P${r.period_number}: ${r.subject} — ${r.teacher_name}`)
        .join("\n")
    : "Not loaded (use timetable page for timetable operations)"
}

SCHOOL DATA:
students_total=${students.length}
fee_candidates=${feeCandidates.length} (due > 0 or unpaid/partial)
attendance_candidates=${attendanceCandidates.length} (attendance_pct < 75)
teachers=${teachers.length}
mentors=${mentors.length}

${studentContextLabel}:
${JSON.stringify(studentContextData)}

TEACHERS:
${JSON.stringify(teacherContext)}

${mentorContext.length > 0 ? `MENTORS:\n${JSON.stringify(mentorContext)}` : ""}

TRANSPORT:
vehicles=${transportVehicles.length} routes=${transportRoutes.length} drivers_staff=${transportStaff.length} active_riders=${transportAssignments.length} pending_transport_fees=${transportFees.length}
OVERLOADED_BUSES: ${JSON.stringify(
  transportVehicles
    .map((v: any) => {
      const riders = transportAssignments.filter((a: any) => a.vehicle_id === v.id).length;
      return { vehicle: v.vehicle_number, capacity: v.capacity, riders, over: v.capacity && riders > v.capacity };
    })
    .filter((x: any) => x.over)
)}
LICENSE_EXPIRING_30D: ${JSON.stringify(
  transportStaff
    .filter((s: any) => {
      if (!s.license_expiry) return false;
      const d = (new Date(s.license_expiry).getTime() - Date.now()) / 86400000;
      return d <= 30;
    })
    .map((s: any) => ({ name: s.name, license: s.license_number, expires: s.license_expiry }))
)}
DOC_EXPIRING_30D: ${JSON.stringify(
  transportVehicles.flatMap((v: any) =>
    ["insurance_expiry", "pollution_expiry", "fitness_expiry"]
      .filter((k) => v[k] && (new Date(v[k]).getTime() - Date.now()) / 86400000 <= 30)
      .map((k) => ({ vehicle: v.vehicle_number, doc: k.replace("_expiry", ""), date: v[k] }))
  )
)}
TRANSPORT_FEE_PENDING: ${JSON.stringify(transportFees.slice(0, 100))}


${knowledge ? `KNOWLEDGE (use as authoritative source for academic / educational / policy questions):\n${knowledge}\n` : ""}
CONVERSATION_HISTORY:
${JSON.stringify(historyMessages).slice(0, 6000)}

PAGE_CONTEXT (what the user is currently viewing — prefer these IDs when the command says "this", "current", "selected"):
${JSON.stringify(page_context ?? {})}

VOICE_MODE: ${voice_mode ? "true" : "false"}`;

    // ── System prompt ───────────────────────────────────────────
    const system = `You are Admeasy AI — autonomous school operating system for Indian schools.

Use ONLY real student/teacher/mentor data from context. Never invent IDs, phones, or amounts.

FEE REMINDERS: Only students where due > 0 OR fee_status is 'unpaid'/'partial'. Never remind paid students.
ATTENDANCE ALERTS: Only students where attendance_pct < 75. Never alert for ≥ 75%.

CALL QUEUE: Output structured %%CALL_QUEUE%%{"recipients":[{type,id,name,phone,role}],"purpose":"","message":"","action":"call"}%%END_CALL_QUEUE%%

EMAIL DRAFTS: Output %%EMAIL_DRAFTS%%[{"to":"","subject":"","body":""}]%%END_EMAIL_DRAFTS%%

TRANSPORT ACTIONS — CRITICAL EXECUTION RULES:
- The server (NOT you) actually creates/updates rows. You ONLY emit a JSON action block; the server executes it and appends a "✅ N actions executed" line.
- NEVER claim "added successfully", "registered", "created", "done" in your prose unless you also emit a matching %%TRANSPORT_ACTIONS%% block. Saying it without emitting the block = a lie to the user.
- If you cannot resolve real UUIDs from context (TRANSPORT_VEHICLES, TRANSPORT_ROUTES, students[]), DO NOT fabricate them. Instead ask the user which exact record to use, or say "I need the route/student to be listed in the system first."
- For register_student_transport / assign_bus: student_id MUST be a real UUID from the students[] context. If user gave a name, look it up; if not found, refuse and ask.
- For add_vehicle / create_route / add_staff: always emit the action block so the server inserts the row.
- Keep prose short: describe WHAT you queued (e.g. "Queuing 1 vehicle add and 1 staff add"). The server output confirms success.

Format:
%%TRANSPORT_ACTIONS%%[
  {"type":"add_vehicle","vehicle_number":"MP09-1234","vehicle_type":"bus","capacity":40,"gps_enabled":true},
  {"type":"create_route","route_name":"North-2","route_code":"N2","start_location":"Depot","end_location":"School","monthly_fee":1200,"vehicle_id":"<uuid or null>"},
  {"type":"add_staff","name":"Ramesh","role":"driver","department_tag":"transport","phone":"99999...","license_number":"...","salary":18000},
  {"type":"register_student_transport","student_id":"<real-uuid-from-students-context>","route_id":"<real-uuid>","stop_id":null,"fee_plan":"monthly","fee_amount":1200,"admission_fee":500,"pickup_type":"both"},
  {"type":"assign_bus","student_id":"<real-uuid>","route_id":"<real-uuid>","vehicle_id":"<real-uuid>","stop_id":null,"pickup_type":"both","monthly_transport_fee":1200}
]%%END_TRANSPORT_ACTIONS%%


TIMETABLE: For "generate timetable for class X" type commands, just tell the user to use the Timetable page, or the AI has already been forwarded to timetable-ai. You can discuss timetable data but not generate full timetables.

Be concise and operational. Respond in the same language the user uses.`;

    // ── AI call ─────────────────────────────────────────────────
    const messages = [
      ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: `${context}\n\nCOMMAND: ${commandText}` },
    ];

    let fullResponse = "";
    let usedModel = "";

    for (const model of MODELS) {
      try {
        const res = await fetchWithTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENROUTER_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://ai.admeasy.in",
              "X-Title": "Admeasy AI",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "system", content: system }, ...messages],
              max_tokens: 3000,
              temperature: 0.2,
            }),
          },
          18000,
        );

        if (!res.ok) {
          console.warn(`[CMD] ${model} → ${res.status}`);
          continue;
        }
        const d = await res.json();
        const content = d.choices?.[0]?.message?.content ?? "";
        if (content.length > 20) {
          fullResponse = content;
          usedModel = model;
          break;
        }
      } catch (e: any) {
        console.warn(`[CMD] ${model} exception:`, e.message);
      }
    }

    if (!fullResponse) {
      return json(200, { phase: "done", response: "AI is temporarily unavailable. Please try again in a moment." });
    }

    // ── Parse special blocks from response ──────────────────────
    let cleanResponse = fullResponse;
    let emailDrafts: any[] = [];

    const draftMatch = fullResponse.match(/%%EMAIL_DRAFTS%%([\s\S]*?)%%END_EMAIL_DRAFTS%%/);
    if (draftMatch) {
      try {
        emailDrafts = JSON.parse(draftMatch[1].trim());
      } catch {
        /* ignore */
      }
      cleanResponse = cleanResponse.replace(/%%EMAIL_DRAFTS%%[\s\S]*?%%END_EMAIL_DRAFTS%%/, "").trim();
    }

    let callQueue: any = null;
    const callMatch = fullResponse.match(/%%CALL_QUEUE%%([\s\S]*?)%%END_CALL_QUEUE%%/);
    if (callMatch) {
      try {
        callQueue = JSON.parse(callMatch[1].trim());
      } catch {
        /* ignore */
      }
      cleanResponse = cleanResponse.replace(/%%CALL_QUEUE%%[\s\S]*?%%END_CALL_QUEUE%%/, "").trim();
    }

    // ── Transport actions executor (CRUD via AI prompt) ─────────
    let transportActions: any[] = [];
    let transportResults: any[] = [];
    const txMatch = fullResponse.match(/%%TRANSPORT_ACTIONS%%([\s\S]*?)%%END_TRANSPORT_ACTIONS%%/);
    if (txMatch) {
      try { transportActions = JSON.parse(txMatch[1].trim()); } catch { /* ignore */ }
      cleanResponse = cleanResponse.replace(/%%TRANSPORT_ACTIONS%%[\s\S]*?%%END_TRANSPORT_ACTIONS%%/, "").trim();

      for (const a of transportActions) {
        try {
          if (a.type === "add_vehicle") {
            const { data, error } = await sb.from("transport_vehicles").insert({
              workspace_id, vehicle_number: a.vehicle_number, vehicle_type: a.vehicle_type ?? "bus",
              capacity: a.capacity ?? 40, gps_enabled: a.gps_enabled ?? false, active: true,
              assigned_driver_id: a.assigned_driver_id ?? null,
              assigned_conductor_id: a.assigned_conductor_id ?? null,
              route_id: a.route_id ?? null,
            }).select("id,vehicle_number").maybeSingle();
            if (error) throw error;
            transportResults.push({ type: a.type, ok: true, vehicle: data });
          } else if (a.type === "create_route") {
            const { data, error } = await sb.from("transport_routes").insert({
              workspace_id, route_name: a.route_name, route_code: a.route_code ?? null,
              start_location: a.start_location ?? null, end_location: a.end_location ?? null,
              vehicle_id: a.vehicle_id ?? null, monthly_fee: a.monthly_fee ?? null,
              transport_manager_id: a.transport_manager_id ?? null, active: true,
            }).select("id,route_name").maybeSingle();
            if (error) throw error;
            transportResults.push({ type: a.type, ok: true, route: data });
          } else if (a.type === "add_staff") {
            const dept = String(a.department_tag ?? "transport").toLowerCase();
            const { data, error } = await sb.from("non_teaching_staff").insert({
              workspace_id, name: a.name, role: a.role ?? "driver",
              sub_role: a.sub_role ?? null, department_tag: dept,
              phone: a.phone ?? null, email: a.email ?? null,
              license_number: a.license_number ?? null, license_expiry: a.license_expiry ?? null,
              salary: a.salary ?? null, joining_date: a.joining_date ?? null,
              assigned_vehicle_id: a.assigned_vehicle_id ?? null,
              assigned_route_id: a.assigned_route_id ?? null,
              active: true, status: "active",
            }).select("id,name,role").maybeSingle();
            if (error) throw error;
            transportResults.push({ type: a.type, ok: true, staff: data });
          } else if (a.type === "register_student_transport") {
            // Resolve student by id, or by name if id missing/invalid
            let sid = a.student_id;
            const isUuid = typeof sid === "string" && /^[0-9a-f-]{36}$/i.test(sid);
            if (!isUuid && a.student_name) {
              const m = students.find((s: any) => (s.name || "").toLowerCase() === String(a.student_name).toLowerCase());
              if (m) sid = m.id;
            } else if (isUuid) {
              const m = students.find((s: any) => s.id === sid);
              if (!m) sid = null;
            }
            if (!sid) {
              transportResults.push({ type: a.type, ok: false, error: `student not found: ${a.student_name || a.student_id}` });
              continue;
            }
            const { data, error } = await sb.from("transport_registrations").insert({
              workspace_id, student_id: sid, route_id: a.route_id ?? null,
              stop_id: a.stop_id ?? null, pickup_type: a.pickup_type ?? "both",
              fee_plan: a.fee_plan ?? "monthly", fee_amount: a.fee_amount ?? 0,
              admission_fee: a.admission_fee ?? 0,
              start_date: a.start_date ?? new Date().toISOString().slice(0, 10),
              status: "active",
            }).select("id").maybeSingle();
            if (error) throw error;

            // First invoice (admission + first period) — trigger mirrors to fee_payments
            const invoices: any[] = [];
            if (Number(a.admission_fee) > 0) {
              invoices.push({
                workspace_id, registration_id: data?.id, student_id: sid,
                period_label: "Admission Fee",
                period_start: new Date().toISOString().slice(0, 10),
                period_end: new Date().toISOString().slice(0, 10),
                amount: Number(a.admission_fee), kind: "admission", status: "pending",
              });
            }
            if (Number(a.fee_amount) > 0) {
              const today = new Date();
              invoices.push({
                workspace_id, registration_id: data?.id, student_id: sid,

                period_label: today.toLocaleString("en-US", { month: "long", year: "numeric" }),
                period_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
                period_end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
                amount: Number(a.fee_amount), kind: "recurring", status: "pending",
              });
            }
            if (invoices.length) await sb.from("transport_fee_invoices").insert(invoices);
            transportResults.push({ type: a.type, ok: true, registration_id: data?.id, invoices: invoices.length });
          } else if (a.type === "assign_bus") {
            const { data, error } = await sb.from("transport_assignments").insert({
              workspace_id, student_id: a.student_id, route_id: a.route_id ?? null,
              vehicle_id: a.vehicle_id ?? null, stop_id: a.stop_id ?? null,
              pickup_type: a.pickup_type ?? "both",
              monthly_transport_fee: a.monthly_transport_fee ?? null,
              active: true,
            }).select("id").maybeSingle();
            if (error) throw error;
            transportResults.push({ type: a.type, ok: true, assignment_id: data?.id });
          } else {
            transportResults.push({ type: a.type, ok: false, error: "unknown action type" });
          }
        } catch (e: any) {
          transportResults.push({ type: a.type, ok: false, error: e.message });
        }
      }

      const okCount = transportResults.filter(r => r.ok).length;
      const failed = transportResults.filter(r => !r.ok);
      if (transportResults.length) {
        const failLine = failed.length ? `\n❌ ${failed.length} failed: ${failed.map(f => `${f.type} (${f.error})`).join("; ")}` : "";
        cleanResponse = `${cleanResponse}\n\n✅ ${okCount} transport action${okCount === 1 ? "" : "s"} executed.${failLine}`.trim();
      }

    }

    // ── Save to command_history (full AI observability) ────────
    await safeInsert("command_history", {
      workspace_id,
      command: commandText,
      mode: cmdMode,
      intent: inferIntent(commandText),
      model: usedModel,
      command_id: cmdId,
      created_at: new Date(cmdTs).toISOString(),
      response: cleanResponse?.slice(0, 8000) ?? null,
      rag_sources: ragSources,
      latency_ms: Date.now() - cmdStartedAt,
      status: fullResponse ? "success" : "error",
      metadata: {
        students_loaded: students.length,
        teachers_loaded: teachers.length,
        mentors_loaded: mentors.length,
        fee_candidates: feeCandidates.length,
        attendance_candidates: attendanceCandidates.length,
        has_email_drafts: emailDrafts.length > 0,
        has_call_queue: !!callQueue,
        conversation_id: conversation_id ?? null,
        rag_workspace_count: ragSources.filter((s) => s.scope === "workspace").length,
        rag_global_count: ragSources.filter((s) => s.scope === "global").length,
      },
    });


    // ── Save AI message to conversation ─────────────────────────
    if (conversation_id) {
      try {
        await sb.from("ai_messages").insert([
          { conversation_id, role: "user", content: commandText, workspace_id },
          { conversation_id, role: "assistant", content: cleanResponse, workspace_id },
        ]);
        await sb.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation_id);
      } catch (e: any) {
        console.warn("[SAVE_MESSAGES]", e.message);
      }
    }

    return json(200, {
      phase: emailDrafts.length > 0 ? "preview" : "done",
      response: cleanResponse,
      email_drafts: emailDrafts,
      call_queue: callQueue,
      transport_results: transportResults,
      meta: {
        model: usedModel,
        intent: inferIntent(commandText),
        command_id: cmdId,
        ts: cmdTs,
        conversation_id: conversation_id ?? null,
        transport_actions: transportActions.length,
        transport_ok: transportResults.filter(r => r.ok).length,
      },
    });
  } catch (fatal: any) {
    console.error("[CMD_FATAL]", fatal);
    return new Response(JSON.stringify({ ok: false, fatal: true, error: fatal?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
