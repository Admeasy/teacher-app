import nodemailer from "npm:nodemailer@6.9.14";
import {
  TEACHER_CORS,
  auditAuthEvent,
  checkOtpSendRateLimits,
  getClientIp,
  invalidatePendingOtps,
  jsonResponse,
  normalizeEmail,
  normalizeTeacherId,
  normalizeWorkspaceId,
  parseJsonBody,
  pickTeacherForOtp,
  safeErrorMessage,
  serviceClient,
  sha256,
  OTP_TTL_MS,
} from "../_shared/teacherAuth.ts";

function otpEmailHtml(teacherName: string, code: string) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif;">
  <div style="padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(17,12,46,0.08);">
      <div style="background:linear-gradient(135deg,#7C3AED 0%,#A78BFA 100%);padding:32px 28px;text-align:center;">
        <div style="color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Admeasy</div>
        <div style="color:rgba(255,255,255,0.85);font-size:11px;text-transform:uppercase;letter-spacing:3px;margin-top:6px;">Teacher Login</div>
      </div>
      <div style="padding:32px 28px;">
        <h2 style="color:#0f0f1a;font-size:20px;margin:0 0 12px;font-weight:600;">Your login code</h2>
        <p style="font-size:14px;color:#4a4a5e;line-height:1.6;margin:0 0 24px;">
          Hi ${teacherName || "Teacher"}, use the code below to sign in to the Admeasy Teacher Portal.
        </p>
        <div style="background:#f3f0ff;border:1px solid #e4dcff;border-radius:14px;padding:22px;text-align:center;margin:0 0 24px;">
          <div style="font-size:11px;color:#7C3AED;text-transform:uppercase;letter-spacing:2px;font-weight:600;margin-bottom:10px;">One-Time Password</div>
          <div style="font-size:36px;font-weight:700;letter-spacing:12px;color:#4e2bb8;font-family:'SF Mono',Menlo,Consolas,monospace;">${code}</div>
        </div>
        <div style="background:#fff8e6;border-left:3px solid #f59e0b;padding:12px 14px;border-radius:6px;margin:0 0 20px;">
          <p style="font-size:12px;color:#92670a;margin:0;line-height:1.5;">⏱ This code expires in <b>5 minutes</b>. Do not share it with anyone.</p>
        </div>
        <p style="font-size:12px;color:#888;line-height:1.6;margin:0;">If you did not request this OTP, please ignore this email.</p>
      </div>
      <div style="background:#fafafc;padding:18px 28px;text-align:center;border-top:1px solid #eef0f5;">
        <div style="font-size:11px;color:#9a9aae;">© ${new Date().getFullYear()} Admeasy</div>
      </div>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const supabase = serviceClient();

  try {
    const raw = await parseJsonBody(req);
    const teacher_id_norm = normalizeTeacherId(raw.teacher_id);
    const email_norm = normalizeEmail(raw.email);
    const workspace_id = normalizeWorkspaceId(raw.workspace_id);

    if (!teacher_id_norm || !email_norm) {
      return jsonResponse({ success: false, message: "Missing teacher_id or email" }, 400);
    }
    if (!workspace_id) {
      return jsonResponse({ success: false, message: "School context required" }, 400);
    }

    const { data: byId, error: qerr } = await supabase
      .from("teachers")
      .select("id, name, workspace_id, email, teacher_id, is_active")
      .ilike("teacher_id", teacher_id_norm)
      .limit(50);
    if (qerr) throw qerr;

    const allMatches = byId ?? [];
    const picked = pickTeacherForOtp(allMatches, email_norm, workspace_id);

    if (!picked.teacher) {
      if (workspace_id) {
        const { count: wsTeacherCount } = await supabase
          .from("teachers")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace_id)
          .eq("is_active", true);

        if ((wsTeacherCount ?? 0) === 0) {
          return jsonResponse({
            success: false,
            message: "Teacher records were not imported for this school. Please ask your admin to re-upload the teacher sheet.",
            code: "WORKSPACE_EMPTY",
          }, 404);
        }

        if (picked.error === "WRONG_WORKSPACE") {
          await auditAuthEvent(supabase, {
            event: "workspace_mismatch",
            workspace_id,
            status: "failed",
            ip,
            user_agent: ua,
            metadata: { teacher_id: teacher_id_norm },
          });
          return jsonResponse({
            success: false,
            message: "Teacher belongs to a different school workspace",
            code: "WRONG_WORKSPACE",
          }, 403);
        }

        const { data: nearby } = await supabase
          .from("teachers")
          .select("teacher_id")
          .eq("workspace_id", workspace_id)
          .eq("is_active", true)
          .order("teacher_id", { ascending: true })
          .limit(5);
        const suggestions = (nearby ?? []).map((r: { teacher_id: string }) => r.teacher_id).filter(Boolean);

        if (allMatches.length === 0) {
          return jsonResponse({
            success: false,
            message: `Teacher ID "${teacher_id_norm}" not found in this school. Available IDs include: ${suggestions.join(", ") || "—"}`,
            code: "TEACHER_ID_NOT_FOUND",
            suggestions,
          }, 404);
        }
      }

      return jsonResponse({
        success: false,
        message: "Teacher ID exists but the email does not match our records",
        code: "EMAIL_MISMATCH",
      }, 404);
    }

    const match = picked.teacher;
    if (match.is_active === false) {
      return jsonResponse({ success: false, message: "Teacher account is inactive" }, 403);
    }

    const sendLimit = await checkOtpSendRateLimits(supabase, {
      teacherUuid: match.id,
      workspaceId: match.workspace_id,
      ip,
    });
    if (!sendLimit.ok) {
      await auditAuthEvent(supabase, {
        event: "rate_limit",
        workspace_id: match.workspace_id,
        user_id: match.id,
        user_label: match.name || match.teacher_id,
        status: "failed",
        ip,
        user_agent: ua,
        metadata: { action: "send", retryAfterSec: sendLimit.retryAfterSec },
      });
      return jsonResponse({ success: false, message: sendLimit.message }, 429);
    }

    const smtpUser = Deno.env.get("SMTP_EMAIL");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpUser || !smtpPass) {
      return jsonResponse({ success: false, message: "Email service is not configured" }, 500);
    }

    await invalidatePendingOtps(supabase, match.id);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256(code);
    const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();

    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.zoho.in",
        port: 465,
        secure: true,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: `"Admeasy" <${smtpUser}>`,
        to: match.email,
        subject: "Your Admeasy Teacher Login OTP",
        text: `Your Admeasy teacher login OTP is ${code}. Valid for 5 minutes only.`,
        html: otpEmailHtml(match.name, code),
      });
    } catch (e) {
      console.error("SMTP send failed", (e as Error)?.message);
      return jsonResponse({ success: false, message: "Unable to send OTP email" }, 502);
    }

    await supabase.from("teacher_otps").insert({
      teacher_id: match.id,
      workspace_id: match.workspace_id,
      email: match.email,
      code_hash,
      expires_at,
      attempts: 0,
    });

    await auditAuthEvent(supabase, {
      event: "otp_send",
      workspace_id: match.workspace_id,
      user_id: match.id,
      user_label: match.name || match.teacher_id,
      status: "success",
      ip,
      user_agent: ua,
    });

    const masked_email = String(match.email).replace(/(.{2}).+(@.+)/, "$1***$2");
    return jsonResponse({ success: true, ok: true, masked_email });
  } catch (e) {
    console.error("teacher-send-otp", e instanceof Error ? e.message : e);
    return jsonResponse({ success: false, message: safeErrorMessage(e, "Unable to send OTP email") }, 500);
  }
});
