/**
 * Leave review transactional emails (Resend preferred, SMTP fallback).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick Leave",
  personal: "Personal Leave",
  emergency: "Emergency",
  family: "Family Function",
  other: "Other",
};

export type LeaveRow = {
  id: string;
  workspace_id: string;
  requester_type: string;
  requester_id: string;
  requester_name_snapshot: string | null;
  class_snapshot: string | null;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_days?: number;
  reason: string;
  status: string;
  response_message: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTeacherComment(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  return t.length > 0 ? t : "No reason provided";
}

function formatDateRange(from: string, to: string): string {
  if (from === to) return from;
  return `${from} → ${to}`;
}

export function buildLeaveReviewEmail(params: {
  status: "approved" | "rejected";
  studentName: string;
  classLabel: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  totalDays?: number;
  teacherName: string;
  teacherComment: string;
  schoolName: string;
}): { subject: string; html: string; text: string } {
  const approved = params.status === "approved";
  const subject = approved ? "Leave Request Approved" : "Leave Request Rejected";
  const statusLabel = approved ? "Approved" : "Rejected";
  const accent = approved ? "#22c55e" : "#ef4444";
  const accentGlow = approved ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
  const headline = approved
    ? "Your leave request has been approved"
    : "Your leave request has been rejected";
  const intro = approved
    ? `Hello ${params.studentName}, your leave request has been approved by ${params.teacherName}.`
    : `Hello ${params.studentName}, your leave request has been rejected by ${params.teacherName}.`;

  const leaveTypeLabel = LEAVE_TYPE_LABELS[params.leaveType] ?? params.leaveType;
  const duration = formatDateRange(params.fromDate, params.toDate);
  const daysLine = params.totalDays
    ? `${params.totalDays} day${params.totalDays === 1 ? "" : "s"}`
    : duration;

  const text = [
    intro,
    "",
    `Status: ${statusLabel}`,
    `Class: ${params.classLabel}`,
    `Leave type: ${leaveTypeLabel}`,
    `Dates: ${duration} (${daysLine})`,
    `Teacher comment: ${params.teacherComment}`,
    "",
    params.schoolName,
    "— Admeasy",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif;">
  <div style="padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#12121a;border-radius:18px;overflow:hidden;border:1px solid #1f1f2e;box-shadow:0 12px 40px rgba(0,0,0,0.45);">
      <div style="background:linear-gradient(135deg,#5b21b6 0%,#7c3aed 50%,#a78bfa 100%);padding:28px 24px;text-align:center;">
        <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Admeasy</div>
        <div style="color:rgba(255,255,255,0.8);font-size:10px;text-transform:uppercase;letter-spacing:3px;margin-top:6px;">${escapeHtml(params.schoolName)}</div>
      </div>
      <div style="padding:28px 24px;">
        <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:${accentGlow};border:1px solid ${accent};color:${accent};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:16px;">
          ${statusLabel}
        </div>
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f8fafc;line-height:1.35;">${escapeHtml(headline)}</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.6;">${escapeHtml(intro)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e2e8f0;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #1f1f2e;color:#64748b;width:38%;">Class</td><td style="padding:10px 0;border-bottom:1px solid #1f1f2e;">${escapeHtml(params.classLabel)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1f1f2e;color:#64748b;">Leave type</td><td style="padding:10px 0;border-bottom:1px solid #1f1f2e;">${escapeHtml(leaveTypeLabel)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1f1f2e;color:#64748b;">Duration</td><td style="padding:10px 0;border-bottom:1px solid #1f1f2e;">${escapeHtml(duration)} <span style="color:#64748b;">(${escapeHtml(daysLine)})</span></td></tr>
          <tr><td style="padding:10px 0;color:#64748b;vertical-align:top;">Teacher response</td><td style="padding:10px 0;">${escapeHtml(params.teacherComment)}</td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#64748b;">Reviewed by <strong style="color:#cbd5e1;">${escapeHtml(params.teacherName)}</strong></p>
      </div>
      <div style="padding:16px 24px;background:#0d0d14;border-top:1px solid #1f1f2e;text-align:center;font-size:11px;color:#64748b;">
        This is an automated message from Admeasy. Please do not reply to this email.
      </div>
    </div>
  </div>
</body></html>`;

  return { subject, html, text };
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; provider: string; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("SMTP_EMAIL") ?? "no-reply@admeasy.in";
  if (!key) return { ok: false, provider: "resend", error: "RESEND_API_KEY not set" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: `Admeasy <${from}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, provider: "resend", error: `Resend ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true, provider: "resend" };
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; provider: string; error?: string }> {
  const user = Deno.env.get("SMTP_EMAIL");
  const pass = Deno.env.get("SMTP_PASS");
  if (!user || !pass) return { ok: false, provider: "smtp", error: "SMTP not configured" };

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.in",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"Admeasy" <${user}>`,
      to,
      subject,
      text,
      html,
    });
    return { ok: true, provider: "smtp" };
  } catch (e) {
    return { ok: false, provider: "smtp", error: (e as Error).message };
  }
}

async function deliverEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; provider: string; error?: string }> {
  const resend = await sendViaResend(to, subject, html, text);
  if (resend.ok) return resend;
  const smtp = await sendViaSmtp(to, subject, html, text);
  if (smtp.ok) return smtp;
  return { ok: false, provider: "none", error: resend.error ?? smtp.error ?? "Send failed" };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendWithRetries(
  to: string,
  subject: string,
  html: string,
  text: string,
  maxAttempts = 3,
): Promise<{ ok: boolean; provider: string; error?: string; attempts: number }> {
  let lastError = "Unknown error";
  let provider = "none";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await deliverEmail(to, subject, html, text);
    provider = result.provider;
    if (result.ok) return { ok: true, provider, attempts: attempt };
    lastError = result.error ?? "Send failed";
    if (attempt < maxAttempts) await sleep(attempt * 1500);
  }
  return { ok: false, provider, error: lastError, attempts: maxAttempts };
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export async function processLeaveReviewEmails(
  sb: SupabaseClient,
  leave: LeaveRow,
  notificationStatus: "approved" | "rejected",
  teacherName: string,
): Promise<{ queued: number; sent: number; failed: number }> {
  if (leave.requester_type !== "student") {
    return { queued: 0, sent: 0, failed: 0 };
  }

  const { data: student } = await sb
    .from("students")
    .select("name, student_email, parent_email, class, section")
    .eq("id", leave.requester_id)
    .eq("workspace_id", leave.workspace_id)
    .maybeSingle();

  const { data: workspace } = await sb
    .from("workspaces")
    .select("name")
    .eq("id", leave.workspace_id)
    .maybeSingle();

  const studentName = leave.requester_name_snapshot || student?.name || "Student";
  const classLabel = leave.class_snapshot ||
    [student?.class, student?.section].filter(Boolean).join("-") ||
    "—";
  const schoolName = workspace?.name || leave.workspace_id;
  const comment = formatTeacherComment(leave.response_message);
  const reviewer = teacherName?.trim() || "Your teacher";

  const { subject, html, text } = buildLeaveReviewEmail({
    status: notificationStatus,
    studentName,
    classLabel,
    leaveType: leave.leave_type,
    fromDate: leave.from_date,
    toDate: leave.to_date,
    totalDays: leave.total_days,
    teacherName: reviewer,
    teacherComment: comment,
    schoolName,
  });

  const recipients: { email: string; role: "student" | "parent" }[] = [];
  const studentEmail = normalizeEmail(student?.student_email);
  const parentEmail = normalizeEmail(student?.parent_email);
  if (studentEmail) recipients.push({ email: studentEmail, role: "student" });
  if (parentEmail && parentEmail !== studentEmail) {
    recipients.push({ email: parentEmail, role: "parent" });
  }

  let queued = 0;
  let sent = 0;
  let failed = 0;

  for (const { email, role } of recipients) {
    const idempotency_key = `${leave.id}:${email}:${notificationStatus}`;
    queued++;

    const { data: existing } = await sb
      .from("leave_email_notifications")
      .select("id, delivery_status")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existing?.delivery_status === "sent") {
      sent++;
      continue;
    }

    let rowId = existing?.id;
    if (!rowId) {
      const { data: inserted, error: insErr } = await sb
        .from("leave_email_notifications")
        .insert({
          leave_id: leave.id,
          workspace_id: leave.workspace_id,
          recipient_email: email,
          recipient_role: role,
          notification_status: notificationStatus,
          delivery_status: "queued",
          idempotency_key,
          metadata: { subject, student_name: studentName },
        })
        .select("id")
        .single();
      if (insErr) {
        if (String(insErr.message).includes("duplicate") || insErr.code === "23505") {
          const { data: dup } = await sb
            .from("leave_email_notifications")
            .select("id, delivery_status")
            .eq("idempotency_key", idempotency_key)
            .maybeSingle();
          if (dup?.delivery_status === "sent") {
            sent++;
            continue;
          }
          rowId = dup?.id;
        } else {
          console.error("[leave-email] outbox insert failed", insErr.message);
          failed++;
          continue;
        }
      } else {
        rowId = inserted?.id;
      }
    } else {
      await sb
        .from("leave_email_notifications")
        .update({ delivery_status: "queued", updated_at: new Date().toISOString() })
        .eq("id", rowId);
    }

    if (!rowId) {
      failed++;
      continue;
    }

    const result = await sendWithRetries(email, subject, html, text);
    if (result.ok) {
      await sb
        .from("leave_email_notifications")
        .update({
          delivery_status: "sent",
          provider: result.provider,
          attempt_count: result.attempts,
          sent_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rowId);
      sent++;
    } else {
      await sb
        .from("leave_email_notifications")
        .update({
          delivery_status: "failed",
          provider: result.provider,
          attempt_count: result.attempts,
          last_error: String(result.error ?? "failed").slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", rowId);
      failed++;
      console.error("[leave-email] delivery failed", { leave_id: leave.id, email, error: result.error });
    }
  }

  if (recipients.length === 0) {
    console.warn("[leave-email] no recipients", { leave_id: leave.id });
  }

  return { queued, sent, failed };
}
