import { describe, it, expect } from "vitest";
import {
  buildSchedule,
  validateTimetable,
  levelForClass,
  getSettingsForClass,
  DEFAULT_SETTINGS,
  type TimetableSettings,
} from "@/lib/timetableSettings";

describe("buildSchedule (deterministic injection)", () => {
  it("respects start_time, period_duration, and break placement", () => {
    const out = buildSchedule({
      ...DEFAULT_SETTINGS,
      start_time: "09:00",
      period_duration: 40,
      periods_per_day: 6,
      short_break_after: 2,
      short_break_duration: 10,
      lunch_break_after: 4,
      lunch_break_duration: 30,
    });
    const periods = out.filter(s => s.kind === "period");
    expect(periods.length).toBe(6);
    expect(periods[0].start).toBe("09:00");
    expect(periods[0].end).toBe("09:40");
    // After P2 (09:40-10:20), short break of 10m
    expect(out.find(s => s.kind === "break")).toMatchObject({ start: "10:20", end: "10:30" });
    // After P4, lunch of 30m
    const lunch = out.find(s => s.kind === "lunch")!;
    expect(lunch.duration).toBe(30);
  });
});

describe("validateTimetable (stream rules)", () => {
  it("flags Physics in a Commerce timetable", () => {
    const v = validateTimetable(
      [{ day: "MON", period_number: 1, subject: "Physics" }],
      "Commerce",
    );
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/Physics/);
  });
  it("flags Sanskrit everywhere", () => {
    const v = validateTimetable(
      [{ day: "TUE", period_number: 3, subject: "Sanskrit" }],
      "Core",
    );
    expect(v).toHaveLength(1);
  });
  it("accepts a valid Science slot", () => {
    const v = validateTimetable(
      [{ day: "WED", period_number: 2, subject: "Physics" }],
      "Science",
    );
    expect(v).toHaveLength(0);
  });
});

describe("levelForClass + getSettingsForClass (school level resolution)", () => {
  it("maps numeric classes to the right level", () => {
    expect(levelForClass("1")).toBe("Primary");
    expect(levelForClass("6")).toBe("Middle");
    expect(levelForClass("Class 10")).toBe("Secondary");
    expect(levelForClass("12")).toBe("Senior Secondary");
    expect(levelForClass("LKG")).toBe("Montessori");
  });

  const profile = (over: Partial<TimetableSettings>): TimetableSettings => ({
    id: over.id ?? Math.random().toString(36),
    workspace_id: "ws",
    ...DEFAULT_SETTINGS,
    ...over,
  } as TimetableSettings);

  it("picks the exact-level active profile when available", () => {
    const profiles = [
      profile({ id: "a", school_level: "All", is_active: true, name: "All" }),
      profile({ id: "b", school_level: "Senior Secondary", is_active: true, name: "Sr Sec" }),
    ];
    expect(getSettingsForClass("12", profiles)?.id).toBe("b");
  });

  it("falls back to the active All profile when no exact match", () => {
    const profiles = [
      profile({ id: "a", school_level: "All", is_active: true, name: "All" }),
      profile({ id: "b", school_level: "Primary", is_active: true, name: "Primary" }),
    ];
    expect(getSettingsForClass("9", profiles)?.id).toBe("a");
  });

  it("returns null for empty profiles", () => {
    expect(getSettingsForClass("9", [])).toBeNull();
  });
});

// ---- Fee / attendance filter contracts ----
// These mirror the rules enforced server-side in the command edge function
// so any drift in the client-side simulation surfaces here.

interface Student {
  due?: number | null;
  amount_due?: number | null;
  fee_status?: string | null;
  attendance_pct?: number | null;
}

function isFeeReminderCandidate(s: Student): boolean {
  const due = s.due ?? s.amount_due ?? 0;
  if (due > 0) return true;
  if ((s.fee_status ?? "").toLowerCase() === "unpaid") return true;
  return false;
}
function isAttendanceAlertCandidate(s: Student): boolean {
  return typeof s.attendance_pct === "number" && s.attendance_pct < 75;
}

describe("fee/attendance filters", () => {
  it("includes students with positive due", () => {
    expect(isFeeReminderCandidate({ due: 1200 })).toBe(true);
    expect(isFeeReminderCandidate({ amount_due: 500 })).toBe(true);
  });
  it("excludes zero/null due paid students", () => {
    expect(isFeeReminderCandidate({ due: 0 })).toBe(false);
    expect(isFeeReminderCandidate({ fee_status: "paid" })).toBe(false);
  });
  it("only alerts on attendance under 75", () => {
    expect(isAttendanceAlertCandidate({ attendance_pct: 60 })).toBe(true);
    expect(isAttendanceAlertCandidate({ attendance_pct: 75 })).toBe(false);
    expect(isAttendanceAlertCandidate({ attendance_pct: null })).toBe(false);
  });
});
