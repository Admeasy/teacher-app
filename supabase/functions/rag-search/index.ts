// Dual-memory RAG search: workspace + global academic knowledge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text, dimensions: 1536 }),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data[0].embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? "").trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "query required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const filters = body.filters ?? {};
    const workspace_id: string | null = body.workspace_id ?? null;
    const top_k_global = Math.min(Math.max(Number(body.top_k_global ?? 6), 1), 20);
    const top_k_workspace = Math.min(Math.max(Number(body.top_k_workspace ?? 4), 0), 20);

    const queryEmbedding = await embed(query);

    const [globalRes, wsRes] = await Promise.all([
      admin.rpc("match_global_chunks", {
        query_embedding: queryEmbedding as any,
        match_count: top_k_global,
        p_board: filters.board ?? null,
        p_class: filters.class ?? null,
        p_subject: filters.subject ?? null,
      }),
      workspace_id && top_k_workspace > 0
        ? userClient.rpc("match_workspace_chunks", {
            query_embedding: queryEmbedding as any,
            p_workspace_id: workspace_id,
            match_count: top_k_workspace,
          })
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (globalRes.error) console.error("global rpc error", globalRes.error);
    if ((wsRes as any).error) console.error("workspace rpc error", (wsRes as any).error);

    const global = (globalRes.data ?? []).map((r: any) => ({
      scope: "global",
      label: [r.board, r.class, r.subject, r.chapter].filter(Boolean).join(" / ") || r.source_name,
      source_name: r.source_name,
      content: r.content,
      similarity: r.similarity,
    }));
    const ws = ((wsRes as any).data ?? []).map((r: any) => ({
      scope: "workspace",
      label: r.source_name ?? "school data",
      source_name: r.source_name,
      content: r.content,
      similarity: r.similarity,
    }));

    const merged = [...ws, ...global].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

    return new Response(JSON.stringify({ ok: true, results: merged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("rag-search error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
