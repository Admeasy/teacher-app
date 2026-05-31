import {
  TEACHER_CORS,
  jsonResponse,
  parseJsonBody,
  requireTeacherAuth,
  safeErrorMessage,
  serviceClient,
} from "../_shared/teacherAuth.ts";

const SYSTEM: Record<string, string> = {
  lesson: "You are a senior pedagogy coach. Generate clear weekly lesson plans, chapter breakdowns, and revision calendars in markdown with tables and checklists.",
  questions: "You generate question sets for teachers — MCQs (4 options + answer), subjective sets, worksheets, and previous-year questions. Group by difficulty.",
  insights: "You are a class performance analyst. Identify weak students, attendance dips, score trends. Provide concise actionable insights.",
  chat: "You are a teaching assistant. Help draft notes, parent communications, lesson ideas. Be concise and practical.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const supabase = serviceClient();
  try {
    const body = await parseJsonBody(req);
    const auth = await requireTeacherAuth(req, body, supabase);
    if (!auth.ok) return auth.response;

    const { teacher } = auth;
    const mode = String(body.mode ?? "chat");
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt || prompt.length > 8000) {
      return jsonResponse({ error: "Invalid prompt" }, 400);
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

    const sys = `${SYSTEM[mode] || SYSTEM.chat}\n\nTeacher context: ${teacher.name}, subject ${teacher.subject ?? "—"}, classes ${(teacher.assigned_classes ?? []).join(", ") || "—"}.`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) return jsonResponse({ error: "Rate limit. Try again shortly." }, 429);
      if (res.status === 402) return jsonResponse({ error: "AI credits exhausted. Please contact your admin." }, 402);
      throw new Error("AI gateway error");
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content || "";

    try {
      await supabase.from("teacher_ai_usage").insert({
        workspace_id: teacher.workspace_id,
        teacher_id: teacher.id,
        mode,
        prompt: prompt.slice(0, 2000),
        tokens_used: data?.usage?.total_tokens ?? 0,
      });
    } catch {
      /* non-fatal */
    }

    return jsonResponse({ text });
  } catch (e) {
    return jsonResponse({ error: safeErrorMessage(e) }, 500);
  }
});
