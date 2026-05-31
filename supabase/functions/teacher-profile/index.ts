import {
  TEACHER_CORS,
  jsonResponse,
  parseJsonBody,
  requireTeacherAuth,
  safeErrorMessage,
  serviceClient,
} from "../_shared/teacherAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const supabase = serviceClient();
  try {
    const body = await parseJsonBody(req);
    const auth = await requireTeacherAuth(req, body, supabase);
    if (!auth.ok) return auth.response;

    const { teacher } = auth;
    const action = String(body.action ?? "get");
    const updates = body.updates as Record<string, unknown> | undefined;

    if (action === "update") {
      const allowed: Record<string, string> = {};
      const fields = ["name", "subject", "phone"] as const;
      for (const k of fields) {
        if (updates && typeof updates[k] === "string") allowed[k] = String(updates[k]).slice(0, 200);
      }
      if (Object.keys(allowed).length === 0) {
        return jsonResponse({ error: "No valid fields to update" }, 400);
      }
      const { data: updated, error } = await supabase
        .from("teachers")
        .update(allowed)
        .eq("id", teacher.id)
        .eq("workspace_id", teacher.workspace_id)
        .select("*")
        .single();
      if (error) throw error;
      return jsonResponse({ teacher: updated });
    }

    return jsonResponse({ teacher });
  } catch (e) {
    return jsonResponse({ error: safeErrorMessage(e) }, 500);
  }
});
