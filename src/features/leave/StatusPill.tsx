import { cn } from "@/lib/utils";
import type { LeaveStatus } from "./types";

const styles: Record<LeaveStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function StatusPill({ status, className }: { status: LeaveStatus; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
      styles[status],
      className,
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
