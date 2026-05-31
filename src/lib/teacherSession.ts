import { getActiveWorkspace } from "@/lib/activeWorkspace";
import type { TeacherSession } from "@/teacher/types";

export type TeacherJwtPayload = {
  sub?: string;
  tid?: string;
  ws?: string;
  role?: string;
  exp?: number;
  iat?: number;
  aud?: string;
  iss?: string;
};

/** Decode JWT payload without verifying (client-side expiry/workspace checks only). */
export function decodeTeacherJwt(token: string): TeacherJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as TeacherJwtPayload;
  } catch {
    return null;
  }
}

export function isTeacherTokenExpired(token: string): boolean {
  const payload = decodeTeacherJwt(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now();
}

/**
 * Validates persisted session against token expiry and active school context.
 * Signature verification happens only on the server.
 */
export function validateTeacherSession(session: TeacherSession | null | undefined): boolean {
  if (!session?.token || !session.teacher?.id) return false;
  if (isTeacherTokenExpired(session.token)) return false;

  const payload = decodeTeacherJwt(session.token);
  if (!payload?.sub || payload.sub !== session.teacher.id) return false;
  if (payload.ws && session.teacher.workspace_id && payload.ws !== session.teacher.workspace_id) {
    return false;
  }

  const active = getActiveWorkspace();
  if (active?.id && session.teacher.workspace_id && active.id !== session.teacher.workspace_id) {
    return false;
  }
  if (payload.ws && active?.id && payload.ws !== active.id) {
    return false;
  }

  return true;
}

export function isAuthErrorCode(data: unknown): data is { code: string } {
  return !!data && typeof data === "object" && "code" in data && typeof (data as { code: string }).code === "string";
}
