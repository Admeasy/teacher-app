// Admeasy agent-runtime v4 — FULL school OS
// Streams NDJSON. Uses Lovable AI Gateway (LOVABLE_API_KEY).
// Tools: Students · Teachers · Staff · Fees · Attendance · Transport · Timetable · Communication · Reports · Navigation

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_WA_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "whatsapp:+14155238886";
const MODEL = "google/gemini-2.5-flash";

// External production project (bhjtsmveghanbojpbswk) — command_history + RAG.
const EXT_URL = Deno.env.get("SUPABASE_URL") ?? "https://bhjtsmveghanbojpbswk.supabase.co";
const EXT_ANON =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoanRzbXZlZ2hhbmJvanBic3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDQyMjYsImV4cCI6MjA5MDUyMDIyNn0.IA5w277X-CG9eFU4Dm8xEe80m5wNZd2QUZXXPjd9x2o";

async function fetchKnowledge(
  supabase: ReturnType<typeof createClient>,
  query: string,
  workspaceId: string,
): Promise<{ context: string; sources: any[] }> {
  try {
    if (!LOVABLE_API_KEY || !query?.trim()) return { context: "", sources: [] };
    const embRes = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: query.slice(0, 4000),
        dimensions: 1536,
      }),
    });
    if (!embRes.ok) return { context: "", sources: [] };
    const vec = (await embRes.json())?.data?.[0]?.embedding;
    if (!vec) return { context: "", sources: [] };

    const m = query.match(/\bclass\s*(\d{1,2})\b/i);
    const classHint = m ? m[1] : null;
    const boardMatch = query.match(/\b(CBSE|ICSE|MP|NCERT)\b/i);
    const boardHint = boardMatch ? boardMatch[1].toUpperCase().replace("NCERT", "CBSE") : null;

    const [gRes, wRes] = await Promise.all([
      supabase.rpc("match_global_chunks", {
        query_embedding: vec,
        match_count: 6,
        p_board: boardHint,
        p_class: classHint,
        p_subject: null,
      }),
      supabase.rpc("match_workspace_chunks", {
        query_embedding: vec,
        p_workspace_id: workspaceId,
        match_count: 8,
      }),
    ]);

    const g = Array.isArray((gRes as any)?.data) ? (gRes as any).data : [];
    const w = Array.isArray((wRes as any)?.data) ? (wRes as any).data : [];
    const snip = (t: string | null | undefined) => (t ? (t.length > 500 ? t.slice(0, 500) + "…" : t) : null);
    const merged = [
      ...w.map((r: any) => ({ tag: "[school-upload]", text: r.content })),
      ...g.map((r: any) => ({
        tag: `[${[r.board, r.class && `Class ${r.class}`, r.subject, r.chapter].filter(Boolean).join(" / ") || "academic"}]`,
        text: r.content,
      })),
    ];
    if (!merged.length) return { context: "", sources: [] };
    const sources = [
      ...w.map((r: any) => ({
        scope: "workspace",
        source_name: r.source_name,
        source_type: r.source_type,
        similarity: r.similarity,
        content_snippet: snip(r.content),
      })),
      ...g.map((r: any) => ({
        scope: "global",
        source_name: r.source_name,
        board: r.board,
        class: r.class,
        subject: r.subject,
        similarity: r.similarity,
        content_snippet: snip(r.content),
      })),
    ];
    return { context: merged.map((x) => `${x.tag}\n${x.text}`).join("\n\n---\n\n"), sources };
  } catch {
    return { context: "", sources: [] };
  }
}

async function logCommandHistory(row: Record<string, any>) {
  try {
    await createClient(SUPABASE_URL, SERVICE_KEY).from("command_history").insert(row);
  } catch {
    /* swallow */
  }
}

interface ToolDef {
  name: string;
  description: string;
  needsApproval: boolean;
  parameters: any;
  execute: (input: any, ctx: ToolCtx) => Promise<ToolResult>;
}
interface ToolCtx {
  ws: string;
  supabase: ReturnType<typeof createClient>;
}
interface ToolResult {
  ok: boolean;
  summary: string;
  affected?: Array<{ kind: string; id: string; label: string }>;
  undo?: { tool: string; input: any };
  data?: any;
  error?: string;
}

function sse(controller: ReadableStreamDefaultController, payload: any) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(payload) + "\n"));
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════════════
const tools: Record<string, ToolDef> = {
  // ╔══════════════════════════════════════════╗
  // ║  STUDENTS                                ║
  // ╚══════════════════════════════════════════╝

  query_students: {
    name: "query_students",
    description: "Search/filter students. Supports name, class, section, unpaid fees, low attendance.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Name or student_id fragment" },
        class: { type: "string" },
        section: { type: "string" },
        unpaid_only: { type: "boolean", description: "Only students with due > 0" },
        low_attendance: { type: "boolean", description: "Only students with attendance_pct < 75" },
        limit: { type: "number", default: 50 },
      },
    },
    execute: async ({ search, class: cls, section, unpaid_only, low_attendance, limit = 50 }, { ws, supabase }) => {
      let q = supabase
        .from("students")
        .select(
          "id,name,student_id,class,section,parent_name,parent_phone,parent_email,due,fee_status,attendance_pct,is_active,gender,dob",
        )
        .eq("workspace_id", ws)
        .eq("is_active", true)
        .limit(Math.min(limit, 200));
      if (search) q = q.or(`name.ilike.%${search}%,student_id.ilike.%${search}%`);
      if (cls) q = q.eq("class", cls);
      if (section) q = q.eq("section", section);
      if (unpaid_only) q = q.gt("due", 0);
      if (low_attendance) q = q.lt("attendance_pct", 75);
      const { data, error } = await q;
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Found ${data?.length ?? 0} students`, data };
    },
  },

  add_student: {
    name: "add_student",
    description: "Enroll a new student.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["name", "class", "section"],
      properties: {
        name: { type: "string" },
        class: { type: "string" },
        section: { type: "string" },
        student_id: { type: "string", description: "Custom ID — auto-generated if blank" },
        parent_name: { type: "string" },
        parent_phone: { type: "string" },
        parent_email: { type: "string" },
        dob: { type: "string", description: "YYYY-MM-DD" },
        gender: { type: "string", enum: ["male", "female", "other"] },
        address: { type: "string" },
        total_fees: { type: "number" },
      },
    },
    execute: async (
      {
        name,
        class: cls,
        section,
        student_id,
        parent_name,
        parent_phone,
        parent_email,
        dob,
        gender,
        address,
        total_fees,
      },
      { ws, supabase },
    ) => {
      const sid = student_id ?? `STU${Date.now().toString().slice(-6)}`;
      const { data, error } = await supabase
        .from("students")
        .insert({
          workspace_id: ws,
          name,
          class: cls,
          section,
          student_id: sid,
          parent_name: parent_name ?? null,
          parent_phone: parent_phone ?? null,
          parent_email: parent_email ?? null,
          dob: dob ?? null,
          gender: gender ?? null,
          address: address ?? null,
          total_fees: total_fees ?? 0,
          is_active: true,
          fee_status: "clear",
          due: 0,
          attendance_pct: 0,
        })
        .select("id,name,student_id,class,section")
        .maybeSingle();
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Enrolled ${name} as ${sid} in Class ${cls}-${section}`,
        affected: [{ kind: "student", id: data?.id ?? "", label: name }],
        data,
      };
    },
  },

  update_student: {
    name: "update_student",
    description: "Update any field on a student record.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Student UUID from query_students" },
        name: { type: "string" },
        class: { type: "string" },
        section: { type: "string" },
        parent_name: { type: "string" },
        parent_phone: { type: "string" },
        parent_email: { type: "string" },
        address: { type: "string" },
        gender: { type: "string" },
        dob: { type: "string" },
        is_active: { type: "boolean" },
        total_fees: { type: "number" },
      },
    },
    execute: async ({ id, ...fields }, { ws, supabase }) => {
      const updates = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(updates).length) return { ok: false, summary: "Nothing to update", error: "empty" };
      const { error } = await supabase.from("students").update(updates).eq("workspace_id", ws).eq("id", id);
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Updated student ${id}`, affected: [{ kind: "student", id, label: id }] };
    },
  },

  get_entity_snapshot: {
    name: "get_entity_snapshot",
    description: "Full 360° snapshot for a student or teacher: fees, attendance, contact info.",
    needsApproval: false,
    parameters: {
      type: "object",
      required: ["kind", "id"],
      properties: {
        kind: { type: "string", enum: ["student", "teacher"] },
        id: { type: "string", description: "UUID" },
      },
    },
    execute: async ({ kind, id }, { ws, supabase }) => {
      if (kind === "student") {
        const [{ data: s }, { data: fees }, { data: att }] = await Promise.all([
          supabase.from("students").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle(),
          supabase
            .from("fee_payments")
            .select("amount_due,amount_paid,status,fee_name,fee_type,month_year")
            .eq("workspace_id", ws)
            .eq("student_id", id)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("attendance_records")
            .select("status,date")
            .eq("workspace_id", ws)
            .eq("student_id", id)
            .order("date", { ascending: false })
            .limit(60),
        ]);
        if (!s) return { ok: false, summary: "Student not found", error: "not_found" };
        const calcDue = (fees ?? []).reduce(
          (a: number, r: any) => a + Math.max(0, Number(r.amount_due) - Number(r.amount_paid)),
          0,
        );
        const due = calcDue > 0 ? calcDue : Number(s.due ?? s.amount_due ?? 0);
        const present = (att ?? []).filter((r: any) => r.status === "present").length;
        const calcPct = att?.length ? Math.round((present / att.length) * 100) : null;
        const pct = calcPct ?? (s.attendance_pct != null ? Number(s.attendance_pct) : null);
        return {
          ok: true,
          summary: `${s.name} — due ₹${due}, attendance ${pct ?? "n/a"}%`,
          data: { student: s, due, attendance_pct: pct, recent_attendance: att, fee_rows: fees },
        };
      }
      const { data: t } = await supabase.from("teachers").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
      if (!t) return { ok: false, summary: "Teacher not found", error: "not_found" };
      return { ok: true, summary: (t as any).name, data: { teacher: t } };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  TEACHERS                                ║
  // ╚══════════════════════════════════════════╝

  query_teachers: {
    name: "query_teachers",
    description: "Search teachers by name, subject, or class assignment.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        subject: { type: "string" },
        limit: { type: "number", default: 30 },
      },
    },
    execute: async ({ search, subject, limit = 30 }, { ws, supabase }) => {
      let q = supabase
        .from("teachers")
        .select("id,name,teacher_id,subject,phone,email,salary,assigned_classes,is_active,joining_date")
        .eq("workspace_id", ws)
        .limit(limit);
      if (search) q = q.or(`name.ilike.%${search}%,teacher_id.ilike.%${search}%`);
      if (subject) q = q.ilike("subject", `%${subject}%`);
      const { data, error } = await q;
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Found ${data?.length ?? 0} teachers`, data };
    },
  },

  add_teacher: {
    name: "add_teacher",
    description: "Add a new teaching staff member.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["name", "subject"],
      properties: {
        name: { type: "string" },
        subject: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        salary: { type: "number" },
        joining_date: { type: "string" },
        qualification: { type: "string" },
        assigned_classes: { type: "string", description: "e.g. 9A,9B,10A" },
      },
    },
    execute: async (
      { name, subject, phone, email, salary, joining_date, qualification, assigned_classes },
      { ws, supabase },
    ) => {
      const tid = `TCH${Date.now().toString().slice(-5)}`;
      const { data, error } = await supabase
        .from("teachers")
        .insert({
          workspace_id: ws,
          name,
          subject,
          phone: phone ?? null,
          email: email ?? null,
          salary: salary ?? null,
          joining_date: joining_date ?? null,
          qualification: qualification ?? null,
          assigned_classes: assigned_classes ?? null,
          teacher_id: tid,
          is_active: true,
        })
        .select("id,name,teacher_id")
        .maybeSingle();
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Added teacher ${name} — ${subject}`,
        affected: [{ kind: "teacher", id: data?.id ?? "", label: name }],
        data,
      };
    },
  },

  update_teacher: {
    name: "update_teacher",
    description: "Update a teacher's record.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        subject: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        salary: { type: "number" },
        assigned_classes: { type: "string" },
        is_active: { type: "boolean" },
      },
    },
    execute: async ({ id, ...fields }, { ws, supabase }) => {
      const updates = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(updates).length) return { ok: false, summary: "Nothing to update", error: "empty" };
      const { error } = await supabase.from("teachers").update(updates).eq("workspace_id", ws).eq("id", id);
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Updated teacher ${id}`, affected: [{ kind: "teacher", id, label: id }] };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  NON-TEACHING STAFF                      ║
  // ╚══════════════════════════════════════════╝

  query_staff: {
    name: "query_staff",
    description: "Search non-teaching staff: receptionist, peon, guard, librarian, accountant, clerk, driver, etc.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        role: { type: "string" },
        department_tag: { type: "string" },
        limit: { type: "number", default: 30 },
      },
    },
    execute: async ({ search, role, department_tag, limit = 30 }, { ws, supabase }) => {
      let q = supabase
        .from("non_teaching_staff")
        .select("id,name,role,sub_role,department_tag,phone,email,salary,active,joining_date,address")
        .eq("workspace_id", ws)
        .limit(limit);
      if (search) q = q.ilike("name", `%${search}%`);
      if (role) q = q.ilike("role", `%${role}%`);
      if (department_tag) q = q.eq("department_tag", department_tag);
      const { data, error } = await q;
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Found ${data?.length ?? 0} staff`, data };
    },
  },

  add_non_teaching_staff: {
    name: "add_non_teaching_staff",
    description:
      "Add non-teaching staff. Any role: receptionist, peon, guard, librarian, accountant, clerk, driver, conductor, helper, sweeper, cook, nurse, IT staff, or anything else.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["name", "role"],
      properties: {
        name: { type: "string" },
        role: {
          type: "string",
          description:
            "receptionist|peon|guard|librarian|accountant|clerk|driver|conductor|helper|sweeper|cook|nurse|IT|other",
        },
        sub_role: { type: "string", description: "More specific title" },
        department_tag: { type: "string", description: "admin|transport|accounts|library|housekeeping|medical|IT" },
        phone: { type: "string" },
        email: { type: "string" },
        salary: { type: "number" },
        joining_date: { type: "string", description: "YYYY-MM-DD" },
        address: { type: "string" },
        license_number: { type: "string", description: "For drivers" },
      },
    },
    execute: async (
      { name, role, sub_role, department_tag, phone, email, salary, joining_date, address, license_number },
      { ws, supabase },
    ) => {
      const r = role.toLowerCase();
      const dept =
        department_tag ??
        (["driver", "conductor", "helper"].includes(r)
          ? "transport"
          : ["accountant", "clerk"].includes(r)
            ? "accounts"
            : r === "librarian"
              ? "library"
              : r === "nurse"
                ? "medical"
                : ["it", "tech"].includes(r)
                  ? "IT"
                  : "admin");
      const { data, error } = await supabase
        .from("non_teaching_staff")
        .insert({
          workspace_id: ws,
          name,
          role,
          sub_role: sub_role ?? null,
          department_tag: dept,
          phone: phone ?? null,
          email: email ?? null,
          salary: salary ?? null,
          joining_date: joining_date ?? new Date().toISOString().slice(0, 10),
          address: address ?? null,
          license_number: license_number ?? null,
          active: true,
          status: "active",
        })
        .select("id,name,role,department_tag")
        .maybeSingle();
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Added ${role} — ${name} (dept: ${dept})`,
        affected: [{ kind: "non_teaching_staff", id: data?.id ?? "", label: `${name} (${role})` }],
        data,
      };
    },
  },

  update_staff: {
    name: "update_staff",
    description: "Update a non-teaching staff member's record.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        role: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        salary: { type: "number" },
        department_tag: { type: "string" },
        active: { type: "boolean" },
      },
    },
    execute: async ({ id, ...fields }, { ws, supabase }) => {
      const updates = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(updates).length) return { ok: false, summary: "Nothing to update", error: "empty" };
      const { error } = await supabase.from("non_teaching_staff").update(updates).eq("workspace_id", ws).eq("id", id);
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Updated staff ${id}`, affected: [{ kind: "non_teaching_staff", id, label: id }] };
    },
  },

  deactivate_record: {
    name: "deactivate_record",
    description: "Soft-delete (deactivate) a student, teacher, or staff member.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["kind", "id"],
      properties: {
        kind: { type: "string", enum: ["student", "teacher", "non_teaching_staff"] },
        id: { type: "string" },
        reason: { type: "string" },
      },
    },
    execute: async ({ kind, id, reason }, { ws, supabase }) => {
      const table = kind === "non_teaching_staff" ? "non_teaching_staff" : kind === "teacher" ? "teachers" : "students";
      const flag = kind === "non_teaching_staff" ? "active" : "is_active";
      const { error } = await supabase
        .from(table)
        .update({ [flag]: false })
        .eq("workspace_id", ws)
        .eq("id", id);
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Deactivated ${kind} ${id}${reason ? ` — ${reason}` : ""}`,
        affected: [{ kind, id, label: id }],
      };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  FEES                                    ║
  // ╚══════════════════════════════════════════╝

  query_fees: {
    name: "query_fees",
    description: "Fetch fee payment rows. Filter by student, status, or month.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        student_id: { type: "string" },
        status: { type: "string", enum: ["pending", "paid", "partial", "overdue"] },
        month_year: { type: "string", description: "e.g. May-2025" },
        limit: { type: "number", default: 30 },
      },
    },
    execute: async ({ student_id, status, month_year, limit = 30 }, { ws, supabase }) => {
      let q = supabase
        .from("fee_payments")
        .select("id,student_id,fee_name,fee_type,amount_due,amount_paid,status,payment_date,month_year,payment_mode")
        .eq("workspace_id", ws)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (student_id) q = q.eq("student_id", student_id);
      if (status) q = q.eq("status", status);
      if (month_year) q = q.eq("month_year", month_year);
      const { data, error } = await q;
      if (error) return { ok: false, summary: error.message, error: error.message };
      const total = (data ?? []).reduce((a: number, r: any) => a + Number(r.amount_due ?? 0), 0);
      const collected = (data ?? []).reduce((a: number, r: any) => a + Number(r.amount_paid ?? 0), 0);
      return { ok: true, summary: `${data?.length ?? 0} rows — due ₹${total - collected} of ₹${total}`, data };
    },
  },

  add_fee_payment: {
    name: "add_fee_payment",
    description: "Create a new fee entry / demand for a student.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["student_id", "fee_name", "amount_due"],
      properties: {
        student_id: { type: "string" },
        fee_name: { type: "string", description: "e.g. Tuition Fee, Transport Fee, Lab Fee" },
        fee_type: { type: "string", description: "tuition|transport|exam|activity|library|other" },
        amount_due: { type: "number" },
        month_year: { type: "string", description: "e.g. May-2025" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
    execute: async ({ student_id, fee_name, fee_type, amount_due, month_year, due_date }, { ws, supabase }) => {
      const { data, error } = await supabase
        .from("fee_payments")
        .insert({
          workspace_id: ws,
          student_id,
          fee_name,
          fee_type: fee_type ?? "tuition",
          amount_due,
          amount_paid: 0,
          status: "pending",
          month_year: month_year ?? null,
          due_date: due_date ?? null,
        })
        .select("id,fee_name,amount_due")
        .maybeSingle();
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Added fee demand: ${fee_name} ₹${amount_due}`,
        affected: [{ kind: "fee_payment", id: data?.id ?? "", label: fee_name }],
        data,
      };
    },
  },

  mark_fee_paid: {
    name: "mark_fee_paid",
    description: "Record payment against a fee_payments row.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["fee_payment_id"],
      properties: {
        fee_payment_id: { type: "string" },
        amount_paid: { type: "number", description: "Leave blank to pay full amount_due" },
        payment_mode: { type: "string", default: "cash", description: "cash|upi|cheque|bank_transfer|card" },
        remarks: { type: "string" },
      },
    },
    execute: async ({ fee_payment_id, amount_paid, payment_mode = "cash", remarks }, { ws, supabase }) => {
      const { data: prev } = await supabase
        .from("fee_payments")
        .select("amount_due,amount_paid,status,fee_name,student_id")
        .eq("workspace_id", ws)
        .eq("id", fee_payment_id)
        .maybeSingle();
      if (!prev) return { ok: false, summary: "Fee row not found", error: "not_found" };
      const paid = amount_paid ?? prev.amount_due;
      const newStatus = paid >= prev.amount_due ? "paid" : "partial";
      const { error } = await supabase
        .from("fee_payments")
        .update({
          amount_paid: paid,
          status: newStatus,
          payment_mode,
          payment_date: new Date().toISOString().slice(0, 10),
          remarks: remarks ?? "Marked paid by AI",
        })
        .eq("workspace_id", ws)
        .eq("id", fee_payment_id);
      if (error) return { ok: false, summary: error.message, error: error.message };
      // sync student.due field
      try {
        await supabase.rpc("refresh_student_due", { p_student_id: prev.student_id, p_workspace_id: ws });
      } catch {
        /* optional rpc */
      }
      return {
        ok: true,
        summary: `Paid ₹${paid} for ${prev.fee_name} (${newStatus})`,
        affected: [{ kind: "fee_payment", id: fee_payment_id, label: prev.fee_name }],
        undo: {
          tool: "mark_fee_paid_undo",
          input: { fee_payment_id, amount_paid: prev.amount_paid, status: prev.status },
        },
      };
    },
  },

  bulk_fee_reminder: {
    name: "bulk_fee_reminder",
    description: "Queue WhatsApp/SMS reminders for all students with pending fees. Sends via Twilio.",
    needsApproval: true,
    parameters: {
      type: "object",
      properties: {
        class: { type: "string", description: "Filter by class (optional)" },
        min_due: { type: "number", description: "Only remind if due >= this amount", default: 1 },
        message_template: { type: "string", description: "Use {name}, {due}, {school} as placeholders" },
        channel: { type: "string", enum: ["whatsapp", "sms"], default: "whatsapp" },
      },
    },
    execute: async ({ class: cls, min_due = 1, message_template, channel = "whatsapp" }, { ws, supabase }) => {
      let q = supabase
        .from("students")
        .select("id,name,parent_phone,parent_name,due,class,section")
        .eq("workspace_id", ws)
        .eq("is_active", true)
        .gte("due", min_due);
      if (cls) q = q.eq("class", cls);
      const { data: students, error } = await q;
      if (error) return { ok: false, summary: error.message, error: error.message };
      if (!students?.length) return { ok: true, summary: "No students with pending fees found", data: { count: 0 } };

      if (!TWILIO_SID || !TWILIO_TOKEN) {
        return {
          ok: false,
          summary: "Twilio not configured",
          error: "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN",
        };
      }

      const defaultTemplate =
        "Dear {parent_name}, fee of ₹{due} is due for {name} (Class {class}). Please clear at the earliest. — School";
      const tmpl = message_template ?? defaultTemplate;

      const results: any[] = [];
      for (const s of students) {
        if (!s.parent_phone) {
          results.push({ name: s.name, status: "skipped_no_phone" });
          continue;
        }
        let phone = String(s.parent_phone).replace(/\D/g, "");
        if (!phone.startsWith("91")) phone = "91" + phone;
        phone = "+" + phone;
        const body = tmpl
          .replace("{name}", s.name)
          .replace("{due}", String(s.due))
          .replace("{parent_name}", s.parent_name ?? "Parent")
          .replace("{class}", `${s.class}-${s.section}`)
          .replace("{school}", "School");
        try {
          const from = channel === "whatsapp" ? TWILIO_WA_FROM : (Deno.env.get("TWILIO_SMS_FROM") ?? "");
          const to = channel === "whatsapp" ? `whatsapp:${phone}` : phone;
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
          });
          results.push({ name: s.name, phone, status: r.ok ? "sent" : "failed", code: r.status });
        } catch (e: any) {
          results.push({ name: s.name, status: "error", error: e.message });
        }
      }
      const sent = results.filter((r) => r.status === "sent").length;
      return {
        ok: true,
        summary: `Fee reminders: ${sent}/${students.length} sent via ${channel}`,
        data: { total: students.length, sent, results },
      };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  ATTENDANCE                              ║
  // ╚══════════════════════════════════════════╝

  mark_attendance: {
    name: "mark_attendance",
    description: "Mark attendance for one student on a given date.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["student_id", "status"],
      properties: {
        student_id: { type: "string" },
        status: { type: "string", enum: ["present", "absent", "late", "leave"] },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        remarks: { type: "string" },
      },
    },
    execute: async ({ student_id, status, date, remarks }, { ws, supabase }) => {
      const d = date ?? new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("attendance_records")
        .upsert(
          { workspace_id: ws, student_id, date: d, status, remarks: remarks ?? null },
          { onConflict: "workspace_id,student_id,date" },
        );
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Marked ${status} for student ${student_id} on ${d}`,
        affected: [{ kind: "attendance", id: student_id, label: `${student_id} ${d}` }],
      };
    },
  },

  bulk_mark_attendance: {
    name: "bulk_mark_attendance",
    description: "Mark all students in a class/section as present (or absent) for today. Fast bulk operation.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["class", "section", "default_status"],
      properties: {
        class: { type: "string" },
        section: { type: "string" },
        default_status: { type: "string", enum: ["present", "absent"], default: "present" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        absent_ids: {
          type: "array",
          items: { type: "string" },
          description: "UUIDs to mark absent if default_status is present",
        },
      },
    },
    execute: async ({ class: cls, section, default_status = "present", date, absent_ids = [] }, { ws, supabase }) => {
      const d = date ?? new Date().toISOString().slice(0, 10);
      const { data: students, error: se } = await supabase
        .from("students")
        .select("id")
        .eq("workspace_id", ws)
        .eq("class", cls)
        .eq("section", section)
        .eq("is_active", true);
      if (se) return { ok: false, summary: se.message, error: se.message };
      if (!students?.length)
        return { ok: false, summary: `No students found in Class ${cls}-${section}`, error: "no_students" };

      const absentSet = new Set(absent_ids);
      const records = students.map((s: any) => ({
        workspace_id: ws,
        student_id: s.id,
        date: d,
        status: absentSet.has(s.id) ? (default_status === "present" ? "absent" : "present") : default_status,
      }));
      const { error } = await supabase
        .from("attendance_records")
        .upsert(records, { onConflict: "workspace_id,student_id,date" });
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Marked ${records.length} students in Class ${cls}-${section} for ${d}`,
        data: { count: records.length, date: d },
      };
    },
  },

  get_attendance_report: {
    name: "get_attendance_report",
    description: "Get attendance summary for a class/section or specific student over a date range.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        student_id: { type: "string" },
        class: { type: "string" },
        section: { type: "string" },
        from_date: { type: "string", description: "YYYY-MM-DD" },
        to_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
    execute: async ({ student_id, class: cls, section, from_date, to_date }, { ws, supabase }) => {
      let q = supabase.from("attendance_records").select("student_id,status,date").eq("workspace_id", ws);
      if (student_id) q = q.eq("student_id", student_id);
      if (from_date) q = q.gte("date", from_date);
      if (to_date) q = q.lte("date", to_date);
      if (cls || section) {
        const { data: sids } = await supabase
          .from("students")
          .select("id")
          .eq("workspace_id", ws)
          .eq("class", cls ?? "")
          .eq("section", section ?? "");
        if (sids?.length)
          q = q.in(
            "student_id",
            sids.map((s: any) => s.id),
          );
      }
      const { data, error } = await q.order("date", { ascending: false }).limit(500);
      if (error) return { ok: false, summary: error.message, error: error.message };
      const byStudent: Record<string, any> = {};
      for (const r of data ?? []) {
        if (!byStudent[r.student_id]) byStudent[r.student_id] = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
        byStudent[r.student_id][r.status] = (byStudent[r.student_id][r.status] ?? 0) + 1;
        byStudent[r.student_id].total++;
      }
      return {
        ok: true,
        summary: `Attendance report: ${Object.keys(byStudent).length} students, ${data?.length} records`,
        data: { summary_by_student: byStudent, records: data },
      };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  TRANSPORT                               ║
  // ╚══════════════════════════════════════════╝

  query_transport: {
    name: "query_transport",
    description: "Get transport overview: vehicles, routes, pending fees, overloaded buses.",
    needsApproval: false,
    parameters: { type: "object", properties: {} },
    execute: async (_input, { ws, supabase }) => {
      const [v, r, a, tf] = await Promise.all([
        supabase.from("transport_vehicles").select("id,vehicle_number,capacity,route_id,active").eq("workspace_id", ws),
        supabase.from("transport_routes").select("id,route_name,route_code,monthly_fee,active").eq("workspace_id", ws),
        supabase
          .from("transport_assignments")
          .select("id,student_id,vehicle_id,route_id,active")
          .eq("workspace_id", ws)
          .eq("active", true),
        supabase
          .from("transport_fees")
          .select("id,student_id,amount,status")
          .eq("workspace_id", ws)
          .in("status", ["pending", "overdue"]),
      ]);
      const vehicles = v.data ?? [];
      const routes = r.data ?? [];
      const assignments = a.data ?? [];
      const pendingFees = tf.data ?? [];
      const overloaded = vehicles
        .filter((veh) => {
          const count = assignments.filter((a: any) => a.vehicle_id === veh.id).length;
          return veh.capacity && count > veh.capacity;
        })
        .map((veh) => ({
          vehicle: veh.vehicle_number,
          capacity: veh.capacity,
          riders: assignments.filter((a: any) => a.vehicle_id === veh.id).length,
        }));
      return {
        ok: true,
        summary: `${vehicles.length} vehicles, ${routes.length} routes, ${assignments.length} riders, ${pendingFees.length} pending fees`,
        data: {
          vehicles,
          routes,
          active_riders: assignments.length,
          pending_transport_fees: pendingFees.length,
          overloaded_buses: overloaded,
        },
      };
    },
  },

  register_student_transport: {
    name: "register_student_transport",
    description: "Register a student on a transport route.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["student_id", "route_id"],
      properties: {
        student_id: { type: "string" },
        route_id: { type: "string" },
        vehicle_id: { type: "string" },
        monthly_fee: { type: "number" },
        pickup_type: { type: "string", enum: ["pickup", "drop", "both"], default: "both" },
      },
    },
    execute: async ({ student_id, route_id, vehicle_id, monthly_fee, pickup_type = "both" }, { ws, supabase }) => {
      const { data, error } = await supabase
        .from("transport_assignments")
        .insert({
          workspace_id: ws,
          student_id,
          route_id,
          vehicle_id: vehicle_id ?? null,
          pickup_type,
          monthly_transport_fee: monthly_fee ?? null,
          active: true,
        })
        .select("id")
        .maybeSingle();
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Registered student ${student_id} on route ${route_id}`,
        affected: [{ kind: "transport_assignment", id: data?.id ?? "", label: student_id }],
      };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  TIMETABLE                               ║
  // ╚══════════════════════════════════════════╝

  query_timetable: {
    name: "query_timetable",
    description: "Get today's or any day's timetable for a class/section.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        class: { type: "string" },
        section: { type: "string" },
        day: { type: "string", description: "MON|TUE|WED|THU|FRI|SAT — defaults to today" },
      },
    },
    execute: async ({ class: cls, section, day }, { ws, supabase }) => {
      const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      const d = day ?? days[new Date().getDay()];
      let q = supabase
        .from("timetable")
        .select("class,section,day,period_number,subject,teacher_name")
        .eq("workspace_id", ws)
        .eq("day", d)
        .order("class")
        .order("period_number");
      if (cls) q = q.eq("class", cls);
      if (section) q = q.eq("section", section);
      const { data, error } = await q;
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `${d} timetable: ${data?.length ?? 0} periods`, data };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  COMMUNICATION                           ║
  // ╚══════════════════════════════════════════╝

  send_email: {
    name: "send_email",
    description: "Send a transactional email via Resend.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to: { type: "string", description: "Email or comma-separated emails" },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text body (auto-converted to HTML)" },
        from_name: { type: "string", default: "Admeasy School" },
      },
    },
    execute: async ({ to, subject, body, from_name = "Admeasy School" }, _ctx) => {
      if (!RESEND_KEY) return { ok: false, summary: "Resend not configured", error: "Missing RESEND_API_KEY" };
      const html = `<div style="font-family:sans-serif;max-width:600px;padding:24px;line-height:1.7">${body.replace(/\n/g, "<br>")}<hr style="margin-top:32px;border:none;border-top:1px solid #eee"/><p style="color:#aaa;font-size:11px">Sent via Admeasy AI</p></div>`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${from_name} <team@school.admeasy.in>`,
          to: to.split(",").map((e: string) => e.trim()),
          subject,
          html,
        }),
      });
      const j = await r.json().catch(() => ({}));
      return r.ok
        ? { ok: true, summary: `Email sent to ${to}`, data: { id: j.id } }
        : { ok: false, summary: `Resend failed: ${j.message ?? r.status}`, error: j.message };
    },
  },

  send_whatsapp: {
    name: "send_whatsapp",
    description: "Send WhatsApp messages to one or more parents via Twilio.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["recipients"],
      properties: {
        recipients: {
          type: "array",
          items: {
            type: "object",
            properties: { phone: { type: "string" }, message: { type: "string" } },
          },
        },
      },
    },
    execute: async ({ recipients }, _ctx) => {
      if (!TWILIO_SID || !TWILIO_TOKEN)
        return { ok: false, summary: "Twilio not configured", error: "Missing credentials" };
      const results: any[] = [];
      for (const rec of recipients) {
        let phone = String(rec.phone).replace(/\D/g, "");
        if (!phone.startsWith("91")) phone = "91" + phone;
        try {
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ From: TWILIO_WA_FROM, To: `whatsapp:+${phone}`, Body: rec.message }).toString(),
          });
          results.push({ phone, status: r.ok ? "sent" : "failed", code: r.status });
        } catch (e: any) {
          results.push({ phone, status: "error", error: e.message });
        }
      }
      const sent = results.filter((r) => r.status === "sent").length;
      return { ok: true, summary: `WhatsApp: ${sent}/${recipients.length} sent`, data: { sent, results } };
    },
  },

  // ╔══════════════════════════════════════════╗
  // ║  NAVIGATION + UTILS                      ║
  // ╚══════════════════════════════════════════╝

  navigate: {
    name: "navigate",
    description: "Navigate the app to a different page. Use for 'open X', 'go to X', 'show me X'.",
    needsApproval: false,
    parameters: {
      type: "object",
      required: ["route"],
      properties: {
        route: {
          type: "string",
          enum: [
            "/dashboard",
            "/students",
            "/students/all",
            "/teachers",
            "/staff",
            "/dashboard/fees/payments",
            "/dashboard/fees/reports",
            "/dashboard/fees/structure",
            "/dashboard/transport",
            "/dashboard/payroll",
            "/settings",
            "/calendar",
            "/notifications",
            "/knowledge",
            "/logs",
            "/results",
            "/integrations",
            "/inbox",
            "/data",
            "/voice",
          ],
        },
        reason: { type: "string" },
      },
    },
    execute: async ({ route, reason }, _ctx) => {
      const ALIAS: Record<string, string> = {
        "/": "/dashboard",
        "/fees": "/dashboard/fees/payments",
        "/fees/payments": "/dashboard/fees/payments",
        "/fees/reports": "/dashboard/fees/reports",
        "/fees/structure": "/dashboard/fees/structure",
        "/transport": "/dashboard/transport",
        "/payroll": "/dashboard/payroll",
      };
      const resolved = ALIAS[route] ?? route;
      return { ok: true, summary: `Navigating to ${resolved}`, data: { route: resolved } };
    },
  },

  pay_salary: {
    name: "pay_salary",
    description: "Record a salary payment for a teacher or non-teaching staff for a given month (YYYY-MM).",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["name", "month_year", "amount"],
      properties: {
        name: { type: "string", description: "Name of teacher or staff (fuzzy match)" },
        staff_type: { type: "string", enum: ["teacher", "non_teaching"], default: "teacher" },
        month_year: { type: "string", description: "YYYY-MM e.g. 2026-05" },
        amount: { type: "number" },
        payment_method: { type: "string", default: "bank_transfer" },
        transaction_ref: { type: "string" },
        notes: { type: "string" },
      },
    },
    execute: async ({ name, staff_type = "teacher", month_year, amount, payment_method = "bank_transfer", transaction_ref, notes }, { ws, supabase }) => {
      const table = staff_type === "non_teaching" ? "non_teaching_staff" : "teachers";
      const { data: matches } = await supabase.from(table).select("id,name").eq("workspace_id", ws).ilike("name", `%${name}%`).limit(2);
      if (!matches?.length) return { ok: false, summary: `No ${staff_type} matches "${name}"`, error: "not_found" };
      if (matches.length > 1) return { ok: false, summary: `Multiple matches for "${name}": ${matches.map((m: any) => m.name).join(", ")}`, error: "ambiguous" };
      const row: any = {
        workspace_id: ws,
        month_year,
        amount,
        payment_method,
        transaction_ref: transaction_ref ?? null,
        notes: notes ?? null,
        staff_type,
        paid_at: new Date().toISOString(),
      };
      if (staff_type === "non_teaching") row.staff_id = matches[0].id;
      else row.teacher_id = matches[0].id;
      const { data, error } = await supabase.from("salary_payments").insert(row).select("id").maybeSingle();
      if (error) return { ok: false, summary: error.message, error: error.message };
      return {
        ok: true,
        summary: `Paid ₹${amount} to ${matches[0].name} for ${month_year}`,
        affected: [{ kind: "salary_payment", id: data?.id ?? "", label: matches[0].name }],
      };
    },
  },

  pay_student_fees_by_roll: {
    name: "pay_student_fees_by_roll",
    description: "Mark fees paid for a student identified by roll number / student_id or name.",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["identifier", "amount"],
      properties: {
        identifier: { type: "string", description: "Roll number, student_id, or name" },
        amount: { type: "number" },
        fee_type: { type: "string", default: "Tuition" },
        month_year: { type: "string", description: "YYYY-MM" },
        payment_method: { type: "string", default: "cash" },
        transaction_ref: { type: "string" },
      },
    },
    execute: async ({ identifier, amount, fee_type = "Tuition", month_year, payment_method = "cash", transaction_ref }, { ws, supabase }) => {
      const { data: matches } = await supabase
        .from("students")
        .select("id,name,student_id,class,section,due,total_fees")
        .eq("workspace_id", ws)
        .or(`student_id.ilike.%${identifier}%,name.ilike.%${identifier}%`)
        .limit(3);
      if (!matches?.length) return { ok: false, summary: `No student matches "${identifier}"`, error: "not_found" };
      if (matches.length > 1) return { ok: false, summary: `Ambiguous: ${matches.map((m: any) => `${m.name} (${m.student_id})`).join(", ")}`, error: "ambiguous" };
      const s: any = matches[0];
      const my = month_year ?? new Date().toISOString().slice(0, 7);
      const { data, error } = await supabase.from("fee_payments").insert({
        workspace_id: ws,
        student_id: s.id,
        fee_type,
        fee_name: fee_type,
        class: s.class,
        amount_due: amount,
        amount_paid: amount,
        status: "paid",
        month_year: my,
        payment_method,
        transaction_ref: transaction_ref ?? null,
        paid_at: new Date().toISOString(),
        is_manual_entry: true,
      }).select("id").maybeSingle();
      if (error) return { ok: false, summary: error.message, error: error.message };
      const newDue = Math.max(0, (s.due ?? 0) - amount);
      await supabase.from("students").update({ due: newDue, fee_status: newDue === 0 ? "clear" : "partial" }).eq("id", s.id);
      return {
        ok: true,
        summary: `Collected ₹${amount} ${fee_type} from ${s.name} (${s.student_id})`,
        affected: [{ kind: "fee_payment", id: data?.id ?? "", label: s.name }],
      };
    },
  },

  update_workspace_setting: {
    name: "update_workspace_setting",
    description: "Update a single setting key in the workspace settings JSON (school name, address, theme, periods, etc.).",
    needsApproval: true,
    parameters: {
      type: "object",
      required: ["key", "value"],
      properties: {
        key: { type: "string", description: "Setting key e.g. school_name, address, periods_per_day" },
        value: {},
      },
    },
    execute: async ({ key, value }, { ws, supabase }) => {
      const { error } = await supabase.rpc("set_workspace_setting", { _ws: ws, _key: key, _value: value });
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Updated setting "${key}"`, affected: [{ kind: "setting", id: key, label: key }] };
    },
  },

  suggest_substitutions: {
    name: "suggest_substitutions",
    description: "When a teacher is absent, list other teachers who are free during that teacher's classes for a given date.",
    needsApproval: false,
    parameters: {
      type: "object",
      required: ["absent_teacher"],
      properties: {
        absent_teacher: { type: "string", description: "Name of absent teacher" },
        date: { type: "string", description: "YYYY-MM-DD (default today)" },
      },
    },
    execute: async ({ absent_teacher, date }, { ws, supabase }) => {
      const dt = date ?? new Date().toISOString().slice(0, 10);
      const dow = new Date(dt).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      const { data: t } = await supabase.from("teachers").select("id,name").eq("workspace_id", ws).ilike("name", `%${absent_teacher}%`).maybeSingle();
      if (!t) return { ok: false, summary: `Teacher "${absent_teacher}" not found`, error: "not_found" };
      const { data: slots } = await supabase.from("timetable_entries").select("id,period,class,section,subject,day").eq("workspace_id", ws).eq("teacher_id", (t as any).id).ilike("day", dow);
      if (!slots?.length) return { ok: true, summary: `${(t as any).name} has no classes on ${dow}`, data: [] };
      const periods = (slots as any[]).map((s) => s.period);
      const { data: busy } = await supabase.from("timetable_entries").select("teacher_id,period").eq("workspace_id", ws).ilike("day", dow).in("period", periods);
      const { data: allTeachers } = await supabase.from("teachers").select("id,name,subject").eq("workspace_id", ws).neq("id", (t as any).id);
      const suggestions = (slots as any[]).map((slot) => {
        const busyIds = new Set((busy ?? []).filter((b: any) => b.period === slot.period).map((b: any) => b.teacher_id));
        const free = (allTeachers ?? []).filter((tt: any) => !busyIds.has(tt.id)).slice(0, 5);
        return { period: slot.period, class: `${slot.class}-${slot.section}`, subject: slot.subject, free_teachers: free.map((f: any) => f.name) };
      });
      return { ok: true, summary: `Found ${suggestions.length} period(s) needing cover for ${(t as any).name}`, data: suggestions };
    },
  },

  query_leave_requests: {
    name: "query_leave_requests",
    description: "List leave requests (teachers + students) with optional status / date filters.",
    needsApproval: false,
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "rejected"] },
        applicant_type: { type: "string", enum: ["teacher", "student", "all"], default: "all" },
        from_date: { type: "string", description: "YYYY-MM-DD" },
        limit: { type: "number", default: 50 },
      },
    },
    execute: async ({ status, applicant_type = "all", from_date, limit = 50 }, { ws, supabase }) => {
      let q = supabase.from("leave_requests").select("id,applicant_type,applicant_name,from_date,to_date,reason,status,created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(Math.min(limit, 200));
      if (status) q = q.eq("status", status);
      if (applicant_type !== "all") q = q.eq("applicant_type", applicant_type);
      if (from_date) q = q.gte("from_date", from_date);
      const { data, error } = await q;
      if (error) return { ok: false, summary: error.message, error: error.message };
      return { ok: true, summary: `Found ${data?.length ?? 0} leave request(s)`, data };
    },
  },

  log_activity: {
    name: "log_activity",
    description: "Push a short label to the activity stream.",
    needsApproval: false,
    parameters: {
      type: "object",
      required: ["label"],
      properties: { label: { type: "string" }, kind: { type: "string", default: "tool" } },
    },
    execute: async ({ label, kind = "tool" }, { ws, supabase }) => {
      await supabase.from("ai_activity_stream").insert({ workspace_id: ws, label, kind });
      return { ok: true, summary: label };
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════
function buildSystemPrompt(ctx: any): string {
  return [
    "You are Admeasy AI — autonomous school operating system for Indian schools.",
    "You EXECUTE through tools. Never refuse if a matching tool exists.",
    "Rules:",
    "- 'add receptionist/peon/guard/clerk/nurse/IT staff/any non-teacher' → add_non_teaching_staff",
    "- 'add teacher/faculty' → add_teacher",
    "- 'add student/enroll' → add_student",
    "- 'open/go to/show X page' → navigate",
    "- 'mark fees paid/collected' → mark_fee_paid (first query_fees to get fee_payment_id if needed)",
    "- 'send fee reminders to all' → bulk_fee_reminder",
    "- 'mark attendance for class X' → bulk_mark_attendance",
    "- 'WhatsApp parents' → send_whatsapp",
    "- 'email X' → send_email",
    "- 'pay salary to <name> for <month>' → pay_salary (auto-detect teacher vs non_teaching)",
    "- 'collect/pay fees from <roll or name>' → pay_student_fees_by_roll",
    "- 'change school name / address / setting X' → update_workspace_setting",
    "- '<teacher> is absent / suggest substitute' → suggest_substitutions",
    "- 'show leave requests / who applied for leave' → query_leave_requests",
    "- Missing optional fields (phone, salary, email)? Set null. Don't block.",
    "- Be terse. Say what was DONE, not what you WILL do.",
    "- Chain tools: if you need an ID first, call query_students/query_teachers then act.",
    "",
    "## Page context",
    JSON.stringify(
      {
        route: ctx?.route,
        routeLabel: ctx?.routeLabel,
        entity: ctx?.entity,
        entityId: ctx?.entityId,
        entityLabel: ctx?.entityLabel,
        visibleIds: ctx?.visibleIds?.slice(0, 30),
        tab: ctx?.tab,
        filters: ctx?.filters,
      },
      null,
      2,
    ),
    ...(ctx?.recentActions?.length
      ? [
          "",
          "## Recent actions",
          ctx.recentActions
            .slice(0, 5)
            .map((a: any) => `- ${a.tool}: ${a.summary}`)
            .join("\n"),
        ]
      : []),
  ].join("\n");
}

function toolSchemas() {
  return Object.values(tools).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: `${t.description}${t.needsApproval ? " [requires user confirmation]" : ""}`,
      parameters: t.parameters,
    },
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { workspace_id, prompt, context, conversation_id } = body ?? {};
  if (!workspace_id || !prompt) {
    return new Response(JSON.stringify({ error: "workspace_id and prompt required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let workflowId: string | null = null;
      let assistantText = "";
      let runError: string | null = null;
      const toolsUsed: string[] = [];

      // Fetch workspace RAG context BEFORE the AI call so every prompt uses uploaded knowledge.
      const { context: knowledge, sources: ragSources } = await fetchKnowledge(supabase, prompt, workspace_id);

      try {
        const { data: wf } = await supabase
          .from("ai_workflows")
          .insert({
            workspace_id,
            conversation_id,
            prompt,
            context_snapshot: context ?? {},
            status: "running",
          })
          .select("id")
          .single();
        workflowId = (wf as any)?.id ?? null;

        const sysPrompt =
          buildSystemPrompt(context) +
          (knowledge
            ? `\n\n## KNOWLEDGE BASE (authoritative — cite or use when relevant to the user's question)\n${knowledge}`
            : "");

        const messages: any[] = [
          { role: "system", content: sysPrompt },
          { role: "user", content: prompt },
        ];

        let stepCount = 0;
        const MAX_STEPS = 10;

        while (stepCount < MAX_STEPS) {
          stepCount++;

          const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
            body: JSON.stringify({
              model: MODEL,
              messages,
              tools: toolSchemas(),
              tool_choice: "auto",
              metadata: { workspace_id, rag_hits: ragSources.length },
            }),
          });

          if (!aiRes.ok) {
            const errTxt = await aiRes.text();
            const errMsg =
              aiRes.status === 429
                ? "Rate limit — try again."
                : aiRes.status === 402
                  ? "AI credits exhausted — check Lovable billing."
                  : `Gateway ${aiRes.status}: ${errTxt.slice(0, 200)}`;
            sse(controller, { kind: "error", error: errMsg });
            throw new Error(`gateway ${aiRes.status}`);
          }

          const ai = await aiRes.json();
          const msg = ai.choices?.[0]?.message;
          if (!msg) {
            sse(controller, { kind: "error", error: "Empty AI response" });
            break;
          }

          messages.push(msg);

          const toolCalls = msg.tool_calls ?? [];
          if (!toolCalls.length) {
            if (msg.content) {
              assistantText += msg.content;
              sse(controller, { kind: "text", text: msg.content });
            }
            break;
          }

          for (const tc of toolCalls) {
            const name = tc.function?.name;
            const tool = tools[name];
            const callId = tc.id;
            if (name) toolsUsed.push(name);

            let input: any = {};
            try {
              input = JSON.parse(tc.function?.arguments ?? "{}");
            } catch {
              input = {};
            }

            if (!tool) {
              sse(controller, {
                kind: "tool",
                tool: { id: callId, tool: name, input, status: "error", error: "unknown_tool" },
              });
              messages.push({
                role: "tool",
                tool_call_id: callId,
                content: JSON.stringify({ ok: false, error: "unknown_tool" }),
              });
              continue;
            }

            sse(controller, { kind: "tool", tool: { id: callId, tool: name, input, status: "running" } });

            const t0 = Date.now();
            let result: ToolResult;
            try {
              result = await tool.execute(input, { ws: workspace_id, supabase });
            } catch (e: any) {
              result = { ok: false, summary: e?.message ?? "Tool failed", error: e?.message };
            }

            // Persist execution log
            await supabase.from("ai_tool_executions").insert({
              workspace_id,
              workflow_id: workflowId,
              conversation_id,
              tool: name,
              input,
              output: result,
              status: result.ok ? "ok" : "error",
              error: result.error,
              affected: result.affected ?? [],
              undo: result.undo ?? null,
              duration_ms: Date.now() - t0,
            });

            // Activity stream
            if (result.ok && result.affected?.length) {
              await supabase.from("ai_activity_stream").insert({
                workspace_id,
                kind: "tool",
                label: result.summary,
                metadata: { tool: name, affected: result.affected },
              });
            }

            sse(controller, {
              kind: "tool",
              tool: {
                id: callId,
                tool: name,
                input,
                status: result.ok ? "ok" : "error",
                output: result,
                error: result.error,
                affected: result.affected,
                undo: result.undo,
              },
              workflowId: workflowId ?? undefined,
            });

            // Navigate event → frontend router
            if (name === "navigate" && result.ok) {
              sse(controller, { kind: "navigate", route: (result.data as any)?.route });
            }

            messages.push({
              role: "tool",
              tool_call_id: callId,
              content: JSON.stringify({
                ok: result.ok,
                summary: result.summary,
                data: result.data,
                error: result.error,
              }),
            });
          }
        }

        if (workflowId) {
          await supabase
            .from("ai_workflows")
            .update({
              status: "done",
              step_count: stepCount,
              completed_at: new Date().toISOString(),
              summary: `${stepCount} steps · ${Math.round((Date.now() - startedAt) / 1000)}s`,
            })
            .eq("id", workflowId);
        }
      } catch (e: any) {
        runError = e?.message ?? "Runtime error";
        sse(controller, { kind: "error", error: runError });
        if (workflowId) {
          await supabase
            .from("ai_workflows")
            .update({
              status: "failed",
              error: e?.message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", workflowId);
        }
      } finally {
        // Log to EXTERNAL command_history so AI Observability sees every prompt.
        await logCommandHistory({
          workspace_id,
          command: prompt,
          intent: toolsUsed[0] ?? "chat",
          mode: "agent-runtime",
          model: MODEL,
          command_id: workflowId,
          page_url: context?.route ?? null,
          rag_sources: ragSources,
          latency_ms: Date.now() - startedAt,
          status: runError ? "error" : "success",
          response: assistantText.slice(0, 8000) || null,
          error: runError,
          metadata: {
            tools_used: toolsUsed,
            rag_hits: ragSources.length,
            rag_workspace_count: ragSources.filter((s) => s.scope === "workspace").length,
            rag_global_count: ragSources.filter((s) => s.scope === "global").length,
          },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
});
