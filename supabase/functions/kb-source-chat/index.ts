// Super Admin: test-chat against a single Knowledge Base source.
// Embeds the question, retrieves top chunks from THIS source only,
// then calls OpenRouter to answer grounded in those chunks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const OPENROUTER_API_KEY = (Deno.env.get("OPENROUTER_API_KEY") ?? "").trim();

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text, dimensions: 1536 }),
  });
  if (!res.ok) throw new Error(`Embedding ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.data[0].embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Note: auth is not enforced here because this function is called cross-project
    // from the main Admeasy app via invokeExternal with the external project's anon key.
    // The source_id scoping below limits access to a specific KB source.
    const body = await req.json().catch(() => ({}));
    const scope: "global" | "workspace" = body.scope === "workspace" ? "workspace" : "global";
    const source_id: string = String(body.source_id ?? "").trim();
    const question: string = String(body.question ?? "").trim();
    const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(body.history) ? body.history.slice(-10) : [];
    const top_k = Math.min(Math.max(Number(body.top_k ?? 8), 1), 20);
    const model: string = String(body.model ?? "openai/gpt-oss-20b:free");

    if (!source_id) return new Response(JSON.stringify({ error: "source_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!question) return new Response(JSON.stringify({ error: "question required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Source metadata
    const metaTable = scope === "global" ? "global_rag_sources" : "workspace_rag_sources";
    const { data: srcMeta } = await admin.from(metaTable).select("*").eq("id", source_id).maybeSingle();

    const t0 = Date.now();
    const queryEmbedding = await embed(question);
    const tEmbed = Date.now() - t0;

    const rpcName = scope === "global" ? "match_global_chunks_by_source" : "match_workspace_chunks_by_source";
    const { data: matches, error: rpcErr } = await admin.rpc(rpcName, {
      query_embedding: queryEmbedding as any,
      p_source_id: source_id,
      match_count: top_k,
    });
    if (rpcErr) throw new Error(`vector search failed: ${rpcErr.message}`);
    const tRetrieve = Date.now() - t0 - tEmbed;

    const chunks = (matches ?? []) as Array<{ id: string; chunk_index: number; content: string; similarity: number; source_name: string }>;

    const context = chunks
      .map((c, i) => `[#${i + 1} chunk ${c.chunk_index} · sim=${c.similarity.toFixed(3)}]\n${c.content}`)
      .join("\n\n---\n\n");

    const sysMeta = [
      srcMeta?.name && `Source: ${srcMeta.name}`,
      srcMeta?.board && `Board: ${srcMeta.board}`,
      srcMeta?.class && `Class: ${srcMeta.class}`,
      srcMeta?.subject && `Subject: ${srcMeta.subject}`,
      srcMeta?.chapter && `Chapter: ${srcMeta.chapter}`,
    ].filter(Boolean).join(" · ");

    const systemPrompt = `You are a Knowledge Base QA tester for Admeasy. You answer ONLY using the retrieved chunks from a single source file. ${sysMeta}

Rules:
- If chunks contain the answer, cite chunk numbers like [#1], [#3].
- If chunks do NOT contain the answer, say "Not found in this source's indexed chunks." Do not invent facts.
- Be concise. Use markdown. Highlight verbatim quotes in > blockquotes when helpful.
- This is a retrieval-quality test, so flag if chunks look fragmented, OCR-garbled, or missing context.

RETRIEVED CONTEXT:
${context || "(no chunks retrieved)"}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: question },
    ];

    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not configured in Edge Function secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tAi0 = Date.now();
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai.admeasy.in",
        "X-Title": "Admeasy KB Tester",
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
    const aiJson = await aiRes.json();
    const tAi = Date.now() - tAi0;
    if (!aiRes.ok) {
      return new Response(JSON.stringify({ error: aiJson?.error?.message ?? `OpenRouter ${aiRes.status}`, raw: aiJson }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const answer: string = aiJson?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({
      ok: true,
      answer,
      model,
      latency_ms: { embed: tEmbed, retrieve: tRetrieve, ai: tAi, total: Date.now() - t0 },
      chunks: chunks.map((c) => ({
        id: c.id,
        chunk_index: c.chunk_index,
        similarity: c.similarity,
        snippet: c.content.slice(0, 400),
      })),
      usage: aiJson?.usage ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("kb-source-chat error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
