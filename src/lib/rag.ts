import { supabase } from "@/integrations/supabase/client";

export interface RagFilters {
  board?: string | null;
  class?: string | null;
  subject?: string | null;
}

export interface RagHit {
  scope: "global" | "workspace";
  label: string;
  source_name?: string;
  content: string;
  similarity: number;
}

export async function searchKnowledge(params: {
  query: string;
  workspace_id?: string | null;
  filters?: RagFilters;
  top_k_global?: number;
  top_k_workspace?: number;
}): Promise<RagHit[]> {
  const { data, error } = await supabase.functions.invoke("rag-search", { body: params });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.results ?? []) as RagHit[];
}

export function formatKnowledgeContext(hits: RagHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h) => {
    const tag = h.scope === "workspace" ? "[school]" : `[${h.label}]`;
    return `${tag}\n${h.content}`;
  });
  return `## Knowledge\n\n${lines.join("\n\n---\n\n")}`;
}
