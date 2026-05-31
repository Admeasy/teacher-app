// Central source of truth for timetable scheduling and stream/subject rules.
import { supabase } from "@/lib/supabase";

export type SchoolLevel = "All" | "Montessori" | "Primary" | "Middle" | "Secondary" | "Senior Secondary";

export interface ActivityConfig {
  enabled: boolean;
  applies_to_classes: number[];
  frequency: "weekly" | "twice_weekly" | "thrice_weekly" | "fortnightly";
  preferred_day: string | null;
  preferred_period: number | null;
}
export interface SportsConfig extends ActivityConfig {
  teacher_id: string | null;
}

export interface TimetableSettings {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  school_level: SchoolLevel;
  start_time: string; // "HH:MM"
  period_duration: number; // minutes
  periods_per_day: number;
  short_break_after: number;
  short_break_duration: number;
  lunch_break_after: number;
  lunch_break_duration: number;
  working_days: string[]; // ["MON","TUE",...]
  library_config?: ActivityConfig;
  sports_config?: SportsConfig;
}

export const DEFAULT_SETTINGS: Omit<TimetableSettings, "id" | "workspace_id"> = {
  name: "Default Schedule",
  is_active: true,
  school_level: "All",
  start_time: "08:00",
  period_duration: 45,
  periods_per_day: 8,
  short_break_after: 3,
  short_break_duration: 15,
  lunch_break_after: 5,
  lunch_break_duration: 30,
  working_days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
  library_config: {
    enabled: true,
    applies_to_classes: [6, 7, 8, 9, 10, 11, 12],
    frequency: "weekly",
    preferred_day: null,
    preferred_period: null,
  },
  sports_config: {
    enabled: true,
    applies_to_classes: [6, 7, 8, 9, 10, 11, 12],
    frequency: "twice_weekly",
    preferred_day: null,
    preferred_period: null,
    teacher_id: null,
  },
};

export interface ScheduleSlot {
  kind: "period" | "break" | "lunch";
  period?: number;
  label: string;
  start: string; // HH:MM
  end: string;
  duration: number;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function buildSchedule(s: Omit<TimetableSettings, "id" | "workspace_id">): ScheduleSlot[] {
  const out: ScheduleSlot[] = [];
  let t = toMin(s.start_time);
  for (let p = 1; p <= s.periods_per_day; p++) {
    const start = t;
    const end = t + s.period_duration;
    out.push({ kind: "period", period: p, label: `P${p}`, start: toHHMM(start), end: toHHMM(end), duration: s.period_duration });
    t = end;
    if (p === s.short_break_after && p !== s.periods_per_day) {
      out.push({ kind: "break", label: `Break ${s.short_break_duration}m`, start: toHHMM(t), end: toHHMM(t + s.short_break_duration), duration: s.short_break_duration });
      t += s.short_break_duration;
    } else if (p === s.lunch_break_after && p !== s.periods_per_day) {
      out.push({ kind: "lunch", label: `Lunch ${s.lunch_break_duration}m`, start: toHHMM(t), end: toHHMM(t + s.lunch_break_duration), duration: s.lunch_break_duration });
      t += s.lunch_break_duration;
    }
  }
  return out;
}

export function periodTimes(s: Omit<TimetableSettings, "id" | "workspace_id">): Record<number, { start: string; end: string }> {
  const map: Record<number, { start: string; end: string }> = {};
  for (const slot of buildSchedule(s)) {
    if (slot.kind === "period" && slot.period) map[slot.period] = { start: slot.start, end: slot.end };
  }
  return map;
}

// Returns IST "now" minutes since midnight + day code.
export function nowIST(): { minutes: number; day: string; date: Date } {
  const now = new Date();
  // IST = UTC+5:30
  const istMs = now.getTime() + (now.getTimezoneOffset() + 330) * 60000;
  const ist = new Date(istMs);
  const day = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][ist.getDay()];
  return { minutes: ist.getHours() * 60 + ist.getMinutes(), day, date: ist };
}

export function currentSlot(s: Omit<TimetableSettings, "id" | "workspace_id">): ScheduleSlot | null {
  const { minutes, day } = nowIST();
  if (!s.working_days.includes(day)) return null;
  for (const slot of buildSchedule(s)) {
    if (toMin(slot.start) <= minutes && minutes < toMin(slot.end)) return slot;
  }
  return null;
}

export async function loadActiveSettings(workspaceId: string): Promise<TimetableSettings | null> {
  const rows = await listSettings(workspaceId);
  return rows.find(r => r.is_active) ?? rows[0] ?? null;
}

export async function listSettings(workspaceId: string): Promise<TimetableSettings[]> {
  const [{ data }, meta] = await Promise.all([
    supabase.from("timetable_settings")
      .select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    loadSettingsMeta(workspaceId),
  ]);
  return ((data as any[]) ?? []).map(row => normalizeSettingsRow(row, meta));
}

type SettingsMeta = Record<string, Partial<TimetableSettings>>;

async function loadSettingsMeta(workspaceId: string): Promise<SettingsMeta> {
  const { data } = await supabase.from("workspaces").select("settings").eq("id", workspaceId).maybeSingle();
  return ((data?.settings as any)?.timetable_profile_meta ?? {}) as SettingsMeta;
}

function normalizeSettingsRow(row: any, meta: SettingsMeta): TimetableSettings {
  const m = meta[row.id] ?? meta[row.name] ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...row,
    school_level: row.school_level ?? m.school_level ?? "All",
    library_config: row.library_config ?? m.library_config ?? DEFAULT_SETTINGS.library_config,
    sports_config: row.sports_config ?? m.sports_config ?? DEFAULT_SETTINGS.sports_config,
    working_days: Array.isArray(row.working_days) ? row.working_days.map((d: string) => String(d).toUpperCase().slice(0, 3)) : DEFAULT_SETTINGS.working_days,
  } as TimetableSettings;
}

// ---------- Stream / subject rules ----------

export type Stream = "Science" | "Commerce" | "Arts" | "Core";

export const STREAM_SUBJECTS: Record<Stream, string[]> = {
  Science: ["Physics", "Chemistry", "Mathematics", "Maths", "Biology", "English", "Hindi", "Computer Science", "Physical Education", "Sports"],
  Commerce: ["Accountancy", "Business Studies", "Economics", "Mathematics", "Maths", "English", "Hindi", "Information Practices", "Physical Education", "Sports"],
  Arts: ["History", "Political Science", "Geography", "Economics", "Sociology", "English", "Hindi", "Physical Education", "Sports"],
  Core: ["Mathematics", "Maths", "Science", "English", "Hindi", "Social Science", "Social Studies", "Computer", "IT", "Computer Science", "Physical Education", "Sports", "Art", "Music", "Library", "Activity"],
};

export const FORBIDDEN_BY_STREAM: Record<Stream, string[]> = {
  Commerce: ["Physics", "Chemistry", "Biology"],
  Arts: ["Physics", "Chemistry", "Biology", "Accountancy"],
  Science: ["Accountancy", "Business Studies", "History", "Political Science", "Geography"],
  Core: ["Sanskrit"],
};

export function streamForClass(classNum: string, declared?: string | null): Stream {
  if (declared && ["Science", "Commerce", "Arts"].includes(declared)) return declared as Stream;
  const n = parseInt(classNum, 10);
  if (n >= 11) return "Science"; // sensible default for 11/12 if not declared
  return "Core";
}

const NEUTRAL_LABELS = new Set(["", "—", "-", "Free Study", "Free Play", "Library", "Sports", "PT", "Activity", "Free", "Drawing", "Art", "Music"]);

export function validateSlotSubject(subject: string, stream: Stream): { ok: boolean; reason?: string } {
  const s = (subject ?? "").trim();
  if (NEUTRAL_LABELS.has(s)) return { ok: true };
  if (/sanskrit/i.test(s)) return { ok: false, reason: "Sanskrit is removed from all classes." };
  const forbidden = FORBIDDEN_BY_STREAM[stream] ?? [];
  for (const f of forbidden) {
    // Exact word match only — avoids false positives on partial strings
    const re = new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(s)) return { ok: false, reason: `${f} is not allowed in ${stream} stream.` };
  }
  return { ok: true };
}

export interface Violation { day: string; period: number; subject: string; reason: string }
export function validateTimetable(
  slots: { day: string; period_number: number; subject: string | null }[],
  stream: Stream,
): Violation[] {
  const out: Violation[] = [];
  for (const s of slots) {
    const raw = (s.subject ?? "").trim();
    if (!raw || raw === "—" || raw === "-") continue;
    // Handle slash subjects — validate each part separately
    const parts = raw.split("/").map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const r = validateSlotSubject(part, stream);
      if (!r.ok) {
        out.push({ day: s.day, period: s.period_number, subject: raw, reason: r.reason! });
        break; // one violation per slot is enough
      }
    }
  }
  return out;
}

// ---------- School-level resolution ----------

const LEVEL_MAP: Array<{ test: (n: number, raw: string) => boolean; level: SchoolLevel }> = [
  { test: (_n, raw) => /nursery|lkg|ukg|kg/i.test(raw), level: "Montessori" },
  { test: (n) => n >= 1 && n <= 5, level: "Primary" },
  { test: (n) => n >= 6 && n <= 8, level: "Middle" },
  { test: (n) => n >= 9 && n <= 10, level: "Secondary" },
  { test: (n) => n >= 11 && n <= 12, level: "Senior Secondary" },
];

export function levelForClass(classLabel: string | number | null | undefined): SchoolLevel {
  const raw = String(classLabel ?? "").trim();
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  for (const e of LEVEL_MAP) {
    if (e.test(isNaN(n) ? -1 : n, raw)) return e.level;
  }
  return "All";
}

/** Resolve which TimetableSettings profile applies to a given class. */
export function getSettingsForClass(
  classLabel: string | number | null | undefined,
  profiles: TimetableSettings[],
): TimetableSettings | null {
  if (!profiles?.length) return null;
  const level = levelForClass(classLabel);
  // Prefer an active profile that targets the exact level
  const exactActive = profiles.find(p => p.is_active && (p.school_level ?? "All") === level);
  if (exactActive) return exactActive;
  const exact = profiles.find(p => (p.school_level ?? "All") === level);
  if (exact) return exact;
  // Fall back to an active "All" profile
  const allActive = profiles.find(p => p.is_active && (p.school_level ?? "All") === "All");
  if (allActive) return allActive;
  return profiles.find(p => p.is_active) ?? profiles[0];
}
