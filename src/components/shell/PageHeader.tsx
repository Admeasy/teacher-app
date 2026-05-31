import { motion } from "framer-motion";
import ThemeToggle from "@/components/ui/ThemeToggle";

interface Props { breadcrumb: string[]; rightSlot?: React.ReactNode }

export default function PageHeader({ breadcrumb, rightSlot }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-12 glass border-b border-border/40 flex items-center px-6 gap-4 shrink-0"
    >
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider min-w-0">
        {breadcrumb.map((b, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="opacity-30">/</span>}
            <span className={`truncate ${i === breadcrumb.length - 1 ? "text-foreground font-medium" : ""}`}>{b}</span>
          </span>
        ))}
      </div>
      <div className="flex-1" />
      {rightSlot}
      <ThemeToggle compact />
    </motion.div>
  );
}
