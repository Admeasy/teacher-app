import { supabase } from "@/integrations/supabase/client";
import { getActiveWorkspace } from "@/lib/activeWorkspace";
import type { TeacherRecord } from "../types";

function requireWorkspaceId(): string {
  const id = getActiveWorkspace()?.id;
  if (!id) throw new Error("Select a school before signing in");
  return id;
}

export async function sendOtp(teacher_id: string, email: string): Promise<{ masked_email: string }> {
  const { data, error } = await supabase.functions.invoke("teacher-send-otp", {
    body: { teacher_id, email, workspace_id: requireWorkspaceId() },
  });
  if (error) throw new Error(error.message || "Failed to send OTP");
  if (data?.success === false) throw new Error(data.message || data.error || "Failed to send OTP");
  return { masked_email: data.masked_email };
}

export async function verifyOtp(teacher_id: string, email: string, code: string): Promise<{ token: string; teacher: TeacherRecord }> {
  const { data, error } = await supabase.functions.invoke("teacher-verify-otp", {
    body: { teacher_id, email, code, workspace_id: requireWorkspaceId() },
  });
  if (error) throw new Error(error.message || "Failed to verify");
  if (data?.success === false) throw new Error(data.error || data.message || "Failed to verify");
  return { token: data.token, teacher: data.teacher };
}
