/**
 * Teacher OTP JWT + rate limits + audit (edge functions only).
 * Secrets: TEACHER_OTP_SECRET (required, min 32 chars). Never expose to the client.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const TEACHER_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const JWT_ISS = "admeasy-otp";
export const JWT_AUD = "admeasy-teacher";
export const JWT_ROLE = "teacher";
/** Access token lifetime (7 days). */
export const TOKEN_TTL_SEC = 7 * 24 * 60 * 60;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_SEND_PER_TEACHER_5MIN = 3;
export const OTP_SEND_PER_IP_HOUR = 15;
export const OTP_SEND_PER_WORKSPACE_HOUR = 80;
export const OTP_VERIFY_FAIL_PER_IP_15MIN = 25;

export type TeacherClaims = {
  sub: string;
  tid: string;
  ws: string;
  role: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
};

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = TEACHER_CORS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export function safeErrorMessage(e: unknown, fallback = "Request failed"): string {
  if (Deno.env.get("AUTH_DEBUG") === "1") {
    return e instanceof Error ? e.message : String(e);
  }
  return fallback;
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function getJwtSecret(): string {
  const secret = Deno.env.get("TEACHER_OTP_SECRET")?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("TEACHER_OTP_SECRET is not configured (minimum 32 characters)");
  }
  if (secret === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    throw new Error("TEACHER_OTP_SECRET must not equal SUPABASE_SERVICE_ROLE_KEY");
  }
  return secret;
}

export async function signTeacherToken(teacher: {
  id: string;
  teacher_id: string | null;
  workspace_id: string;
}): Promise<string> {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: TeacherClaims = {
    sub: teacher.id,
    tid: String(teacher.teacher_id ?? "").trim(),
    ws: String(teacher.workspace_id).trim(),
    role: JWT_ROLE,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
    aud: JWT_AUD,
    iss: JWT_ISS,
  };
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`)),
  );
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyTeacherToken(token: string): Promise<TeacherClaims> {
  const secret = getJwtSecret();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");

  const [headerB64, bodyB64, sigB64] = parts;
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64)));
  } catch {
    throw new Error("Invalid token");
  }
  if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error("Invalid token");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerB64}.${bodyB64}`)),
  );
  const actual = b64urlDecode(sigB64);
  if (expected.length !== actual.length) throw new Error("Invalid token");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  if (diff !== 0) throw new Error("Invalid token");

  let claims: TeacherClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(bodyB64)));
  } catch {
    throw new Error("Invalid token");
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== JWT_ISS || claims.aud !== JWT_AUD) throw new Error("Invalid token");
  if (claims.role !== JWT_ROLE) throw new Error("Invalid token");
  if (!claims.sub || !claims.ws || !claims.tid) throw new Error("Invalid token");
  if (typeof claims.exp !== "number" || typeof claims.iat !== "number") throw new Error("Invalid token");
  if (claims.exp <= now) throw new Error("Token expired");
  if (claims.iat > now + 60) throw new Error("Invalid token");

  return claims;
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
  const ip = xff.split(",")[0]?.trim();
  return ip || null;
}

export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await req.json();
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function normalizeTeacherId(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

export function normalizeEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function normalizeWorkspaceId(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : undefined;
}

/** Resolve teacher for OTP flows; strict workspace when workspace_id is provided. */
export function pickTeacherForOtp(
  rows: Array<{ id: string; workspace_id: string; email?: string | null; teacher_id?: string | null; name?: string | null; [k: string]: unknown }>,
  email_norm: string,
  workspace_id?: string,
): { teacher?: (typeof rows)[0]; error?: "NOT_FOUND" | "WRONG_WORKSPACE" | "AMBIGUOUS" } {
  const emailMatches = rows.filter((t) => (t.email || "").trim().toLowerCase() === email_norm);
  if (workspace_id) {
    const teacher = emailMatches.find((t) => t.workspace_id === workspace_id);
    if (!teacher) {
      const wrongSchool = emailMatches.some((t) => t.workspace_id !== workspace_id);
      return { error: wrongSchool ? "WRONG_WORKSPACE" : "NOT_FOUND" };
    }
    return { teacher };
  }
  if (emailMatches.length !== 1) return { error: emailMatches.length > 1 ? "AMBIGUOUS" : "NOT_FOUND" };
  return { teacher: emailMatches[0] };
}

export async function auditAuthEvent(
  supabase: SupabaseClient,
  event: {
    event: string;
    workspace_id: string;
    user_id?: string | null;
    user_label?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    status: "success" | "failed";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("login_activity_logs").insert({
      workspace_id: event.workspace_id,
      role: "teacher",
      user_id: event.user_id ?? null,
      user_label: event.user_label ?? null,
      ip: event.ip ?? null,
      user_agent: event.user_agent ?? null,
      device_hash: null,
      status: event.status,
      is_first_of_day: false,
      is_new_device: false,
      metadata: { event: event.event, ...(event.metadata ?? {}) },
    });
  } catch {
    /* non-fatal */
  }
}

export async function checkOtpSendRateLimits(
  supabase: SupabaseClient,
  opts: { teacherUuid: string; workspaceId: string; ip: string | null },
): Promise<{ ok: true } | { ok: false; message: string; retryAfterSec?: number }> {
  const since5 = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: perTeacher } = await supabase
    .from("teacher_otps")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", opts.teacherUuid)
    .gte("created_at", since5);
  if ((perTeacher ?? 0) >= OTP_SEND_PER_TEACHER_5MIN) {
    return { ok: false, message: "Too many OTP requests. Try again in a few minutes.", retryAfterSec: 300 };
  }

  const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: perWs } = await supabase
    .from("teacher_otps")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", opts.workspaceId)
    .gte("created_at", sinceHour);
  if ((perWs ?? 0) >= OTP_SEND_PER_WORKSPACE_HOUR) {
    return { ok: false, message: "School OTP limit reached. Try again later.", retryAfterSec: 3600 };
  }

  if (opts.ip) {
    const { data: ipRows } = await supabase
      .from("login_activity_logs")
      .select("id")
      .eq("role", "teacher")
      .eq("ip", opts.ip)
      .gte("login_at", sinceHour)
      .contains("metadata", { event: "otp_send" });
    if ((ipRows?.length ?? 0) >= OTP_SEND_PER_IP_HOUR) {
      return { ok: false, message: "Too many requests from this network. Try again later.", retryAfterSec: 3600 };
    }
  }

  return { ok: true };
}

export async function checkOtpVerifyRateLimits(
  supabase: SupabaseClient,
  opts: { ip: string | null; workspaceId: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!opts.ip) return { ok: true };
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: fails } = await supabase
    .from("login_activity_logs")
    .select("id")
    .eq("role", "teacher")
    .eq("ip", opts.ip)
    .eq("status", "failed")
    .gte("login_at", since)
    .contains("metadata", { event: "otp_verify_fail" });
  if ((fails?.length ?? 0) >= OTP_VERIFY_FAIL_PER_IP_15MIN) {
    return { ok: false, message: "Too many failed attempts. Try again later." };
  }
  return { ok: true };
}

export async function invalidatePendingOtps(supabase: SupabaseClient, teacherUuid: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("teacher_otps")
    .update({ consumed_at: now })
    .eq("teacher_id", teacherUuid)
    .is("consumed_at", null);
}

export type AuthTeacherRow = {
  id: string;
  workspace_id: string;
  teacher_id: string | null;
  name: string | null;
  email: string | null;
  subject?: string | null;
  assigned_classes?: string[] | null;
  is_active?: boolean | null;
};

export async function resolveTeacherRow(
  supabase: SupabaseClient,
  claims: TeacherClaims,
): Promise<AuthTeacherRow | null> {
  const { data } = await supabase
    .from("teachers")
    .select("id, workspace_id, teacher_id, name, email, subject, assigned_classes, is_active")
    .eq("id", claims.sub)
    .eq("workspace_id", claims.ws)
    .maybeSingle();
  if (!data || data.is_active === false) return null;
  if (claims.tid && data.teacher_id && String(data.teacher_id).trim().toUpperCase() !== claims.tid.toUpperCase()) {
    return null;
  }
  return data as AuthTeacherRow;
}

export function bodyTeacherRef(body: Record<string, unknown>): string {
  return String(body.teacher_id ?? body.teacherId ?? "").trim();
}

export function bodyWorkspaceRef(body: Record<string, unknown>): string | undefined {
  return normalizeWorkspaceId(body.workspace_id ?? body.workspaceId);
}

export function teacherRefMatchesClaims(ref: string, claims: TeacherClaims): boolean {
  const r = ref.trim();
  return r === claims.sub || r.toUpperCase() === claims.tid.toUpperCase();
}

/** Validates Bearer teacher JWT and optional body workspace / teacher refs. */
export async function requireTeacherAuth(
  req: Request,
  body: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<
  | { ok: true; claims: TeacherClaims; teacher: AuthTeacherRow }
  | { ok: false; response: Response }
> {
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const token = extractBearer(req);
  if (!token) {
    return {
      ok: false,
      response: jsonResponse({ error: "Unauthorized", code: "AUTH_REQUIRED" }, 401),
    };
  }

  let claims: TeacherClaims;
  try {
    claims = await verifyTeacherToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid token";
    const code = msg === "Token expired" ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
    await auditAuthEvent(supabase, {
      event: "token_invalid",
      workspace_id: bodyWorkspaceRef(body) ?? "unknown",
      status: "failed",
      ip,
      user_agent: ua,
      metadata: { code },
    });
    return {
      ok: false,
      response: jsonResponse({ error: "Unauthorized", code }, 401),
    };
  }

  const teacher = await resolveTeacherRow(supabase, claims);
  if (!teacher) {
    await auditAuthEvent(supabase, {
      event: "token_teacher_not_found",
      workspace_id: claims.ws,
      user_id: claims.sub,
      status: "failed",
      ip,
      user_agent: ua,
    });
    return {
      ok: false,
      response: jsonResponse({ error: "Unauthorized", code: "TOKEN_INVALID" }, 401),
    };
  }

  const bodyWs = bodyWorkspaceRef(body);
  if (bodyWs && bodyWs !== claims.ws) {
    await auditAuthEvent(supabase, {
      event: "workspace_mismatch",
      workspace_id: bodyWs,
      user_id: teacher.id,
      user_label: teacher.name ?? teacher.teacher_id,
      status: "failed",
      ip,
      user_agent: ua,
      metadata: { token_ws: claims.ws, body_ws: bodyWs },
    });
    return {
      ok: false,
      response: jsonResponse({ error: "Workspace mismatch", code: "WORKSPACE_FORBIDDEN" }, 403),
    };
  }

  const bodyTid = bodyTeacherRef(body);
  if (bodyTid && !teacherRefMatchesClaims(bodyTid, claims)) {
    await auditAuthEvent(supabase, {
      event: "teacher_mismatch",
      workspace_id: claims.ws,
      user_id: teacher.id,
      status: "failed",
      ip,
      user_agent: ua,
      metadata: { body_teacher_id: bodyTid },
    });
    return {
      ok: false,
      response: jsonResponse({ error: "Forbidden", code: "TEACHER_FORBIDDEN" }, 403),
    };
  }

  return { ok: true, claims, teacher };
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
