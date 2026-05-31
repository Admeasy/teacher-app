// Review (approve/reject) a leave request. Used by teachers (for student leaves) and admins (for teacher leaves).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { syncLeaveToAttendance } from "../_shared/leaveAttendance.ts";
import { processLeaveReviewEmails } from "../_shared/leaveEmail.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function dispatchEmailsAsync(leave: Record<string, unknown>, action: string, reviewerName: string | null) {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const notificationStatus = action === "approve" ? "approved" : "rejected";
  const teacherLabel = reviewerName ?? String(leave.approver_name_snapshot ?? "Teacher");

  const work = processLeaveReviewEmails(
    sb,
    leave as Parameters<typeof processLeaveReviewEmails>[1],
    notificationStatus,
    teacherLabel,
  ).then((stats) => {
    console.log("[leave-review] email pipeline done", { leave_id: leave.id, ...stats });
  }).catch((err) => {
    console.error("[leave-review] email pipeline error", err);
  });

  try {
    EdgeRuntime.waitUntil(work);
  } catch {
    void work;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = String(body.workspace_id ?? "").trim();
    const leave_id = String(body.leave_id ?? "").trim();
    const action = String(body.action ?? "").trim();
    const reviewer_type = String(body.reviewer_type ?? "").trim();
    const reviewer_id = String(body.reviewer_id ?? "").trim();
    const reviewer_name = body.reviewer_name ? String(body.reviewer_name) : null;
    const response_message = body.response_message != null
      ? String(body.response_message).slice(0, 1000)
      : null;

    if (!workspace_id || !leave_id) return json({ error: "Missing workspace_id or leave_id" }, 400);
    if (!["approve", "reject"].includes(action)) return json({ error: "Invalid action" }, 400);
    if (!["teacher", "admin"].includes(reviewer_type)) return json({ error: "Invalid reviewer_type" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: leave, error: lErr } = await sb
      .from("leave_requests")
      .select("*")
      .eq("id", leave_id)
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    if (lErr) throw lErr;
    if (!leave) return json({ error: "Leave not found" }, 404);
    if (leave.status !== "pending") return json({ error: "Already reviewed" }, 409);

    if (leave.approver_type !== reviewer_type) {
      return json({ error: "Not authorized to review this leave" }, 403);
    }
    if (reviewer_type === "teacher") {
      if (!reviewer_id) return json({ error: "Missing reviewer_id" }, 400);
      if (leave.approver_id && leave.approver_id !== reviewer_id) {
        return json({ error: "Not the assigned class teacher" }, 403);
      }
      const { data: t } = await sb.from("teachers").select("id, name")
        .eq("id", reviewer_id).eq("workspace_id", workspace_id).maybeSingle();
      if (!t) return json({ error: "Reviewer not in workspace" }, 403);
    }

    const { data: updated, error } = await sb
      .from("leave_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        response_message,
        responded_at: new Date().toISOString(),
        approver_id: reviewer_type === "teacher" ? reviewer_id : leave.approver_id,
        approver_name_snapshot: reviewer_name ?? leave.approver_name_snapshot,
      })
      .eq("id", leave_id)
      .eq("workspace_id", workspace_id)
      .select()
      .single();
    if (error) throw error;

    let attendance_sync: { written: number; skipped: string[] } | null = null;
    if (action === "approve") {
      try {
        attendance_sync = await syncLeaveToAttendance(sb, updated as any);
      } catch (syncErr) {
        attendance_sync = { written: 0, skipped: [] } as any;
        console.error("[leave-review] attendance sync failed:", syncErr);
      }
    }

    // Notify student + parent by email (async — does not block this response)
    if (updated.requester_type === "student") {
      dispatchEmailsAsync(updated, action, reviewer_name);
    }

    return json({ ok: true, request: updated, attendance_sync, email_queued: updated.requester_type === "student" });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
