// Renders a class timetable with the exact 3-row layout requested:
// Row 1: Day | P1 time | P2 time | ... (break/lunch cells merged)
// Row 2: Subject (color-coded)
// Row 3: Teacher (italic, grey)
import { getSubjectColor } from "@/lib/timetableAi";
import { buildSchedule, type TimetableSettings, DEFAULT_SETTINGS } from "@/lib/timetableSettings";
import type { ReactElement } from "react";

export interface TimetableSlotRow {
  day: string;
  period_number: number;
  subject: string | null;
  teacher_name: string | null;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

function splitMulti(value: string | null): string[] {
  if (!value) return [""];
  return value.split("/").map(s => s.trim()).filter(Boolean);
}

export default function TimetableGrid({
  slots, settings, workingDays,
}: {
  slots: TimetableSlotRow[];
  settings?: Partial<TimetableSettings> | null;
  workingDays?: string[];
}) {
  const s = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  const schedule = buildSchedule(s);
  const days = (workingDays ?? s.working_days ?? DAYS).filter(d => DAYS.includes(d));

  function findSlot(day: string, period: number) {
    return slots.find(x => x.day === day && x.period_number === period) ?? null;
  }

  const rows: ReactElement[] = [];
  for (const day of days) {
    rows.push(
      <tr key={day + "-s"} className="border-t-2 border-border align-top">
        <td rowSpan={2} className="px-2 py-2 text-center font-bold text-foreground bg-surface-2 align-middle border-r border-border">{day}</td>
        {schedule.map((slot, i) => {
          if (slot.kind !== "period") {
            return (
              <td key={i} rowSpan={2} className="border-l border-border/40 bg-orange-50 dark:bg-orange-950/20 text-center text-[10px] text-orange-700 dark:text-orange-300 italic">
                {slot.kind === "lunch" ? "Lunch" : "Break"}
              </td>
            );
          }
          const found = findSlot(day, slot.period!);
          const subjects = splitMulti(found?.subject ?? "");
          return (
            <td key={i} className="border-l border-border/40 p-0">
              <div className="flex flex-col">
                {subjects.map((sub, j) => {
                  const color = getSubjectColor(sub || "Free");
                  return (
                    <div key={j}
                      style={{ background: color.bg, color: color.text, borderColor: color.border }}
                      className={`px-1.5 py-1 text-center text-[10px] font-semibold truncate ${j > 0 ? "border-t border-dashed border-border/60" : ""}`}>
                      {sub || "—"}
                    </div>
                  );
                })}
              </div>
            </td>
          );
        })}
      </tr>,
    );
    rows.push(
      <tr key={day + "-t"} className="border-b border-border">
        {schedule.map((slot, i) => {
          if (slot.kind !== "period") return null;
          const found = findSlot(day, slot.period!);
          const teachers = splitMulti(found?.teacher_name ?? "");
          return (
            <td key={i} className="border-l border-border/40 bg-surface-2/60 p-0">
              <div className="flex flex-col">
                {teachers.map((t, j) => (
                  <div key={j} className={`px-1.5 py-1 text-center text-[9px] italic text-muted-foreground truncate ${j > 0 ? "border-t border-dashed border-border/60" : ""}`}>
                    {t || "—"}
                  </div>
                ))}
              </div>
            </td>
          );
        })}
      </tr>,
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-x-auto bg-background">
      <table className="w-full text-[11px] font-mono border-collapse min-w-[800px]">
        <colgroup>
          <col className="w-16" />
          {schedule.map((slot, i) => (
            <col key={i} className={slot.kind === "period" ? "" : "w-20"} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-blue-50 dark:bg-blue-950/30 border-b border-border">
            <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Day</th>
            {schedule.map((slot, i) => slot.kind === "period" ? (
              <th key={i} className="px-2 py-1.5 text-center border-l border-border/40">
                <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300">P{slot.period}</div>
                <div className="text-[9px] text-muted-foreground font-normal">{slot.start}–{slot.end}</div>
              </th>
            ) : (
              <th key={i} className="px-1 py-1.5 text-center border-l border-border/40 bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200">
                <div className="text-[9px] font-bold uppercase">{slot.kind === "lunch" ? "🍽 Lunch" : "☕ Break"}</div>
                <div className="text-[9px] font-normal opacity-80">{slot.duration} min</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
