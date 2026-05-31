import { ReactNode } from "react";
import { motion } from "framer-motion";

interface ExecutionCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accentColor?: "violet" | "success" | "warning" | "danger";
  children: ReactNode;
  className?: string;
}

const ACCENT_MAP = {
  violet: { border: "border-violet/30", icon: "text-violet-glow", bg: "bg-violet/5" },
  success: { border: "border-success/30", icon: "text-success", bg: "bg-success/5" },
  warning: { border: "border-warning/30", icon: "text-warning", bg: "bg-warning/5" },
  danger: { border: "border-danger/30", icon: "text-danger", bg: "bg-danger/5" },
};

export default function ExecutionCard({ title, subtitle, icon, accentColor = "violet", children, className = "" }: ExecutionCardProps) {
  const colors = ACCENT_MAP[accentColor];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`glass rounded-xl overflow-hidden ${colors.border} border ${className}`}
    >
      <div className={`px-4 py-3 flex items-center gap-3 border-b border-border/50 ${colors.bg}`}>
        {icon && <span className={colors.icon}>{icon}</span>}
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${colors.icon}`}>{title}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div className="p-4">
        {children}
      </div>
    </motion.div>
  );
}
