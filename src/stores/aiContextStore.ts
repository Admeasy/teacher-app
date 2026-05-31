import { create } from "zustand";
import { useEffect } from "react";

export type EntityKind =
  | "student"
  | "teacher"
  | "staff"
  | "class"
  | "route"
  | "fees"
  | "payroll"
  | "leave"
  | "attendance"
  | "transport"
  | string;

export interface RealtimeEvent {
  t: number;
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  label: string;
  id?: string;
}

export interface RecentAction {
  t: number;
  tool: string;
  summary: string;
  status: "ok" | "error" | "awaiting_approval";
}

export interface AIContextSnapshot {
  route?: string;
  routeLabel?: string;
  tab?: string;
  filters?: Record<string, any>;
  entity?: EntityKind | null;
  entityId?: string | null;
  entityLabel?: string | null;
  visibleIds?: string[];
  summary?: Record<string, any>;
}

interface AIContextState extends AIContextSnapshot {
  recentActions: RecentAction[];
  realtimeEvents: RealtimeEvent[];
  bind: (c: AIContextSnapshot) => void;
  clear: () => void;
  pushAction: (a: RecentAction) => void;
  pushEvent: (e: RealtimeEvent) => void;
  snapshot: () => AIContextSnapshot & {
    recentActions: RecentAction[];
    realtimeEvents: RealtimeEvent[];
  };
}

const MAX_ACTIONS = 20;
const MAX_EVENTS = 50;

export const useAIContext = create<AIContextState>((set, get) => ({
  recentActions: [],
  realtimeEvents: [],
  bind: (c) => set(c),
  clear: () =>
    set({
      route: undefined,
      routeLabel: undefined,
      tab: undefined,
      filters: undefined,
      entity: null,
      entityId: null,
      entityLabel: null,
      visibleIds: undefined,
      summary: undefined,
    }),
  pushAction: (a) =>
    set((s) => ({ recentActions: [a, ...s.recentActions].slice(0, MAX_ACTIONS) })),
  pushEvent: (e) =>
    set((s) => ({ realtimeEvents: [e, ...s.realtimeEvents].slice(0, MAX_EVENTS) })),
  snapshot: () => {
    const { recentActions, realtimeEvents, bind, clear, pushAction, pushEvent, snapshot, ...rest } =
      get() as any;
    return { ...(rest as AIContextSnapshot), recentActions, realtimeEvents };
  },
}));

/**
 * Bind the current page's AI context. Pages call this on mount;
 * context is cleared when the component unmounts so the next route starts fresh.
 */
export function useBindPageContext(ctx: AIContextSnapshot, deps: any[] = []) {
  const bind = useAIContext((s) => s.bind);
  const clear = useAIContext((s) => s.clear);
  useEffect(() => {
    bind(ctx);
    return () => clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function getAIContextSnapshot() {
  return useAIContext.getState().snapshot();
}
