import { getActiveWorkspace } from "@/lib/activeWorkspace";
import { invokeTeacherFunctionOrThrow } from "@/lib/teacherInvoke";
import type { TeacherImportRow } from "../types";

export const REQUIRED_COLUMNS = ["teacher_id", "teacher_name", "email", "subject"];

export function validateRows(rows: TeacherImportRow[]): TeacherImportRow[] {
  return rows.map((row) => {
    const errors: string[] = [];
    if (!row.teacher_id?.trim()) errors.push("Missing teacher_id");
    if (!row.teacher_name?.trim()) errors.push("Missing teacher_name");
    if (!row.email?.trim()) errors.push("Missing email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) errors.push("Invalid email");
    if (!row.subject?.trim()) errors.push("Missing subject");
    return errors.length ? { ...row, __errors: errors } : row;
  });
}

export interface ImportResult {
  batch_id: string | null;
  inserted: number;
  updated: number;
  deactivated: number;
  skipped: number;
  failed: number;
  db_total: number | null;
  errors: { row: number; error: string }[];
}

export async function importTeachers(rows: TeacherImportRow[], file_name?: string): Promise<ImportResult> {
  const workspace_id = getActiveWorkspace()?.id;
  if (!workspace_id) throw new Error("Select a school first");

  return invokeTeacherFunctionOrThrow<ImportResult>("teacher-import", {
    workspace_id,
    entity: "teachers",
    rows,
    file_name: file_name ?? null,
  });
}
