// ═══════════════════════════════════════════════════════════════════════════
//  Admeasy — timetable-ai  v3  (production)
// ═══════════════════════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

interface TimetableSettings {
  id: string;
  name: string;
  is_active: boolean;
  school_level: string;
  start_time: string;
  period_duration: number;
  periods_per_day: number;
  short_break_after: number;
  short_break_duration: number;
  lunch_break_after: number;
  lunch_break_duration: number;
  working_days: string[];
  library_config: LibraryConfig;
  sports_config: SportsConfig;
}

interface LibraryConfig {
  enabled: boolean;
  applies_to_classes: number[];
  frequency: string;
  preferred_day: string | null;
  preferred_period: number | null;
}

interface SportsConfig extends LibraryConfig {
  teacher_id: string | null;
}

interface PeriodTime { start: string; end: string }
type PeriodMap = Record<number, PeriodTime>;

interface PeriodSlot {
  period: number;
  subject: string;
  teacher: string;
  time_start: string;
  time_end: string;
  slash_subject?: string;
  slash_teacher?: string;
}

type WeekTimetable = Record<string, PeriodSlot[]>;

function toMin(t: string): number {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function buildPeriodMap(s: TimetableSettings): PeriodMap {
  const map: PeriodMap = {};
  let cur = toMin(s.start_time);
  for (let p = 1; p <= s.periods_per_day; p++) {
    map[p] = { start: toHHMM(cur), end: toHHMM(cur + s.period_duration) };
    cur += s.period_duration;
    if (s.short_break_after > 0 && p === s.short_break_after) cur += s.short_break_duration;
    if (p === s.lunch_break_after) cur += s.lunch_break_duration;
  }
  return map;
}

function scheduleDescription(s: TimetableSettings, map: PeriodMap): string {
  const lines = [
    `School level: ${s.school_level}`,
    `Start time: ${s.start_time}`,
    `Period duration: ${s.period_duration} min`,
    `Periods per day: ${s.periods_per_day}`,
    `Working days: ${s.working_days.join(", ")}`,
  ];
  if (s.short_break_after > 0 && s.short_break_duration > 0) {
    lines.push(`Short break: ${s.short_break_duration} min after P${s.short_break_after} (ends ${map[s.short_break_after]?.end ?? "?"})`);
  }
  lines.push(`Lunch break: ${s.lunch_break_duration} min after P${s.lunch_break_after} (ends ${map[s.lunch_break_after]?.end ?? "?"})`);
  lines.push("\nCANONICAL PERIOD TIMES — use EXACTLY these, no rounding, no shifting:");
  for (let p = 1; p <= s.periods_per_day; p++) {
    lines.push(`  P${p}: ${map[p].start} – ${map[p].end}`);
  }
  return lines.join("\n");
}

function schoolLevel(classNum: string): string {
  const n = parseInt(classNum.replace(/\D/g, ""), 10);
  if (isNaN(n) || n <= 0) return "Montessori";
  if (n <= 5) return "Primary";
  if (n <= 8) return "Middle";
  if (n <= 10) return "Secondary";
  return "Senior Secondary";
}

function resolveSettings(profiles: TimetableSettings[], classNum: string): TimetableSettings {
  const level = schoolLevel(classNum);
  const defaults: TimetableSettings = {
    id: "default",
    name: "Default",
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
    library_config: { enabled: true, applies_to_classes: [6,7,8,9,10,11,12], frequency: "weekly", preferred_day: null, preferred_period: null },
    sports_config: { enabled: true, applies_to_classes: [6,7,8,9,10,11,12], frequency: "twice_weekly", preferred_day: null, preferred_period: null, teacher_id: null },
  };
  if (!profiles.length) return defaults;

  const normalise = (p: any): TimetableSettings => ({
    ...defaults,
    ...p,
    school_level: p.school_level ?? "All",
    working_days: Array.isArray(p.working_days)
      ? p.working_days.map((d: string) => String(d).toUpperCase().slice(0, 3))
      : defaults.working_days,
    library_config: p.library_config ?? defaults.library_config,
    sports_config: p.sports_config ?? defaults.sports_config,
    period_duration: Number(p.period_duration ?? 45),
    periods_per_day: Number(p.periods_per_day ?? 8),
    short_break_after: Number(p.short_break_after ?? 3),
    short_break_duration: Number(p.short_break_duration ?? 15),
    lunch_break_after: Number(p.lunch_break_after ?? 5),
    lunch_break_duration: Number(p.lunch_break_duration ?? 30),
  });

  const ps = profiles.map(normalise);
  return (
    ps.find(p => p.is_active && p.school_level === level) ??
    ps.find(p => p.school_level === level) ??
    ps.find(p => p.is_active && (p.school_level === "All" || !p.school_level)) ??
    ps.find(p => p.is_active) ??
    ps[0]
  );
}

const FORBIDDEN_BY_STREAM: Record<string, string[]> = {
  Science:  ["Accountancy", "Business Studies", "History", "Political Science", "Geography"],
  Commerce: ["Physics", "Chemistry", "Biology"],
  Arts:     ["Physics", "Chemistry", "Biology", "Accountancy"],
  Core:     ["Sanskrit"],
};

const NEUTRAL = new Set(["", "—", "-", "Free Study", "Free Play", "Library", "Sports", "PT", "Activity", "Free", "Drawing", "Art", "Music"]);

function validateSubjectForStream(subject: string, stream: string): string | null {
  const s = (subject ?? "").trim();
  if (NEUTRAL.has(s)) return null;
  if (/sanskrit/i.test(s)) return "Sanskrit is removed from all classes";
  const banned = FORBIDDEN_BY_STREAM[stream] ?? [];
  for (const f of banned) {
    if (new RegExp(`\\b${f}\\b`, "i").test(s)) return `${f} is forbidden in ${stream} stream`;
  }
  return null;
}

interface StreamViolation { day: string; period: number; subject: string; reason: string }

function detectStreamViolations(timetable: WeekTimetable, stream: string): StreamViolation[] {
  const out: StreamViolation[] = [];
  for (const [day, slots] of Object.entries(timetable)) {
    for (const slot of slots) {
      const parts = (slot.subject ?? "").split("/").map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const err = validateSubjectForStream(part, stream);
        if (err) { out.push({ day, period: slot.period, subject: slot.subject, reason: err }); break; }
      }
    }
  }
  return out;
}

interface Collision {
  type: "teacher_double_booked" | "class_double_booked";
  day: string; period: number; details: string;
}

function detectCollisions(timetable: WeekTimetable, existingSlots: any[], classNum: string, section: string): Collision[] {
  const out: Collision[] = [];
  const teacherMap: Record<string, string> = {};
  for (const s of existingSlots) {
    if (s.teacher_name) {
      teacherMap[`${s.day}|${s.period_number ?? s.period}|${s.teacher_name.toLowerCase()}`] = `${s.class}-${s.section}`;
    }
  }
  for (const [day, slots] of Object.entries(timetable)) {
    const periodSet = new Set<number>();
    for (const slot of slots) {
      if (periodSet.has(slot.period)) {
        out.push({ type: "class_double_booked", day, period: slot.period, details: `P${slot.period} on ${day} appears twice` });
      }
      periodSet.add(slot.period);
      if (!slot.teacher) continue;
      const teachers = slot.teacher.split("/").map(t => t.trim()).filter(Boolean);
      for (const t of teachers) {
        const key = `${day}|${slot.period}|${t.toLowerCase()}`;
        if (teacherMap[key]) {
          out.push({ type: "teacher_double_booked", day, period: slot.period, details: `${t} already teaching ${teacherMap[key]} at P${slot.period} on ${day}` });
        } else {
          teacherMap[key] = `${classNum}-${section}`;
        }
      }
    }
  }
  return out;
}

function freqPerWeek(freq: string, workingDays: number): number {
  if (freq === "twice_weekly") return 2;
  if (freq === "thrice_weekly") return 3;
  if (freq === "fortnightly") return Math.max(1, Math.round(workingDays / 2));
  return 1;
}

async function callAI(prompt: string, key: string, maxTokens = 4000): Promise<any | null> {
  for (const model of MODELS) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.admeasy.in",
          "X-Title": "Admeasy Timetable AI",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.05,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) { console.warn(`[TIMETABLE_AI] ${model} → ${res.status}`); continue; }
      const d = await res.json();
      const raw: string = d.choices?.[0]?.message?.content ?? "";
      if (raw.length > 20) {
        try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
        catch (e) { console.warn(`[TIMETABLE_AI] JSON parse failed for ${model}`, e); continue; }
      }
    } catch (e) { console.error(`[TIMETABLE_AI] ${model} exception`, e); }
  }
  return null;
}

async function generateTimetable(opts: {
  workspace_id: string;
  classNum: string;
  section: string;
  settings: TimetableSettings;
  periodMap: PeriodMap;
  teachers: any[];
  classSubjects: any[];
  existingTimetable: any[];
  stream: string;
  classTeacher: string | null;
  constraints: string;
  key: string;
}): Promise<any> {
  const {
    classNum, section, settings, periodMap, teachers, classSubjects,
    existingTimetable, stream, classTeacher, constraints, key,
  } = opts;

  const days = settings.working_days.filter(d => ["MON","TUE","WED","THU","FRI","SAT"].includes(d));
  const classNumInt = parseInt(classNum.replace(/\D/g, ""), 10);

  const teacherPeriodLoad: Record<string, number> = {};
  for (const slot of existingTimetable) {
    if (slot.teacher_name) {
      const names = slot.teacher_name.split("/").map((t: string) => t.trim());
      for (const n of names) teacherPeriodLoad[n] = (teacherPeriodLoad[n] ?? 0) + 1;
    }
  }

  const teacherList = teachers.map((t: any) => ({
    name: t.name,
    subject: t.subject,
    current_load: teacherPeriodLoad[t.name] ?? 0,
  }));

  const subjectConfig = classSubjects.length > 0
    ? classSubjects.map((s: any) => ({
        subject: s.subject,
        kind: s.kind,
        periods_per_week: s.periods_per_week,
        teacher: s.teacher_name ?? null,
        optional_group: s.optional_group ?? null,
      }))
    : [];

  const libEnabled = settings.library_config?.enabled &&
    (settings.library_config.applies_to_classes ?? []).includes(classNumInt);
  const sportsEnabled = settings.sports_config?.enabled &&
    (settings.sports_config.applies_to_classes ?? []).includes(classNumInt);
  const libPerWeek = libEnabled ? freqPerWeek(settings.library_config.frequency, days.length) : 0;
  const sportsPerWeek = sportsEnabled ? freqPerWeek(settings.sports_config.frequency, days.length) : 0;
  const sportsTeacherName = sportsEnabled && settings.sports_config.teacher_id
    ? (teachers.find((t: any) => t.id === settings.sports_config.teacher_id)?.name ?? null)
    : null;

  const emptyGrid: Record<string, Array<{ period: number; time_start: string; time_end: string }>> = {};
  for (const day of days) {
    emptyGrid[day] = [];
    for (let p = 1; p <= settings.periods_per_day; p++) {
      emptyGrid[day].push({ period: p, time_start: periodMap[p].start, time_end: periodMap[p].end });
    }
  }

  const prompt = `You are a school timetable scheduling engine. Your ONLY job is to assign subjects and teachers to the period grid provided. DO NOT change times, add periods, or modify the grid structure.

═══════════════════════════════════════
CLASS CONTEXT
═══════════════════════════════════════
Class: ${classNum}-${section}
School Level: ${settings.school_level}
Stream: ${stream}
Class Teacher: ${classTeacher ?? "Not assigned"}

═══════════════════════════════════════
SCHEDULE — USE THESE TIMES EXACTLY
═══════════════════════════════════════
${scheduleDescription(settings, periodMap)}

═══════════════════════════════════════
AVAILABLE TEACHERS (from DB — ONLY use these names)
═══════════════════════════════════════
${JSON.stringify(teacherList, null, 2)}

═══════════════════════════════════════
${subjectConfig.length > 0 ? "CONFIGURED SUBJECTS (from class_subjects table — use these periods_per_week)" : "NO SUBJECT CONFIG — infer from school level and stream"}
═══════════════════════════════════════
${subjectConfig.length > 0 ? JSON.stringify(subjectConfig, null, 2) : "Derive subjects from SUBJECT RULES below."}

═══════════════════════════════════════
EXISTING TIMETABLE (reference — learn from this if regenerating)
═══════════════════════════════════════
${existingTimetable.length > 0
  ? JSON.stringify(existingTimetable.map((s: any) => ({
      day: s.day, period: s.period_number ?? s.period,
      subject: s.subject, teacher: s.teacher_name,
    })))
  : "No existing timetable — generate fresh."}

═══════════════════════════════════════
ACTIVITY REQUIREMENTS
═══════════════════════════════════════
Library: ${libEnabled ? `${libPerWeek}x/week` : "disabled for this class"}
Sports/PT: ${sportsEnabled ? `${sportsPerWeek}x/week${sportsTeacherName ? ` (teacher: ${sportsTeacherName})` : ""}` : "disabled for this class"}
${settings.library_config?.preferred_day ? `Library preferred day: ${settings.library_config.preferred_day}` : ""}
${settings.library_config?.preferred_period ? `Library preferred period: P${settings.library_config.preferred_period}` : ""}
${settings.sports_config?.preferred_day ? `Sports preferred day: ${settings.sports_config.preferred_day}` : ""}

═══════════════════════════════════════
ADDITIONAL CONSTRAINTS
═══════════════════════════════════════
${constraints || "None"}

═══════════════════════════════════════
SUBJECT RULES BY SCHOOL LEVEL (ONLY use the rules for ${settings.school_level})
═══════════════════════════════════════
Montessori (Nursery–UKG): English, Hindi, Maths. Remaining = "Free Play" with class teacher.
Primary 1–2: English, Hindi, Maths. Activity: Sports, Library (from settings). Remaining = repeat core.
Primary 3–5: English, Hindi, Maths, EVS. Optional Computer/IT only if teacher available. Activity: Sports, Library.
Middle 6–8 (Core stream): Maths, English, Hindi, Science, Social Science. Optional group SAME SLOT: Computer/IT. Activity: Sports, Library.
Secondary 9–10 (Core stream): Maths, English, Hindi, Science, Social Science. Optional group SAME SLOT: IT/AI. Activity: Sports, Library.
Sr Sec 11–12 Science: Mathematics, English, Physics, Chemistry daily. Optional grp1 SAME SLOT 3x/wk: Biology / Computer Science. Optional grp2 SAME SLOT 2x/wk: Physical Education / Hindi. Activity: Sports, Library.
Sr Sec 11–12 Commerce: English, Business Studies, Accountancy, Economics daily. Optional grp1 SAME SLOT 3x/wk: Mathematics / Information Practices. Optional grp2 SAME SLOT 2x/wk: Physical Education / Hindi. Activity: Sports, Library.
Sr Sec 11–12 Arts: English + 3 of [History, Political Science, Geography, Economics] daily. Optional grp1 SAME SLOT 3x/wk: Mathematics / Information Practices. Optional grp2 SAME SLOT 2x/wk: Physical Education / Hindi. Activity: Sports, Library.

═══════════════════════════════════════
HARD RULES
═══════════════════════════════════════
1. NEVER change period times — use the canonical times EXACTLY.
2. NEVER add or remove periods — fill exactly the slots in EMPTY GRID below.
3. ONLY assign teacher names from AVAILABLE TEACHERS list. If no teacher available, use "— / —" or "TBD".
4. NEVER double-book a teacher at the same day+period across classes.
5. STREAM VIOLATIONS are absolute bans — do not assign forbidden subjects (see stream: ${stream}).
   - Science: FORBIDDEN Accountancy, Business Studies, History, Political Science, Geography
   - Commerce: FORBIDDEN Physics, Chemistry, Biology
   - Arts: FORBIDDEN Physics, Chemistry, Biology, Accountancy
   - All: FORBIDDEN Sanskrit
6. Optional groups = two subjects sharing the SAME period slot every occurrence. Format: "Biology / Computer Science", teacher: "Ms. X / Mr. Y".
7. Distribute subjects evenly — core subjects should appear ~daily. No subject > 1 period per day unless periods_per_day ≤ 5.
8. No teacher > 6 periods/day.
9. NEVER leave a period empty. Use "Free Study" + class teacher if all subjects exhausted.
10. If class_subjects config is provided, respect the periods_per_week counts.

═══════════════════════════════════════
EMPTY GRID — FILL ONLY SUBJECT AND TEACHER FIELDS
═══════════════════════════════════════
${JSON.stringify(emptyGrid, null, 2)}

Return ONLY valid JSON, no markdown, no explanation:
{
  "summary": "one-line description",
  "timetable": {
    "MON": [
      { "period": 1, "subject": "Mathematics", "teacher": "Ramesh Mishra", "time_start": "${periodMap[1]?.start}", "time_end": "${periodMap[1]?.end}" }
    ]
  }
}`;

  const result = await callAI(prompt, key, 4000);
  if (!result?.timetable) return null;

  for (const [day, slots] of Object.entries(result.timetable as WeekTimetable)) {
    result.timetable[day] = (slots as any[]).map((slot: any) => {
      const p = Number(slot.period);
      return {
        period: p,
        subject: (slot.subject ?? "Free Study").trim(),
        teacher: (slot.teacher ?? "TBD").trim(),
        time_start: periodMap[p]?.start ?? slot.time_start ?? "",
        time_end: periodMap[p]?.end ?? slot.time_end ?? "",
        slash_subject: slot.slash_subject ?? null,
        slash_teacher: slot.slash_teacher ?? null,
      };
    });
  }

  return result;
}

async function saveTimetableSlots(
  sb: ReturnType<typeof createClient>,
  workspace_id: string,
  classNum: string,
  section: string,
  timetable: WeekTimetable,
): Promise<{ saved: number; errors: number }> {
  await sb.from("timetable").delete()
    .eq("workspace_id", workspace_id)
    .eq("class", classNum)
    .eq("section", section);

  const rows: any[] = [];
  for (const [day, slots] of Object.entries(timetable)) {
    for (const slot of slots) {
      if (!slot.subject) continue;
      rows.push({
        workspace_id,
        class: classNum,
        section,
        day: day.toUpperCase().slice(0, 3),
        period_number: Number(slot.period),
        subject: slot.subject,
        teacher_name: slot.teacher || null,
        slash_subject: slot.slash_subject || null,
        slash_teacher: slot.slash_teacher || null,
        created_at: new Date().toISOString(),
      });
    }
  }

  if (!rows.length) return { saved: 0, errors: 0 };
  const { error } = await sb.from("timetable").insert(rows);
  if (error) { console.error("[SAVE_TIMETABLE]", error); return { saved: 0, errors: rows.length }; }
  return { saved: rows.length, errors: 0 };
}

async function fetchTimetable(
  sb: ReturnType<typeof createClient>,
  workspace_id: string,
  classNum?: string,
  section?: string,
  day?: string,
): Promise<any[]> {
  let q = sb.from("timetable")
    .select("id, class, section, day, period_number, subject, teacher_name, slash_subject, slash_teacher")
    .eq("workspace_id", workspace_id)
    .order("class").order("section").order("day").order("period_number");
  if (classNum) q = q.eq("class", classNum);
  if (section) q = q.eq("section", section);
  if (day) q = q.eq("day", day.toUpperCase().slice(0, 3));
  const { data, error } = await q.limit(2000);
  if (error) { console.error("[FETCH_TIMETABLE]", error); return []; }
  return data ?? [];
}

function parseTimetableRows(rows: any[][], periodMap: PeriodMap): WeekTimetable {
  const tt: WeekTimetable = {};
  let currentDay = "";
  const DAYS = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const first = String(row[0] || "").trim().toUpperCase().slice(0, 3);
    if (DAYS.has(String(row[0] || "").trim().toUpperCase())) {
      currentDay = first;
      tt[currentDay] = [];
      for (let p = 0; p < row.slice(1).length; p++) {
        const subj = String(row[p + 1] || "").trim();
        if (subj) tt[currentDay].push({ period: p + 1, subject: subj, teacher: "", time_start: periodMap[p + 1]?.start ?? "", time_end: periodMap[p + 1]?.end ?? "" });
      }
    } else if (!first && currentDay) {
      for (let p = 0; p < row.slice(1).length; p++) {
        const tchr = String(row[p + 1] || "").trim();
        if (tchr && tt[currentDay]?.[p]) tt[currentDay][p].teacher = tchr;
      }
    }
  }
  return tt;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return json(200, { ok: true });

    const rawBody = await req.text();
    if (!rawBody?.trim()) return json(400, { error: "Empty body" });
    let body: any;
    try { body = JSON.parse(rawBody); }
    catch { return json(400, { error: "Invalid JSON" }); }

    const KEY = Deno.env.get("OPENROUTER_API_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const {
      mode = "generate",
      workspace_id,
      class: classNum,
      section,
      constraints = "",
      timetable_rows,
      timetable,
      apply_all,
      sections: targetSections,
      day,
      format,
    } = body;

    if (!workspace_id) return json(400, { error: "Missing workspace_id" });

    if (mode === "fetch_settings") {
      const { data, error } = await sb.from("timetable_settings")
        .select("*").eq("workspace_id", workspace_id)
        .order("is_active", { ascending: false });
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, profiles: data ?? [] });
    }

    if (mode === "fetch") {
      const slots = await fetchTimetable(sb, workspace_id, classNum, section, day);
      const grouped: Record<string, Record<string, any[]>> = {};
      for (const slot of slots) {
        const k = `${slot.class}-${slot.section}`;
        if (!grouped[k]) grouped[k] = {};
        if (!grouped[k][slot.day]) grouped[k][slot.day] = [];
        grouped[k][slot.day].push(slot);
      }
      let periodTimes: PeriodMap = {};
      if (classNum) {
        const { data: ps } = await sb.from("timetable_settings").select("*").eq("workspace_id", workspace_id);
        const settings = resolveSettings(ps ?? [], classNum);
        periodTimes = buildPeriodMap(settings);
      }
      return json(200, { ok: true, slots, grouped, total: slots.length, period_times: periodTimes });
    }

    if (mode === "export") {
      const slots = await fetchTimetable(sb, workspace_id, classNum, section, day);
      if (format === "csv") {
        const header = "Class,Section,Day,Period,Subject,Teacher";
        const rows = slots.map((s: any) =>
          `${s.class},${s.section},${s.day},${s.period_number},"${s.subject}","${s.teacher_name || ""}"`
        );
        return new Response([header, ...rows].join("\n"), {
          status: 200,
          headers: { ...CORS, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="timetable-${classNum || "all"}.csv"` },
        });
      }
      return json(200, { ok: true, slots, total: slots.length });
    }

    if (mode === "save") {
      if (!classNum || !section || !timetable) return json(400, { error: "Missing class, section, or timetable" });
      if (apply_all && Array.isArray(targetSections) && targetSections.length) {
        const results: any[] = [];
        for (const sec of targetSections) {
          const r = await saveTimetableSlots(sb, workspace_id, classNum, sec, timetable);
          results.push({ section: sec, ...r });
        }
        return json(200, { ok: true, apply_all: true, results, total_saved: results.reduce((a: number, r: any) => a + r.saved, 0) });
      }
      const result = await saveTimetableSlots(sb, workspace_id, classNum, section, timetable);
      return json(200, { ok: true, ...result, class: classNum, section });
    }

    if (mode === "parse_xlsx") {
      if (!Array.isArray(timetable_rows)) return json(400, { error: "timetable_rows must be 2D array" });
      const { data: ps } = await sb.from("timetable_settings").select("*").eq("workspace_id", workspace_id);
      const settings = resolveSettings(ps ?? [], classNum ?? "1");
      const periodMap = buildPeriodMap(settings);
      const parsed = parseTimetableRows(timetable_rows, periodMap);
      return json(200, { ok: true, timetable: parsed, days: Object.keys(parsed).length, slots: Object.values(parsed).reduce((a, s) => a + s.length, 0) });
    }

    if (mode === "generate") {
      if (!classNum || !section) return json(400, { error: "Missing class or section" });

      const t0 = performance.now();

      const { data: settingsRows } = await sb.from("timetable_settings")
        .select("*").eq("workspace_id", workspace_id).order("updated_at", { ascending: false });
      const settings = resolveSettings(settingsRows ?? [], classNum);
      const periodMap = buildPeriodMap(settings);

      const { data: allTeachers } = await sb.from("teachers")
        .select("*").eq("workspace_id", workspace_id).limit(100);
      const teachers = allTeachers ?? [];

      const { data: classSubjectsRaw } = await sb.from("class_subjects")
        .select("*").eq("workspace_id", workspace_id).eq("class", classNum).limit(50);
      const classSubjects = (classSubjectsRaw ?? []).filter((s: any) =>
        !s.stream || s.stream === "Core" || s.stream === body.stream
      );

      const { data: existingTimetable } = await sb.from("timetable")
        .select("day, period_number, subject, teacher_name")
        .eq("workspace_id", workspace_id)
        .eq("class", classNum)
        .eq("section", section)
        .order("day").order("period_number");

      const { data: otherSlots } = await sb.from("timetable")
        .select("day, period_number, teacher_name, class, section")
        .eq("workspace_id", workspace_id)
        .neq("class", classNum)
        .limit(2000);

      const { data: assignments } = await sb.from("class_assignments")
        .select("role, teacher_name")
        .eq("workspace_id", workspace_id)
        .eq("class", classNum)
        .eq("section", section);

      const streamTag = (assignments ?? []).find((a: any) => a.role === "stream_tag")?.teacher_name;
      const classTeacher = (assignments ?? []).find((a: any) => a.role === "class_teacher")?.teacher_name ?? null;

      const classNumInt = parseInt(classNum.replace(/\D/g, ""), 10);
      let stream = "Core";
      if (streamTag && ["Science", "Commerce", "Arts"].includes(streamTag)) {
        stream = streamTag;
      } else if (body.stream && ["Science", "Commerce", "Arts"].includes(body.stream)) {
        stream = body.stream;
      } else if (classNumInt >= 11) {
        stream = "Science";
      }

      console.info(`[TIMETABLE_GEN] ${classNum}-${section} level=${settings.school_level} stream=${stream} teachers=${teachers.length} existing=${(existingTimetable ?? []).length}`);

      if (!teachers.length) {
        return json(400, { error: "No teachers found. Please add teachers to your workspace first." });
      }

      const generated = await generateTimetable({
        workspace_id,
        classNum,
        section,
        settings,
        periodMap,
        teachers,
        classSubjects,
        existingTimetable: existingTimetable ?? [],
        stream,
        classTeacher,
        constraints,
        key: KEY,
      });

      if (!generated) {
        return json(500, { ok: false, error: "AI generation failed after all model attempts. Please retry." });
      }

      const collisions = detectCollisions(generated.timetable, otherSlots ?? [], classNum, section);
      const streamViolations = detectStreamViolations(generated.timetable, stream);

      const latencyMs = Math.round(performance.now() - t0);
      console.info(`[TIMETABLE_GEN] done in ${latencyMs}ms collisions=${collisions.length} stream_violations=${streamViolations.length}`);

      const { data: studentSections } = await sb.from("students")
        .select("section").eq("workspace_id", workspace_id).eq("class", classNum);
      const sectionsSet = new Set<string>([section]);
      (studentSections ?? []).forEach((r: any) => r.section && sectionsSet.add(String(r.section)));

      return json(200, {
        ok: true,
        phase: "preview",
        class: classNum,
        section,
        stream,
        school_level: settings.school_level,
        timetable: generated.timetable,
        summary: generated.summary ?? `Class ${classNum}-${section} timetable generated`,
        conflicts: collisions,
        stream_violations: streamViolations,
        collision_count: collisions.length,
        stream_violation_count: streamViolations.length,
        available_sections: Array.from(sectionsSet).sort(),
        settings_used: {
          name: settings.name,
          school_level: settings.school_level,
          start_time: settings.start_time,
          period_duration: settings.period_duration,
          periods_per_day: settings.periods_per_day,
          working_days: settings.working_days,
          lunch_after: settings.lunch_break_after,
          lunch_duration: settings.lunch_break_duration,
        },
        period_times: periodMap,
        meta: {
          latency_ms: latencyMs,
          teachers_loaded: teachers.length,
          class_subjects_loaded: classSubjects.length,
          existing_rows: (existingTimetable ?? []).length,
          other_class_rows: (otherSlots ?? []).length,
        },
      });
    }

    return json(400, { error: `Unknown mode: ${mode}` });

  } catch (e: any) {
    console.error("[TIMETABLE_AI_FATAL]", e);
    return json(500, { ok: false, error: e?.message ?? "Unknown error", stack: String(e?.stack ?? "").slice(0, 2000) });
  }
});
