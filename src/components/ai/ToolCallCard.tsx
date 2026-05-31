import { motion } from "framer-motion";
import { CheckCircle2, Loader2, XCircle, AlertTriangle, Undo2 } from "lucide-react";
import type { ToolCallEvent } from "@/lib/ai/runtime";

export default function ToolCallCard({ tool }: { tool: ToolCallEvent }) {
  const Icon =
    tool.status === "running"
      ? Loader2
      : tool.status === "ok"
      ? CheckCircle2
      : tool.status === "awaiting_approval"
      ? AlertTriangle
      : XCircle;
  const color =
    tool.status === "ok"
      ? "text-emerald-400"
      : tool.status === "error"
      ? "text-rose-400"
      : tool.status === "awaiting_approval"
      ? "text-amber-400"
      : "text-violet-glow";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-lg p-2.5 text-xs space-y-1.5 border border-border/40"
    >
      <div className="flex items-center gap-2">
        <Icon size={12} className={`${color} ${tool.status === "running" ? "animate-spin" : ""} shrink-0`} />
        <span className="font-mono text-foreground/90 font-medium">{tool.tool}</span>
        {tool.status === "running" && (
          <span className="text-muted-foreground text-[10px]">running…</span>
        )}
      </div>
      {tool.output?.summary && (
        <div className="text-foreground/80 pl-5 leading-relaxed">{tool.output.summary}</div>
      )}
      {tool.error && <div className="text-rose-400 pl-5">{tool.error}</div>}
      {tool.affected && tool.affected.length > 0 && (
        <div className="pl-5 flex flex-wrap gap-1">
          {tool.affected.map((a) => (
            <span key={a.id} className="px-1.5 py-0.5 rounded bg-violet/10 text-violet-glow text-[10px]">
              {a.label}
            </span>
          ))}
        </div>
      )}
      {tool.undo && tool.status === "ok" && (
        <div className="pl-5">
          <button className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Undo2 size={10} /> Undo
          </button>
        </div>
      )}
    </motion.div>
  );
}
