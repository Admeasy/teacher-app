import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Strip all HTML tags from a string, keeping only text content */
function stripHtml(str: string): string {
  return (str ?? "").replace(/<[^>]*>/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Verify JWT and workspace membership. Returns user or throws. */
async function verifyAuth(req: Request, sb: any, workspaceId: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("Unauthorized");
  const { data: membership } = await sb.from("workspace_members")
    .select("user_id").eq("workspace_id", workspaceId).eq("user_id", data.user.id).maybeSingle();
  if (!membership) throw new Error("Forbidden: not a workspace member");
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });

  // Guard: empty body causes "Unexpected end of JSON input"
  const rawBody = await req.text();
  if (!rawBody || rawBody.trim() === "") {
    return new Response(JSON.stringify({ error: "Empty request body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { workspace_id, input, mode, confirmed_emails } = body;

  if (!workspace_id)
    return new Response(JSON.stringify({ error: "Missing workspace_id" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── JWT Authentication ──────────────────────────────────
  try {
    await verifyAuth(req, sb, workspace_id);
  } catch (authErr: any) {
    return new Response(JSON.stringify({ error: authErr.message }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // ════════════════════════════════════════════════
  // PHASE 2 — Send confirmed emails via Resend
  // ════════════════════════════════════════════════
  if (Array.isArray(confirmed_emails) && confirmed_emails.length > 0) {
    const results: any[] = [];

    for (const em of confirmed_emails) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Admeasy School <team@school.admeasy.in>",
            to: [em.to],
            subject: stripHtml(em.subject ?? ""),
            html: `<div style="font-family:sans-serif;max-width:600px;padding:24px;line-height:1.7">
              ${stripHtml(em.body ?? "").replace(/\n/g, "<br>")}
              <hr style="margin-top:32px;border:none;border-top:1px solid #eee"/>
              <p style="color:#aaa;font-size:11px">Sent via Admeasy AI · team@school.admeasy.in</p>
            </div>`,
          }),
        });
        const j = await r.json();
        results.push({
          to: em.to,
          status: r.ok ? "sent" : "failed",
          error: r.ok ? null : (j.message ?? j.error ?? "Resend error"),
        });
      } catch (e: any) {
        results.push({ to: em.to, status: "failed", error: e.message });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    try {
      await sb.from("execution_logs").insert({
        workspace_id,
        command: `Email dispatch: ${confirmed_emails.length} recipients`,
        mode: mode ?? "agent",
        status: failed === 0 ? "success" : "partial",
        result: { emails: results },
      });
    } catch (logErr: any) {
      console.log("execution_logs insert error:", logErr.message);
    }

    return new Response(
      JSON.stringify({
        phase: "done",
        response: `📧 ${sent}/${confirmed_emails.length} emails sent${failed > 0 ? ` · ❌ ${failed} failed` : " · ✅ All delivered"}`,
        email_results: results,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // ════════════════════════════════════════════════
  // PHASE 1 — Load data + call AI
  // ════════════════════════════════════════════════
  let sc = 0,
    tc = 0,
    mc = 0;
  let fees: any[] = [],
    att: any[] = [],
    matches: any[] = [];
  let students: any[] = [],
    teachers: any[] = [];

  try {
    const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
      sb.from("students").select("*", { count: "exact", head: true }).eq("workspace_id", workspace_id),
      sb.from("teachers").select("*", { count: "exact", head: true }).eq("workspace_id", workspace_id),
      sb.from("mentors").select("*", { count: "exact", head: true }).eq("workspace_id", workspace_id),
      sb
        .from("fee_reminders")
        .select("student_id,student_name,parent_name,parent_email,parent_phone,class,amount_due,fee_status")
        .eq("workspace_id", workspace_id)
        .limit(50),
      sb
        .from("attendance_alerts")
        .select("student_id,student_name,parent_name,parent_email,parent_phone,class,attendance_pct")
        .eq("workspace_id", workspace_id)
        .limit(50),
      sb.from("mentor_matches").select("*").eq("workspace_id", workspace_id).limit(30),
      sb
        .from("students")
        .select("id,name,class,section,parent_name,parent_email,parent_phone,attendance_pct,fee_status,amount_due")
        .eq("workspace_id", workspace_id)
        .limit(100),
      sb.from("teachers").select("id,name,subject,email,phone").eq("workspace_id", workspace_id).limit(20),
    ]);

    sc = r1.count ?? 0;
    tc = r2.count ?? 0;
    mc = r3.count ?? 0;
    fees = r4.data ?? [];
    att = r5.data ?? [];
    matches = r6.data ?? [];
    students = r7.data ?? [];
    teachers = r8.data ?? [];

    if (r4.error) console.log("fee_reminders error:", r4.error.message);
    if (r5.error) console.log("attendance_alerts error:", r5.error.message);
  } catch (dataErr: any) {
    console.log("Data load error:", dataErr.message);
  }

  console.log("Data:", { sc, tc, mc, fees: fees.length, att: att.length, students: students.length });

  const context = `WORKSPACE_ID: ${workspace_id}
SUPABASE_URL: ${SUPABASE_URL}
FUNCTIONS_BASE: ${SUPABASE_URL}/functions/v1
COUNTS: ${sc} students | ${tc} teachers | ${mc} mentors
MODE: ${mode ?? "agent"}

FEE_REMINDERS (${fees.length} unpaid students):
${JSON.stringify(fees)}

ATTENDANCE_ALERTS (${att.length} at-risk students):
${JSON.stringify(att)}

MENTOR_MATCHES:
${JSON.stringify(matches)}

ALL_STUDENTS:
${JSON.stringify(students)}

ALL_TEACHERS:
${JSON.stringify(teachers)}`;

  const system = `You are Admeasy AI — the autonomous operating system for Indian schools.

REAL SCHOOL DATA IS IN THE CONTEXT. Use actual names, amounts, phones from data.
NEVER use placeholders like [Parent Name], [Amount], [Student Name].
NEVER say you lack data. NEVER refuse to answer.
Empty tables → tell user to import Excel in Data section.

━━━ MODES ━━━
AGENT: Act now. Use real data. Be decisive.
ASK: One paragraph, direct facts only.
PLAN: Numbered steps. End with "Shall I proceed?"
RESEARCH: Summary | Risk | Recommendations | Actions

TOP PRIORITY:
Understand table schemas before answering.
Use column meanings, not raw field guessing.
Treat tabular rows as authoritative school database records.

━━━ DATABASE SCHEMA ━━━

PRIMARY TABLE: students

students table columns:
- id → internal database ID
- student_id → unique admission/student ID like ADM2025001
- name → student full name
- class → class number like 12
- section → section like A
- student_email → student email
- parent_name → parent/guardian name
- parent_email → parent email
- parent_phone → parent phone number
- attendance_pct → attendance percentage number
- total_fees → total yearly fees
- paid_amount → fees already paid
- amount_due → remaining unpaid fees
- fee_status → paid / partial / unpaid
- interests → student interests

teachers table columns:
- id → teacher ID
- name → teacher name
- subject → teaching subject
- email → teacher email
- phone → teacher phone
- assigned_classes → classes handled

mentors table columns:
- mentor_id → mentor unique ID
- name → mentor name
- institution → institution name
- program → academic program
- college → college
- expertise_tags → mentor expertise tags
- available_for → mentorship offerings
- contact_email → mentor email

fee_reminders table:
Derived from students where fee_status != paid

attendance_alerts table:
Derived from students where attendance_pct < 75

mentor_matches table:
Maps students to relevant mentors using interests and mentor tags

━━━ QUERY UNDERSTANDING RULES ━━━

User phrases may map to database fields:

"pending fees" → amount_due
"fees due" → amount_due
"unpaid students" → fee_status=unpaid
"partial payers" → fee_status=partial
"low attendance" → attendance_pct < 75
"critical attendance" → attendance_pct < 65
"commerce students" → interests contains commerce
"science students" → interests contains engineering/science
"parents" → parent_name + parent_phone + parent_email
"call all parents" → students with parent_phone
"teachers" → teachers table
"mentors" → mentors table

Always interpret natural language into database fields correctly.
Never claim data is missing if rows exist in context.

ALL_STUDENTS_TABLE:
Columns:
student_id | name | class | section | parent_name | parent_email | parent_phone | attendance_pct | fee_status | amount_due

Rows:
${students
  .map(
    (s) =>
      `${s.student_id ?? s.id} | ${s.name} | ${s.class} | ${s.section} | ${s.parent_name} | ${s.parent_email} | ${s.parent_phone} | ${s.attendance_pct} | ${s.fee_status} | ${s.amount_due}`,
  )
  .join("\n")}

ALL_TEACHERS_TABLE:
Columns:
teacher_id | name | subject | email | phone

Rows:
${teachers.map((t) => `${t.id} | ${t.name} | ${t.subject} | ${t.email} | ${t.phone}`).join("\n")}



━━━ CALLING SYSTEM ━━━
Infrastructure (deployed, working):
  call-agent:  ${SUPABASE_URL}/functions/v1/call-agent
  call-status: ${SUPABASE_URL}/functions/v1/call-status
  Exotel env vars: EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_SUBDOMAIN, EXOTEL_FROM, EXOTEL_APP_ID
  ElevenLabs env vars: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
  Audio stored in: Supabase Storage bucket "call-audio"
  Calls logged in: Supabase table "call_logs"
  Exotel webhooks update call_logs via call-status function

HOW CALLING UI WORKS:
  You output CALL QUEUE block → frontend detects it automatically →
  CALLING CARD appears with contact list → user clicks "PLACE N CALLS NOW" →
  frontend POSTs each recipient to call-agent → live status: RINGING/ANSWERED/NO ANSWER/FAILED →
  final summary shown. YOU DO NOT NEED TO EXPLAIN THIS TO THE USER.

CALL TRIGGERS: call, phone, ring, dial, contact by phone, call parents,
  call teachers, call unpaid, call attendance, call [name], call all,
  retry calls, call unanswered, place calls

SEGMENTS:
  "call unpaid parents"   → fee_reminders where fee_status=unpaid, call_type: fee_reminder
  "call partial payers"   → fee_reminders where fee_status=partial, call_type: fee_reminder
  "call attendance risk"  → attendance_alerts where attendance_pct<75, call_type: attendance_alert
  "call all parents"      → all students with parent_phone
  "call [name]"           → fuzzy match in students + teachers
  "call teachers"         → all teachers with phone
  "call unanswered"       → no_answer from last session

OUTPUT THIS EXACT FORMAT — frontend parser requires it:

CALL QUEUE:
call_type: fee_reminder
recipients:
- student_id: ADM001 | student_name: Aarav Sharma | parent_name: Suresh Joshi | phone: +919915912190 | amount_due: 67500
- student_id: ADM002 | student_name: Priya Patel | parent_name: Geeta Verma | phone: +919769928629 | amount_due: 25000
END_CALL_QUEUE

For attendance: use attendance_pct instead of amount_due.

CALL QUEUE RULES:
  • Only use phone numbers from actual data — never fabricate
  • Output CALL QUEUE immediately — never say "Shall I proceed?"
  • Never write the script in terminal
  • Never say "I cannot make calls"
  • Put brief human summary BEFORE the block, CALL QUEUE at END

━━━ EMAIL SYSTEM ━━━
Emails sent via Resend from: team@school.admeasy.in
Never mention Gmail or OAuth.

HOW EMAIL UI WORKS:
  You output %%EMAIL_DRAFTS%% block → frontend detects it →
  EMAIL PREVIEW CARD appears (1 of N, prev/next navigation) →
  user clicks "CONFIRM & SEND ALL N EMAILS" →
  frontend POSTs confirmed_emails back to command function →
  command sends via Resend → result shown.
  YOU DO NOT NEED TO EXPLAIN THIS TO THE USER.

Append this AFTER your response text — valid JSON, no markdown fences:
%%EMAIL_DRAFTS%%
[
  {
    "to": "actual.parent@email.com",
    "recipient_name": "Actual Parent Name",
    "student_name": "Actual Student Name",
    "subject": "Fee Reminder — Actual Student Name",
    "body": "Dear Actual Parent Name,\\n\\nFees for Actual Student Name (Class 12A) are pending. Amount due: Rs 67,500.\\n\\nPlease arrange payment at the earliest.\\n\\nRegards,\\nAdmeasy School Administration"
  }
]
%%END_EMAIL_DRAFTS%%

EMAIL RULES:
  • Real names and amounts from data — no placeholders ever
  • Personalise each email per student
  • Use \\n for line breaks in JSON body

━━━ PROACTIVE RULES ━━━
  • Flag students BOTH unpaid AND low attendance — highest dropout risk
  • Suggest 2-3 next actions after every response
  • Use ₹, Indian lakh/crore format
  • Be direct, decisive, like a smart school COO`;

  // ─── Gemma 4 with fallback ──────────────────────────────
  const models = ["google/gemma-4-31b-it:free", "google/gemma-4-27b-it:free"];

  let fullResponse = "";
  let usedModel = "";

  for (const model of models) {
    try {
      console.log("Trying:", model);
      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.admeasy.in",
          "X-Title": "Admeasy AI",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: `SCHOOL DATA:\n${context}\n\nCOMMAND: ${input}` },
          ],
          max_tokens: 8000,
          temperature: 0.6,
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        console.log(`${model} failed ${aiRes.status}:`, err.slice(0, 200));
        continue;
      }

      const aiJson = await aiRes.json();
      const content = aiJson.choices?.[0]?.message?.content ?? "";
      if (content.length > 20) {
        fullResponse = content;
        usedModel = model;
        console.log(`✅ ${model} OK, length: ${content.length}`);
        break;
      }
    } catch (e: any) {
      console.log(`${model} exception:`, e.message);
      continue;
    }
  }

  if (!fullResponse) {
    return new Response(
      JSON.stringify({
        phase: "done",
        response: "AI is temporarily unavailable. Please try again in a moment.",
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // ─── Parse email drafts ─────────────────────────────────
  let cleanResponse = fullResponse;
  let emailDrafts: any[] = [];

  const draftMatch = fullResponse.match(/%%EMAIL_DRAFTS%%([\s\S]*?)%%END_EMAIL_DRAFTS%%/);
  if (draftMatch) {
    try {
      emailDrafts = JSON.parse(draftMatch[1].trim());
      cleanResponse = fullResponse.replace(/%%EMAIL_DRAFTS%%[\s\S]*?%%END_EMAIL_DRAFTS%%/, "").trim();
      console.log("Email drafts:", emailDrafts.length);
    } catch (e: any) {
      console.log("Email parse error:", e.message);
    }
  }

  // ─── Log command (safe insert) ──────────────────────────
  try {
    const { error: logErr } = await sb.from("command_history").insert({
      workspace_id,
      command: input,
      mode: mode ?? "agent",
      model: usedModel,
    });
    if (logErr) console.log("command_history error:", logErr.message);
  } catch (e: any) {
    console.log("command_history exception:", e.message);
  }

  return new Response(
    JSON.stringify({
      phase: emailDrafts.length > 0 ? "preview" : "done",
      response: cleanResponse,
      email_drafts: emailDrafts,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
