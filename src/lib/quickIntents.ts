// Lightweight intent handlers for the AI terminal — workspace mutations
// that bypass the LLM (delete, connect, etc.) with confirm flows.
import { supabase } from "@/lib/supabase";

export interface IntentResult {
  handled: boolean;
  log?: { kind: "ok" | "err" | "sys"; text: string };
  navigate?: string;
}

const lower = (s: string) => (s ?? "").toLowerCase().trim();

/* ──────────────────────────── CONNECT GOOGLE ─────────────────────────── */
export function isConnectGoogleIntent(text: string): boolean {
  const t = lower(text);
  return /^(connect|link|setup|set up|authorize|auth)\s+(google|gmail|calendar|google\s+(calendar|mail))\b/.test(t)
    || /\bconnect\s+google\b/.test(t);
}
export function isDisconnectGoogleIntent(text: string): boolean {
  const t = lower(text);
  return /^(disconnect|unlink|revoke|remove)\s+(google|gmail|calendar)/.test(t);
}

/* ──────────────────────────── DELETE STUDENT ─────────────────────────── */
export function isDeleteStudentIntent(text: string): boolean {
  const t = lower(text);
  return /\bdelete\b.*\bstudent/.test(t) || /\bremove\b.*\bstudent/.test(t);
}

/* ─────────────────────── DELETE TEACHER / MENTOR ─────────────────────── */
function parseEntityDelete(text: string, entity: "teacher" | "mentor"): string | null {
  const re = new RegExp(`\\b(?:delete|remove|drop)\\b\\s+(?:the\\s+)?${entity}s?\\s+(?:named\\s+|called\\s+)?["']?([\\w .'-]+?)["']?$`, "i");
  const m = text.trim().match(re);
  if (m && m[1] && m[1].trim()) return m[1].trim();
  // bare "delete all teachers"
  const bulk = new RegExp(`\\b(?:delete|remove|wipe)\\s+all\\s+${entity}s?\\b`, "i");
  if (bulk.test(text)) return "*";
  return null;
}
export const parseDeleteTeacher = (t: string) => parseEntityDelete(t, "teacher");
export const parseDeleteMentor  = (t: string) => parseEntityDelete(t, "mentor");

/* ───────────────────────── DELETE TIMETABLE ──────────────────────────── */
export interface DeleteTimetableTarget {
  scope: "class_section" | "class" | "today_absent" | "all";
  classNum?: string;
  section?: string;
  day?: string;
  absentTeacher?: string;
}
export function parseDeleteTimetable(text: string): DeleteTimetableTarget | null {
  const t = text.trim();
  if (!/\bdelete\b.*\btimetable\b/i.test(t) && !/\btimetable\b.*\bdelete\b/i.test(t)
      && !/\bclear\b.*\btimetable\b/i.test(t) && !/\bwipe\b.*\btimetable\b/i.test(t)) return null;

  // "delete timetable of today where the absent teacher [name] has class"
  const absent = t.match(/absent\s+teacher\s+(?:is\s+)?([\w .'-]+?)(?:\s+(?:has|have)\b|$)/i);
  if (/\btoday\b/i.test(t) && /absent/i.test(t)) {
    return { scope: "today_absent", absentTeacher: absent?.[1]?.trim() };
  }
  // class + section: "class 12 B" / "12-B" / "12B"
  const cs = t.match(/(?:class\s*)?(\d{1,2})\s*[- ]?\s*([A-Da-d])\b/);
  if (cs) return { scope: "class_section", classNum: cs[1], section: cs[2].toUpperCase() };
  const c = t.match(/\bclass\s+(\d{1,2})\b/i);
  if (c) return { scope: "class", classNum: c[1] };
  if (/\ball\s+timetables?\b/i.test(t)) return { scope: "all" };
  return null;
}

const dayMap: Record<string, string> = {
  sun: "SUN", mon: "MON", tue: "TUE", wed: "WED", thu: "THU", fri: "FRI", sat: "SAT",
};
function todayCode(): string {
  const i = new Date().getDay(); // 0..6
  return ["SUN","MON","TUE","WED","THU","FRI","SAT"][i];
}

/* ─────────────────────── EXECUTION (with confirm) ────────────────────── */
export async function executeDeleteTimetable(
  workspaceId: string,
  target: DeleteTimetableTarget,
  confirmFn: (msg: string) => boolean,
): Promise<IntentResult> {
  let label = "";
  let q = supabase.from("timetable").delete().eq("workspace_id", workspaceId);

  if (target.scope === "class_section") {
    label = `Class ${target.classNum}-${target.section}`;
    q = q.eq("class", target.classNum!).eq("section", target.section!);
  } else if (target.scope === "class") {
    label = `Class ${target.classNum} (all sections)`;
    q = q.eq("class", target.classNum!);
  } else if (target.scope === "today_absent") {
    const day = todayCode();
    label = `${day}${target.absentTeacher ? ` · teacher ${target.absentTeacher}` : ""}`;
    q = q.eq("day", day);
    if (target.absentTeacher) q = q.eq("teacher_name", target.absentTeacher);
  } else if (target.scope === "all") {
    label = "ALL timetables";
  } else {
    return { handled: true, log: { kind: "err", text: "Could not parse timetable delete target." } };
  }

  const ok = confirmFn(`⚠ This will permanently delete the timetable for ${label}. Continue?`);
  if (!ok) return { handled: true, log: { kind: "sys", text: "Cancelled." } };

  const { error, data: deleted } = await q.select("id");
  const count = deleted?.length ?? 0;


  if (error) return { handled: true, log: { kind: "err", text: error.message } };

  window.dispatchEvent(new CustomEvent("admeasy:timetable-updated", { detail: { deleted: true } }));
  return { handled: true, log: { kind: "ok", text: `✅ Deleted ${count ?? 0} timetable row(s) for ${label}.` } };
}

export async function executeDeleteEntity(
  workspaceId: string,
  table: "teachers",
  nameOrAll: string,
  confirmFn: (msg: string) => boolean,
): Promise<IntentResult> {
  let q = supabase.from(table).delete().eq("workspace_id", workspaceId);
  let label = "";
  if (nameOrAll === "*") {
    label = `ALL ${table}`;
  } else {
    label = `${table.slice(0, -1)} "${nameOrAll}"`;
    q = q.ilike("name", nameOrAll);
  }
  const ok = confirmFn(`⚠ This will permanently delete ${label}. Continue?`);
  if (!ok) return { handled: true, log: { kind: "sys", text: "Cancelled." } };
  const { error, data: deleted } = await q.select("id");
  const count = deleted?.length ?? 0;


  if (error) return { handled: true, log: { kind: "err", text: error.message } };
  return { handled: true, log: { kind: "ok", text: `✅ Deleted ${count ?? 0} record(s) — ${label}.` } };
}

export function blockDeleteStudent(): IntentResult {
  return {
    handled: true,
    log: {
      kind: "err",
      text: "⚠ Student records can't be deleted from the AI terminal. Open Settings → Data to remove students safely (this preserves attendance and fee history).",
    },
  };
}
