import { supabase } from "@/integrations/supabase/client";
import { useTeacherStore } from "@/teacher/store/teacherStore";
import { isAuthErrorCode } from "@/lib/teacherSession";

export type TeacherInvokeResult<T> = {
  data: T | null;
  error: Error | null;
};

function authHeaders(): Record<string, string> | undefined {
  const token = useTeacherStore.getState().session?.token;
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}

function clearSessionOnAuthFailure(data: unknown) {
  if (isAuthErrorCode(data)) {
    const code = data.code;
    if (code === "TOKEN_EXPIRED" || code === "TOKEN_INVALID" || code === "AUTH_REQUIRED") {
      useTeacherStore.getState().setSession(null);
    }
  }
}

/**
 * Invokes a protected teacher edge function with the session Bearer token.
 */
export async function invokeTeacherFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<TeacherInvokeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: authHeaders(),
  });

  if (error) {
    const ctx = (error as { context?: Response })?.context;
    if (ctx) {
      try {
        const body = await ctx.clone().json();
        clearSessionOnAuthFailure(body);
      } catch {
        /* ignore */
      }
    }
    return { data: null, error: new Error(error.message || `Failed to call ${name}`) };
  }

  const payload = data as Record<string, unknown> | null;
  if (payload?.error) {
    clearSessionOnAuthFailure(payload);
    return {
      data: null,
      error: new Error(String(payload.error)),
    };
  }

  return { data: data as T, error: null };
}

export async function invokeTeacherFunctionOrThrow<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await invokeTeacherFunction<T>(name, body);
  if (error) throw error;
  return data as T;
}
