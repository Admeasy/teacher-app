import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Loader2, X, History, Command as CmdIcon } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { runAgent, type ToolCallEvent } from "@/lib/ai/runtime";
import { useAIContext } from "@/stores/aiContextStore";
import ToolCallCard from "./ToolCallCard";
import ReactMarkdown from "react-markdown";

const HISTORY_KEY = "ai-cmd-history";

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveHistory(items: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
}

export default function CommandPalette() {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [calls, setCalls] = useState<ToolCallEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctx = useAIContext();

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const reset = useCallback(() => {
    setText("");
    setCalls([]);
    setError(null);
  }, []);

  async function submit(cmd?: string) {
    const prompt = (cmd ?? input).trim();
    if (!prompt || !workspaceId || busy) return;
    setBusy(true);
    reset();
    setInput("");
    const next = [prompt, ...history.filter((h) => h !== prompt)].slice(0, 50);
    setHistory(next);
    saveHistory(next);

    await runAgent({
      workspaceId,
      prompt,
      onEvent: (e) => {
        if (e.kind === "text") {
          setText((t) => t + (e.text ?? ""));
        } else if (e.kind === "navigate") {
          // ── FIX: handle navigation from AI ──
          const route = (e as any).route as string;
          if (route) {
            router.push(route);
            setTimeout(() => setOpen(false), 300); // slight delay so user sees the tool card
          }
        } else if (e.kind === "tool" && e.tool) {
          setCalls((c) => {
            const i = c.findIndex((x) => x.id === e.tool!.id);
            if (i === -1) return [...c, e.tool!];
            const copy = c.slice();
            copy[i] = e.tool!;
            return copy;
          });
        } else if (e.kind === "error") {
          setError(e.error ?? "Runtime error");
        }
      },
    });
    setBusy(false);
  }

  const entityChip = ctx.entityLabel
    ? `${ctx.entity}: ${ctx.entityLabel}`
    : ctx.entity
      ? `${ctx.entity}`
      : (ctx.routeLabel ?? ctx.route ?? "current page");

  const selectionCount = ctx.visibleIds?.length ?? 0;

  return (
    <>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 glass-strong px-4 py-2.5 rounded-full shadow-xl
          flex items-center gap-2 text-xs text-foreground/80 hover:text-foreground
          border border-violet/20 hover:border-violet/40 hover:glow-violet transition-all"
        title="Open AI command palette (⌘K)"
      >
        <Sparkles size={14} className="text-violet-glow" />
        <span>Ask AI</span>
        <kbd className="ml-1 text-[10px] px-1.5 py-0.5 bg-surface-2 rounded border border-border/40 font-mono">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="fixed left-1/2 top-[12vh] -translate-x-1/2 z-50 w-[min(680px,92vw)]
                glass-strong rounded-2xl shadow-2xl border border-violet/20 overflow-hidden flex flex-col max-h-[76vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header / input */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
                <CmdIcon size={16} className="text-violet-glow shrink-0" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="Ask, query, or execute… e.g. mark fees paid for this student"
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className={`p-1.5 rounded-md transition-colors ${historyOpen ? "bg-violet/10 text-violet-glow" : "text-muted-foreground hover:text-foreground"}`}
                  title="History"
                >
                  <History size={14} />
                </button>
                <button
                  onClick={() => submit()}
                  disabled={!input.trim() || busy}
                  className="p-1.5 rounded-md gradient-violet text-white disabled:opacity-30"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>

              {/* Context strip */}
              <div className="px-4 py-2 flex items-center gap-2 text-[10px] text-muted-foreground border-b border-border/30 bg-surface-2/30">
                <span>Context:</span>
                <span className="px-1.5 py-0.5 rounded bg-violet/10 text-violet-glow font-mono">{entityChip}</span>
                {selectionCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/70">
                    {selectionCount} visible
                  </span>
                )}
                {ctx.realtimeEvents.length > 0 && (
                  <span className="ml-auto opacity-60">{ctx.realtimeEvents.length} recent events</span>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
                {historyOpen ? (
                  <div className="space-y-1">
                    {history.length === 0 && <div className="text-xs text-muted-foreground">No history yet.</div>}
                    {history.map((h, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setHistoryOpen(false);
                          submit(h);
                        }}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors text-foreground/80"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                ) : !busy && !text && calls.length === 0 && !error ? (
                  <div className="text-xs text-muted-foreground space-y-3">
                    <div>Try:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "open transport page",
                        "show unpaid fees",
                        "snapshot this student",
                        "list students with attendance below 75%",
                      ].map((s) => (
                        <button
                          key={s}
                          onClick={() => submit(s)}
                          className="px-2.5 py-1.5 rounded-lg glass hover:border-violet/30 hover:glow-violet transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {calls.map((c) => (
                      <ToolCallCard key={c.id} tool={c} />
                    ))}
                    {text && (
                      <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                        <ReactMarkdown>{text}</ReactMarkdown>
                      </div>
                    )}
                    {error && (
                      <div className="text-xs text-rose-400 glass rounded-lg p-2.5 border border-rose-500/30">
                        {error}
                      </div>
                    )}
                    {busy && !text && calls.length === 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 size={12} className="animate-spin" /> Thinking…
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
