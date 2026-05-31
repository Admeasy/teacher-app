import { getActiveWorkspace } from "@/lib/activeWorkspace";
import { invokeTeacherFunctionOrThrow } from "@/lib/teacherInvoke";
import type { TeacherRecord } from "../types";

function workspaceId(): string | undefined {
  return getActiveWorkspace()?.id;
}

export interface DashboardClass {
  id: string;
  class_name: string;
  section: string | null;
  student_count: number;
  attendance_pct: number;
  subject: string | null;
}

export interface DashboardData {
  total_students: number;
  classes_assigned: number;
  attendance_today: { present: number; absent: number; total: number };
  weekly_attendance_pct: number;
  attendance_reports: number;
  pending_evaluations: number;
  ai_usage_count: number;
  classes: DashboardClass[];
  upcoming_tests: { id: string; title: string; subject: string | null; class_id: string | null; created_at: string }[];
  recent_ai: { mode: string | null; prompt: string | null; created_at: string }[];
}

export async function getProfile(teacher_id: string): Promise<TeacherRecord | null> {
  const data = await invokeTeacherFunctionOrThrow<{ teacher?: TeacherRecord }>("teacher-profile", {
    teacher_id,
    workspace_id: workspaceId(),
  });
  return data?.teacher ?? null;
}

export async function updateProfile(
  teacher_id: string,
  updates: Partial<Pick<TeacherRecord, "name" | "subject" | "phone">>,
): Promise<TeacherRecord | null> {
  const data = await invokeTeacherFunctionOrThrow<{ teacher?: TeacherRecord }>("teacher-profile", {
    teacher_id,
    workspace_id: workspaceId(),
    action: "update",
    updates,
  });
  return data?.teacher ?? null;
}

export async function getDashboard(teacher_id: string): Promise<DashboardData | null> {
  return invokeTeacherFunctionOrThrow<DashboardData>("teacher-dashboard", {
    teacher_id,
    workspace_id: workspaceId(),
  });
}
