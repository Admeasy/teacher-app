// Create a teacher leave request. Approver = workspace admin (pool).
import {
  TEACHER_CORS,
  jsonResponse,
  parseJsonBody,
  requireTeacherAuth,
  safeErrorMessage,
  serviceClient,
} from "../_shared/teacherAuth.ts";

const LEAVE_TYPES = ["sick", "personal", "emergency", "family", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const sb = serviceClient();
  try {
    const body = await parseJsonBody(req);
    const auth = await requireTeacherAuth(req, body, sb);
    if (!auth.ok) return auth.response;

    const teacher = auth.teacher;
    const workspace_id = teacher.workspace_id;
    const teacher_id = teacher.id;
    const leave_type = String(body.leave_type ?? "").trim();
    const from_date = String(body.from_date ?? "").trim();
    const to_date = String(body.to_date ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!LEAVE_TYPES.includes(leave_type)) return jsonResponse({ error: "Invalid leave_type" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from_date) || !/^\d{4}-\d{2}-\d{2}$/.test(to_date)) {
      return jsonResponse({ error: "Invalid dates" }, 400);
    }
    if (to_date < from_date) return jsonResponse({ error: "to_date must be on or after from_date" }, 400);
    if (reason.length < 3 || reason.length > 1000) return jsonResponse({ error: "Reason must be 3–1000 chars" }, 400);

    const { data: row, error } = await sb
      .from("leave_requests")
      .insert({
        workspace_id,
        requester_type: "teacher",
        requester_id: teacher_id,
        requester_name_snapshot: teacher.name,
        approver_type: "admin",
        approver_id: null,
        leave_type, from_date, to_date, reason,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;

    return jsonResponse({ ok: true, request: row });
  } catch (e) {
    return jsonResponse({ error: safeErrorMessage(e) }, 500);
  }
});
