import { useEffect, useState } from "react";
import { Mail, Phone, AlertTriangle, Activity, PhoneOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AgenticSummary({ workspaceId, compact = false }: { workspaceId: string | null; compact?: boolean }) {
  const [stats, setStats] = useState({ reminders: 0, calls: 0, missed: 0, alerts: 0, runs: 0, recent: [] as any[] });

  useEffect(() => {
    if (!workspaceId) return;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    (async () => {
      const [c, m, e] = await Promise.all([
        supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", since),
        supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", since).in("status", ["no-answer", "busy", "failed", "missed"]),
        supabase.from("execution_logs").select("command, status, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(5),
      ]);
      setStats({
        reminders: 0,
        calls: c.count ?? 0,
        missed: m.count ?? 0,
        alerts: 0,
        runs: (e.data ?? []).length,
        recent: e.data ?? [],
      });
    })();
  }, [workspaceId]);

  const items = [
    { label: "Fee reminders sent", value: stats.reminders, icon: Mail, color: "text-emerald-400" },
    { label: "Calls placed", value: stats.calls, icon: Phone, color: "text-blue-400" },
    { label: "Didn't pick up", value: stats.missed, icon: PhoneOff, color: "text-red-400" },
    { label: "Attendance alerts", value: stats.alerts, icon: AlertTriangle, color: "text-amber-400" },
    { label: "Agent runs", value: stats.runs, icon: Activity, color: "text-violet-glow" },
  ];

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-[10px] font-mono text-muted-foreground">
        <span className="uppercase tracking-widest opacity-70">Agent · 7d</span>
        {items.map(({ label, value, icon: Icon, color }) => (
          <span key={label} className="flex items-center gap-1 bg-surface-2/50 border border-border/30 rounded-full px-2 py-0.5">
            <Icon size={10} className={color} />
            <span className="text-foreground font-semibold">{value}</span>
            <span className="opacity-70">{label}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="glass border border-border/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Agentic activity · last 7 days</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {items.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface-2/40 border border-border/30 rounded-lg p-3 flex items-center gap-3">
            <Icon size={18} className={color} />
            <div>
              <div className="text-xl font-bold text-foreground">{value}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>
      {stats.recent.length > 0 && (
        <div className="mt-3 border-t border-border/30 pt-2 flex flex-col gap-1">
          {stats.recent.map((r, i) => (
            <div key={i} className="text-[11px] font-mono text-muted-foreground flex items-center gap-2 truncate">
              <span className={r.status === "success" ? "text-emerald-400" : r.status === "failed" ? "text-red-400" : "text-amber-400"}>●</span>
              <span className="truncate flex-1">{r.command}</span>
              <span className="opacity-60">{new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
