/**
 * Background worker: processes pending leave email outbox rows (retries / recovery).
 * Invoked fire-and-forget from leave-review or manually for failed rows.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { processLeaveReviewEmails, type LeaveRow } from "../_shared/leaveEmail.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    const body = await req.json().catch(() => ({}));
    const leave_id = body.leave_id ? String(body.leave_id).trim() : "";
    const retry_failed = body.retry_failed === true;

    if (leave_id) {
      const { data: leave } = await sb
        .from("leave_requests")
        .select("*")
        .eq("id", leave_id)
        .maybeSingle();
      if (!leave) return json({ error: "Leave not found" }, 404);
      if (leave.status !== "approved" && leave.status !== "rejected") {
        return json({ error: "Leave not in reviewed state" }, 400);
      }
      const stats = await processLeaveReviewEmails(
        sb,
        leave as LeaveRow,
        leave.status as "approved" | "rejected",
        leave.approver_name_snapshot ?? "Teacher",
      );
      return json({ ok: true, leave_id, ...stats });
    }

    if (retry_failed) {
      const { data: pending } = await sb
        .from("leave_email_notifications")
        .select("leave_id")
        .in("delivery_status", ["failed", "pending"])
        .lt("attempt_count", 5)
        .order("created_at", { ascending: true })
        .limit(20);

      const leaveIds = [...new Set((pending ?? []).map((r: { leave_id: string }) => r.leave_id))];
      let retried = 0;
      for (const lid of leaveIds) {
        const { data: leave } = await sb.from("leave_requests").select("*").eq("id", lid).maybeSingle();
        if (!leave) continue;
        await processLeaveReviewEmails(
          sb,
          leave as LeaveRow,
          leave.status as "approved" | "rejected",
          leave.approver_name_snapshot ?? "Teacher",
        );
        retried++;
      }
      return json({ ok: true, retried });
    }

    return json({ error: "Provide leave_id or retry_failed" }, 400);
  } catch (e) {
    console.error("[leave-email-dispatch]", e);
    return json({ error: "Dispatch failed" }, 500);
  }
});
