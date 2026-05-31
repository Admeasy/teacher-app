// Compatibility shim — forwards to the new aiContextStore.
// New code should import from "@/stores/aiContextStore" directly.
import { useBindPageContext, getAIContextSnapshot, type AIContextSnapshot } from "@/stores/aiContextStore";

export interface PageContext {
  route?: string;
  label?: string;
  entity?: string;
  id?: string | null;
  ids?: string[];
  summary?: Record<string, any>;
}

export function useSetPageContext(ctx: PageContext, deps: any[] = []) {
  const mapped: AIContextSnapshot = {
    route: ctx.route,
    routeLabel: ctx.label,
    entity: ctx.entity,
    entityId: ctx.id ?? null,
    entityLabel: ctx.label ?? null,
    visibleIds: ctx.ids,
    summary: ctx.summary,
  };
  useBindPageContext(mapped, deps);
}

export function getPageContext(): PageContext {
  const s = getAIContextSnapshot();
  return { route: s.route, label: s.routeLabel, entity: s.entity ?? undefined, id: s.entityId, ids: s.visibleIds, summary: s.summary };
}
