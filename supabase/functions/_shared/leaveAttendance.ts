// Single source of truth: sync approved leave → attendance_records.
// Used by leave-review (on approve) and reusable for future flows.
// Skips holidays (school_holiday/vacation) and weekly_off recurring dates.
// Uses ON CONFLICT (student_id, date) DO UPDATE — single bulk upsert.

import { checkHoliday } from "./teacherClasses.ts";

export interface LeaveRow {
  id: string;
  workspace_id: string;
  requester_type: string;        // 'student' | 'teacher'
  requester_id: string;
  from_date: string;             // YYYY-MM-DD
  to_date: string;
  approver_id?: string | null;
  approver_name_snapshot?: string | null;
  status: string;
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  for (let d = a; d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Mark every working day in the leave range as `leave` in attendance_records.
 * Returns the number of rows written and the skipped (holiday) dates.
 */
export async function syncLeaveToAttendance(
  sb: any,
  leave: LeaveRow,
): Promise<{ written: number; skipped: string[] }> {
  if (leave.status !== "approved") return { written: 0, skipped: [] };

  const dates = enumerateDates(leave.from_date, leave.to_date);
  const skipped: string[] = [];
  const eligible: string[] = [];

  for (const d of dates) {
    const h = await checkHoliday(sb, leave.workspace_id, d);
    if (h.is_holiday) skipped.push(d);
    else eligible.push(d);
  }
  if (!eligible.length) return { written: 0, skipped };

  // Staff (teacher / non-teaching) leaves → staff_attendance_days
  if (leave.requester_type !== "student") {
    const staffType = leave.requester_type === "teacher" ? "teacher" : "non_teaching";
    const rows = eligible.map((date) => ({
      workspace_id: leave.workspace_id,
      staff_id: leave.requester_id,
      staff_type: staffType,
      date,
      status: "leave",
      source: "leave_request",
      leave_request_id: leave.id,
      remarks: leave.approver_name_snapshot ?? "Approved leave",
    }));
    const { error } = await sb
      .from("staff_attendance_days")
      .upsert(rows, { onConflict: "staff_id,date" });
    if (error) throw error;
    return { written: rows.length, skipped };
  }

  // Resolve student's class_id once for analytics joins
  const { data: stu } = await sb.from("students")
    .select("id, class_id")
    .eq("id", leave.requester_id)
    .eq("workspace_id", leave.workspace_id)
    .maybeSingle();

  const rows = eligible.map((date) => ({
    workspace_id: leave.workspace_id,
    student_id: leave.requester_id,
    class_id: stu?.class_id ?? null,
    date,
    status: "leave",
    teacher_id: leave.approver_id ?? null,
    reporting_teacher_id: leave.approver_id ?? null,
    reporting_teacher_name_snapshot:
      leave.approver_name_snapshot ?? "Approved leave",
    marked_by: leave.approver_id ?? null,
  }));

  // Bulk upsert — keeps a single source of truth.
  // Overwrites any prior absent/present markings for these dates.
  const { error } = await sb
    .from("attendance_records")
    .upsert(rows, { onConflict: "student_id,date" });
  if (error) throw error;

  return { written: rows.length, skipped };
}
