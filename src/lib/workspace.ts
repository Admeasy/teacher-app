// Hardcoded demo accounts (per spec). Email derived from school id.
export const DEMO_ACCOUNTS = [
  { id: "Schoolid0001", password: "Admin@Schoolid0001" },
  { id: "Schoolid0002", password: "Admin@Schoolid0002" },
] as const;

export const emailFor = (schoolId: string) => `${schoolId.toLowerCase()}@admeasy.local`;

// Module-level mirror of the active workspace id so non-React code (e.g. the voice
// orchestrator singleton) can read it without prop drilling.
let _activeWorkspaceId: string | null = null;
export function setActiveWorkspaceId(id: string | null) { _activeWorkspaceId = id; }
export function getActiveWorkspaceId(): string | null { return _activeWorkspaceId; }
