// Create a student leave request. Resolves class teacher as approver.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const LEAVE_TYPES = ["sick", "personal", "emergency", "family", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = String(body.workspace_id ?? "").trim();
    const student_id = String(body.student_id ?? "").trim();
    const leave_type = String(body.leave_type ?? "").trim();
    const from_date = String(body.from_date ?? "").trim();
    const to_date = String(body.to_date ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!workspace_id || !student_id) return json({ error: "Missing workspace_id or student_id" }, 400);
    if (!LEAVE_TYPES.includes(leave_type)) return json({ error: "Invalid leave_type" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from_date) || !/^\d{4}-\d{2}-\d{2}$/.test(to_date))
      return json({ error: "Invalid dates" }, 400);
    if (to_date < from_date) return json({ error: "to_date must be on or after from_date" }, 400);
    if (reason.length < 3 || reason.length > 1000) return json({ error: "Reason must be 3–1000 chars" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: student, error: sErr } = await sb
      .from("students")
      .select("id, workspace_id, name, class, section, roll_number")
      .eq("id", student_id)
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!student) return json({ error: "Student not in workspace" }, 404);

    // Resolve class teacher
    let approver_id: string | null = null;
    let approver_name: string | null = null;
    if (student.class && student.section) {
      const { data: ca } = await sb
        .from("class_assignments")
        .select("teacher_id, teacher_name")
        .eq("workspace_id", workspace_id)
        .eq("class", student.class)
        .eq("section", student.section)
        .in("role", ["class_teacher", "Class Teacher", "classteacher", "homeroom"])
        .not("teacher_id", "is", null)
        .limit(1)
        .maybeSingle();
      approver_id = ca?.teacher_id ?? null;
      approver_name = ca?.teacher_name ?? null;
    }

    const class_snapshot = [student.class, student.section].filter(Boolean).join("-");

    const { data: row, error } = await sb
      .from("leave_requests")
      .insert({
        workspace_id,
        requester_type: "student",
        requester_id: student_id,
        requester_name_snapshot: student.name,
        class_snapshot,
        roll_snapshot: student.roll_number ?? null,
        approver_type: "teacher",
        approver_id,
        approver_name_snapshot: approver_name,
        leave_type, from_date, to_date, reason,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;

    return json({ ok: true, request: row });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
