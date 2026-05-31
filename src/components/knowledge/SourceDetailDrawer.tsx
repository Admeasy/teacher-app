import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Database, AlertTriangle, FileText, Copy, MessageSquare, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeExternal } from "@/lib/extFn";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export type DrawerSource = {
  id: string;
  name: string;
  status?: string | null;
  source_type?: string | null;
  source_kind?: string | null;
  board?: string | null;
  class?: string | null;
  subject?: string | null;
  chapter?: string | null;
  page_count?: number | null;
  chunk_count?: number | null;
  file_size?: number | null;
  created_at?: string | null;
  ai_summary?: string | null;
  error?: string | null;
  error_code?: string | null;
  error_explanation?: string | null;
  error_suggestion?: string | null;
};

type Chunk = {
  id: string;
  chunk_index: number;
  content: string;
  metadata?: any;
};

export default function SourceDetailDrawer({
  source,
  scope, // "workspace" | "global"
  workspaceId,
  onClose,
}: {
  source: DrawerSource | null;
  scope: "workspace" | "global";
  workspaceId?: string | null;
  onClose: () => void;
}) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalChunks, setTotalChunks] = useState(0);

  useEffect(() => {
    if (!source) return;
    setLoading(true);
    (async () => {
      const table = scope === "workspace" ? "workspace_rag_chunks" : "global_rag_chunks";
      let q = supabase
        .from(table as any)
        .select("id, chunk_index, content, metadata", { count: "exact" })
        .eq("source_id", source.id)
        .order("chunk_index", { ascending: true })
        .limit(50);
      if (scope === "workspace" && workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data, count, error } = await q;
      if (error) toast.error(error.message);
      setChunks((data ?? []) as any);
      setTotalChunks(count ?? (data?.length ?? 0));
      setLoading(false);
    })();
  }, [source, scope, workspaceId]);

  const dims = scope === "workspace" ? 1536 : 1536; // both store 1536 in this project
  const sizeKb = source?.file_size ? (source.file_size / 1024).toFixed(1) : null;

  return (
    <AnimatePresence>
      {source && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 600 }} animate={{ x: 0 }} exit={{ x: 600 }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-2xl z-50 glass-strong border-l border-border/40 overflow-y-auto"
          >
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-border/40 flex items-start justify-between glass">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-violet-glow shrink-0" />
                  <h2 className="text-sm font-semibold truncate">{source.name}</h2>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {source.source_type && <span>type: <b>{source.source_type}</b></span>}
                  {source.source_kind && <span>kind: {source.source_kind}</span>}
                  {source.board && <span>{source.board}</span>}
                  {source.class && <span>Class {source.class}</span>}
                  {source.subject && <span>{source.subject}</span>}
                  {source.chapter && <span>· {source.chapter}</span>}
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/40"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Stat label="Status" value={source.status ?? "—"} />
                <Stat label="Chunks" value={String(source.chunk_count ?? totalChunks)} />
                <Stat label="Pages" value={source.page_count != null ? String(source.page_count) : "—"} />
                <Stat label="Size" value={sizeKb ? `${sizeKb} KB` : "—"} />
              </div>

              {source.ai_summary && (
                <Section icon={Sparkles} title="AI Summary">
                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{source.ai_summary}</p>
                </Section>
              )}

              {source.status === "failed" && (
                <Section icon={AlertTriangle} title="Failure Diagnostics" tone="danger">
                  <div className="space-y-2 text-xs">
                    {source.error_code && (
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-2">Code</span>
                        <code className="font-mono text-rose-400">{source.error_code}</code>
                      </div>
                    )}
                    {source.error && (
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-rose-300 whitespace-pre-wrap break-words">
                        {source.error}
                      </div>
                    )}
                    {source.error_explanation && (
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">What happened</div>
                        <p className="text-foreground/90">{source.error_explanation}</p>
                      </div>
                    )}
                    {source.error_suggestion && (
                      <div className="border-t border-border/40 pt-2">
                        <div className="text-[10px] uppercase tracking-widest text-emerald-300 mb-1">Suggested fix</div>
                        <p className="text-emerald-300/90">{source.error_suggestion}</p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              <Section icon={Database} title={`Vectorisation`}>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Embedding dims" value={String(dims)} />
                  <Stat label="Model" value="text-embedding-3-small" />
                  <Stat label="Index" value="pgvector HNSW" />
                  <Stat label="Distance" value="cosine" />
                </div>
              </Section>

              <Section icon={FileText} title={`Chunks (${totalChunks}${chunks.length < totalChunks ? `, showing first ${chunks.length}` : ""})`}>
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : chunks.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No chunks indexed yet. {source.status === "failed" ? "Ingestion failed before chunks were created." : "Try re-indexing if this source should have content."}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {chunks.map((c) => (
                      <div key={c.id} className="bg-muted/20 border border-border/40 rounded-lg p-3 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground">chunk #{c.chunk_index}</span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(c.content); toast.success("Copied"); }}
                            className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <pre className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words font-mono max-h-44 overflow-y-auto">
{c.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <TestChat scope={scope} source={source} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

const MODELS = [
  { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B (free)" },
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (free)" },
  { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B IT (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { id: "deepseek/deepseek-r1-distill-llama-70b:free", label: "DeepSeek R1 Distill Llama 70B (free)" },
  { id: "microsoft/phi-4:free", label: "Phi-4 (free)" },
];

type ChatMsg = { role: "user" | "assistant"; content: string; chunks?: any[]; latency_ms?: any; model?: string };

function TestChat({ scope, source }: { scope: "workspace" | "global"; source: DrawerSource }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { setMessages([]); }, [source.id]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setLoading(true);
    try {
      const { data, error } = await invokeExternal("kb-source-chat", {
        body: {
          scope,
          source_id: source.id,
          question: q,
          model,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setMessages([...next, {
        role: "assistant",
        content: (data as any).answer ?? "(empty response)",
        chunks: (data as any).chunks,
        latency_ms: (data as any).latency_ms,
        model: (data as any).model,
      }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Chat failed");
      setMessages([...next, { role: "assistant", content: `**Error:** ${e?.message ?? e}` }]);
    } finally {
      setLoading(false);
    }
  };

  const suggested = [
    "Summarize the main topics of this document.",
    "List 5 high-level questions a student should be able to answer from this.",
    "Quote the opening paragraph verbatim.",
    "What is the most important concept covered here?",
  ];

  return (
    <Section icon={MessageSquare} title="AI Test Chat (OpenRouter)">
      <div className="text-[10px] text-muted-foreground mb-2">
        Ask questions to verify retrieval & answer quality. Only chunks from <b>this source</b> are searched.
      </div>

      <div className="flex items-center gap-2 mb-2">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="text-[11px] bg-muted/30 border border-border/40 rounded-md px-2 py-1 outline-none focus:border-violet-glow"
        >
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="text-[10px] text-muted-foreground hover:text-foreground ml-auto">
            Clear
          </button>
        )}
      </div>

      <div className="bg-muted/10 border border-border/40 rounded-lg p-3 max-h-[420px] overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Try</div>
            {suggested.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="block w-full text-left text-[11px] text-foreground/80 hover:text-violet-glow bg-muted/20 hover:bg-muted/40 rounded px-2 py-1.5"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-xs ${m.role === "user" ? "text-foreground" : "text-foreground/90"}`}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {m.role === "user" ? "You" : `Assistant${m.model ? ` · ${m.model}` : ""}`}
            </div>
            <div className={`rounded-lg p-2.5 ${m.role === "user" ? "bg-violet-glow/10 border border-violet-glow/30" : "bg-muted/20 border border-border/40"}`}>
              <div className="prose prose-invert prose-sm max-w-none text-xs prose-p:my-1 prose-pre:my-1">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              {m.role === "assistant" && m.chunks && m.chunks.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                    {m.chunks.length} chunks retrieved
                    {m.latency_ms && ` · embed ${m.latency_ms.embed}ms · retrieve ${m.latency_ms.retrieve}ms · ai ${m.latency_ms.ai}ms`}
                  </summary>
                  <div className="mt-1.5 space-y-1.5">
                    {m.chunks.map((c: any, j: number) => (
                      <div key={j} className="bg-background/40 border border-border/40 rounded p-2 text-[10px] font-mono">
                        <div className="text-muted-foreground mb-1">
                          [#{j + 1}] chunk {c.chunk_index} · sim {c.similarity.toFixed(3)}
                        </div>
                        <div className="text-foreground/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{c.snippet}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Embedding query, retrieving chunks, asking model…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-2 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask the AI a question about this source…"
          rows={2}
          className="flex-1 text-xs bg-muted/20 border border-border/40 rounded-lg px-3 py-2 outline-none focus:border-violet-glow resize-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-3 py-2 rounded-lg bg-violet-glow/20 border border-violet-glow/40 text-violet-glow hover:bg-violet-glow/30 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/20 border border-border/30 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-foreground tabular-nums text-sm mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, icon: Icon, children, tone }: any) {
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-[0.2em] mb-2 flex items-center gap-2 ${tone === "danger" ? "text-rose-400" : "text-muted-foreground"}`}>
        <Icon className="h-3 w-3" /> {title}
      </div>
      {children}
    </div>
  );
}
