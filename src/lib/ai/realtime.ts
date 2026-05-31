import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAIContext } from "@/stores/aiContextStore";

/**
 * Subscribes to operational tables so the AI runtime always has fresh
 * "what just happened" context. Mount once at app shell level.
 */
export function useAIRealtime(workspaceId: string | null) {
  useEffect(() => {
    if (!workspaceId) return;
    const push = useAIContext.getState().pushEvent;

    const channel = supabase
      .channel(`ai-rt-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fee_payments", filter: `workspace_id=eq.${workspaceId}` },
        (p) =>
          push({
            t: Date.now(),
            table: "fee_payments",
            op: p.eventType as any,
            id: (p.new as any)?.id ?? (p.old as any)?.id,
            label: `Fee ${p.eventType.toLowerCase()} — ${(p.new as any)?.fee_name ?? ""}`,
          })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records", filter: `workspace_id=eq.${workspaceId}` },
        (p) =>
          push({
            t: Date.now(),
            table: "attendance_records",
            op: p.eventType as any,
            id: (p.new as any)?.id ?? (p.old as any)?.id,
            label: `Attendance ${p.eventType.toLowerCase()}`,
          })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests", filter: `workspace_id=eq.${workspaceId}` },
        (p) =>
          push({
            t: Date.now(),
            table: "leave_requests",
            op: p.eventType as any,
            id: (p.new as any)?.id ?? (p.old as any)?.id,
            label: `Leave ${p.eventType.toLowerCase()}`,
          })
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_activity_stream", filter: `workspace_id=eq.${workspaceId}` },
        (p) =>
          push({
            t: Date.now(),
            table: "ai_activity_stream",
            op: "INSERT",
            id: (p.new as any)?.id,
            label: (p.new as any)?.label ?? "AI activity",
          })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);
}
