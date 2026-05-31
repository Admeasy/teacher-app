import { motion } from "framer-motion";
import { Calendar, MessageSquare, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "./StatusPill";
import { LEAVE_TYPE_LABELS, type LeaveRequest } from "./types";

function fmtRange(from: string, to: string, days: number) {
  if (from === to) return `${from} · 1 day`;
  return `${from} → ${to} · ${days} days`;
}

interface Props {
  leave: LeaveRequest;
  showRequester?: boolean;
  actions?: React.ReactNode;
  onClick?: () => void;
}

export function LeaveCard({ leave, showRequester, actions, onClick }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <Card
        onClick={onClick}
        className={`p-4 space-y-3 ${onClick ? "cursor-pointer hover:border-primary/40 transition" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {LEAVE_TYPE_LABELS[leave.leave_type]}
              </span>
              <StatusPill status={leave.status} />
            </div>
            {showRequester && (
              <div className="mt-1 flex items-center gap-1.5 text-sm font-medium truncate">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {leave.requester_name_snapshot ?? "Unknown"}
                {leave.class_snapshot && (
                  <span className="text-xs text-muted-foreground">· {leave.class_snapshot}</span>
                )}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {fmtRange(leave.from_date, leave.to_date, leave.total_days)}
            </div>
          </div>
        </div>

        <p className="text-sm text-foreground/90 line-clamp-3">{leave.reason}</p>

        {leave.response_message && (
          <div className="rounded-md border border-border/60 bg-muted/40 p-2.5 text-xs flex gap-2">
            <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium text-muted-foreground mb-0.5">
                {leave.approver_name_snapshot ?? "Reviewer"} replied
              </div>
              <div>{leave.response_message}</div>
            </div>
          </div>
        )}

        {actions && <div className="pt-1">{actions}</div>}
      </Card>
    </motion.div>
  );
}
