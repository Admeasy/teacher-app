import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface TelemetryCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  badge?: string;
  trend?: "up" | "down" | "neutral";
  accent?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function TelemetryCard({ label, value, icon: Icon, badge, trend, accent, className = "", onClick }: TelemetryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl p-5 cursor-default
        ${accent ? "glass glow-violet gradient-border" : "glass"}
        ${onClick ? "cursor-pointer" : ""}
        group transition-all duration-300
        hover:border-[hsl(var(--violet)/0.3)]
        ${className}`}
    >
      {/* Background gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top right, hsl(var(--violet) / 0.08), transparent 70%)` }}
      />

      <div className="relative flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${accent ? "bg-violet/20" : "bg-surface-2"}`}>
            <Icon size={16} className={accent ? "text-violet-glow" : "text-muted-foreground"} />
          </div>
        </div>
        {trend && (
          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
            trend === "up" ? "bg-success-dim text-success" :
            trend === "down" ? "bg-danger-dim text-danger" :
            "bg-surface-2 text-muted-foreground"
          }`}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"}
          </span>
        )}
      </div>

      <div className="relative">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">{label}</div>
        <div className={`text-3xl font-semibold tracking-tight tabular-nums ${accent ? "gradient-text" : "text-foreground"}`}>{value}</div>
        {badge && <div className="text-[10px] text-muted-foreground mt-2 font-mono">{badge}</div>}
      </div>
    </motion.div>
  );
}
