import { invokeTeacherFunctionOrThrow } from "@/lib/teacherInvoke";
import { getActiveWorkspace } from "@/lib/activeWorkspace";
import type { TeacherRecord } from "../types";

export async function chat(
  mode: string,
  prompt: string,
  teacher: TeacherRecord | null,
): Promise<string> {
  const data = await invokeTeacherFunctionOrThrow<{ text?: string }>("teacher-ai", {
    mode,
    prompt,
    teacher_id: teacher?.id,
    workspace_id: getActiveWorkspace()?.id ?? teacher?.workspace_id,
  });
  return data?.text ?? "";
}
