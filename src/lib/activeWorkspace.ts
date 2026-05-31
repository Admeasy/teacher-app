// Active workspace (school) + selected role, persisted in localStorage so the
// onboarding flow (select-school → login) remembers context
// across sessions and can be mirrored to secure storage in the future React
// Native app.
import { setActiveWorkspaceId } from "./workspace";

const WS_KEY = "admeasy.workspace";
const ROLE_KEY = "admeasy.role";

export type AppRole = "teacher";

export interface ActiveWorkspace {
  id: string;
  workspace_id?: string;
  name: string;
  school_name?: string;
  slug?: string | null;
  code?: string | null;
  school_code?: string | null;
  logo_url?: string | null;
  logo?: string | null;
  theme?: string | null;
  role?: AppRole;
}

function normalizeWorkspace(input: ActiveWorkspace): ActiveWorkspace {
  const normalized: ActiveWorkspace = {
    ...input,
    id: input.id || input.workspace_id || "",
    name: input.name || input.school_name || "",
    code: input.code ?? input.school_code ?? null,
    logo_url: input.logo_url ?? input.logo ?? null,
  };
  if (!normalized.workspace_id) normalized.workspace_id = normalized.id;
  if (!normalized.school_name) normalized.school_name = normalized.name;
  if (!normalized.school_code && normalized.code) normalized.school_code = normalized.code;
  if (!normalized.logo && normalized.logo_url) normalized.logo = normalized.logo_url;
  return normalized;
}

export function getActiveWorkspace(): ActiveWorkspace | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(WS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id) return null;
    return parsed as ActiveWorkspace;
  } catch {
    return null;
  }
}

export function setActiveWorkspace(ws: ActiveWorkspace) {
  if (typeof window === "undefined") return;
  const normalized = normalizeWorkspace(ws);
  localStorage.setItem(WS_KEY, JSON.stringify(normalized));
  setActiveWorkspaceId(normalized.id);
}

export function clearActiveWorkspace() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WS_KEY);
  setActiveWorkspaceId(null);
}

export function getActiveRole(): AppRole | null {
  try {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(ROLE_KEY);
    return v === "teacher" ? v : null;
  } catch {
    return null;
  }
}

export function setActiveRole(role: AppRole) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ROLE_KEY, role);
}

export function clearActiveRole() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ROLE_KEY);
}
