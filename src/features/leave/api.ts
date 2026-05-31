import { supabase } from "@/integrations/supabase/client";
import { invokeTeacherFunctionOrThrow } from "@/lib/teacherInvoke";
import { useTeacherStore } from "@/teacher/store/teacherStore";
import type { LeaveRequest, LeaveType } from "./types";

type Scope = "requester" | "teacher-inbox" | "admin-inbox" | "admin-all";

const TEACHER_FNS = new Set(["teacher-leave-create"]);

async function invoke<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (TEACHER_FNS.has(fn) && useTeacherStore.getState().session?.token) {
    return invokeTeacherFunctionOrThrow<T>(fn, body);
  }
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const leaveApi = {
  createStudent(input: {
    workspace_id: string; student_id: string;
    leave_type: LeaveType; from_date: string; to_date: string; reason: string;
  }) {
    return invoke<{ ok: true; request: LeaveRequest }>("student-leave-create", input);
  },
  createTeacher(input: {
    workspace_id: string; teacher_id: string;
    leave_type: LeaveType; from_date: string; to_date: string; reason: string;
  }) {
    return invoke<{ ok: true; request: LeaveRequest }>("teacher-leave-create", input);
  },
  review(input: {
    workspace_id: string; leave_id: string;
    action: "approve" | "reject";
    reviewer_type: "teacher" | "admin";
    reviewer_id: string;
    reviewer_name?: string | null;
    response_message?: string | null;
  }) {
    return invoke<{ ok: true; request: LeaveRequest }>("leave-review", input);
  },
  history(input: { workspace_id: string; scope: Scope; actor_id?: string; status?: string; limit?: number }) {
    return invoke<{ ok: true; requests: LeaveRequest[] }>("leave-history", input);
  },
};
