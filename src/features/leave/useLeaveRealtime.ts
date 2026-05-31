import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeaveRequest } from "./types";

/**
 * Subscribes to leave_requests realtime for the workspace and invalidates
 * the matching React Query cache keys so consumers re-render with fresh rows.
 */
export function useLeaveRealtime(workspaceId: string | null, queryKey: readonly unknown[]) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`leaves:${workspaceId}:${queryKey.join(":")}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          // Optimistic cache merge for instant UX; fall back to invalidate.
          qc.setQueryData<LeaveRequest[] | undefined>(queryKey, (prev) => {
            if (!prev) return prev;
            const rec = (payload.new ?? payload.old) as LeaveRequest | undefined;
            if (!rec) return prev;
            if (payload.eventType === "DELETE") return prev.filter((r) => r.id !== rec.id);
            const idx = prev.findIndex((r) => r.id === rec.id);
            if (idx === -1) return [rec, ...prev];
            const next = prev.slice();
            next[idx] = rec;
            return next;
          });
          qc.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, qc, JSON.stringify(queryKey)]);
}
