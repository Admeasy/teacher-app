// Paginated leave history with role-scoped filters.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = String(body.workspace_id ?? "").trim();
    const scope = String(body.scope ?? "").trim();   // requester | teacher-inbox | admin-inbox | admin-all
    const actor_id = body.actor_id ? String(body.actor_id) : null;
    const status = body.status ? String(body.status) : null;
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200);

    if (!workspace_id) return json({ error: "Missing workspace_id" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let q = sb.from("leave_requests").select("*").eq("workspace_id", workspace_id);

    if (scope === "requester") {
      if (!actor_id) return json({ error: "actor_id required" }, 400);
      q = q.eq("requester_id", actor_id);
    } else if (scope === "teacher-inbox") {
      if (!actor_id) return json({ error: "actor_id required" }, 400);
      q = q
        .eq("approver_type", "teacher")
        .eq("requester_type", "student")
        .or(`approver_id.eq.${actor_id},approver_id.is.null`);
    } else if (scope === "admin-inbox") {
      q = q.eq("approver_type", "admin").eq("requester_type", "teacher");
    } else if (scope === "admin-all") {
      // no extra filter
    } else {
      return json({ error: "Invalid scope" }, 400);
    }

    if (status) q = q.eq("status", status);
    q = q.order("created_at", { ascending: false }).limit(limit);

    const { data, error } = await q;
    if (error) throw error;
    return json({ ok: true, requests: data ?? [] });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
