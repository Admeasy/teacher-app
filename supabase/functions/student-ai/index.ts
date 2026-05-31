import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM: Record<string, string> = {
  ask: "You are Admeasy AI, a friendly study tutor for school students. Explain clearly with examples. Use markdown. Be concise.",
  plan: "You are a study planner. Generate structured weekly study plans, exam prep roadmaps, and improvement plans with checklists and tables.",
  pyq: "You are a previous-year-questions generator. Produce chapter-wise PYQs with answers, grouped by year and difficulty.",
  test: "You are a quiz generator. Create 5-10 MCQs with 4 options each, then list correct answers with 1-line explanations.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { mode = "ask", prompt, student } = await req.json();
    if (!prompt) return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

    const sys = `${SYSTEM[mode] || SYSTEM.ask}\n\nStudent: ${student ? `${student.name}, Class ${student.class}-${student.section}` : "unknown"}.`;

    // Workspace RAG lookup (best-effort)
    let context = "";
    if (student?.workspace_id) {
      try {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const embRes = await fetch("https://openrouter.ai/api/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai/text-embedding-3-small", input: prompt.slice(0, 2000), dimensions: 1536 }),
        });
        if (embRes.ok) {
          const emb = (await embRes.json())?.data?.[0]?.embedding;
          if (emb) {
            const { data: chunks } = await supabase.rpc("match_workspace_chunks", {
              query_embedding: emb,
              p_workspace_id: student.workspace_id,
              match_count: 4,
            });
            if (chunks?.length) {
              context = "\n\nRelevant material from your school:\n" + chunks.map((c: any) => `- ${c.content.slice(0, 400)}`).join("\n");
            }
          }
        }
      } catch (_) { /* swallow */ }
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys + context },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please contact your school." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
