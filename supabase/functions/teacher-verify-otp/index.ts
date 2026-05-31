import {
  TEACHER_CORS,
  auditAuthEvent,
  checkOtpVerifyRateLimits,
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
  signTeacherToken,
  OTP_MAX_ATTEMPTS,
} from "../_shared/teacherAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const supabase = serviceClient();

  try {
    const raw = await parseJsonBody(req);
    const teacher_id_norm = normalizeTeacherId(raw.teacher_id);
    const email_norm = normalizeEmail(raw.email);
    const code = String(raw.code ?? "").trim();
    const workspace_id = normalizeWorkspaceId(raw.workspace_id);

    if (!teacher_id_norm || !email_norm || !/^\d{6}$/.test(code)) {
      return jsonResponse({ success: false, error: "Invalid request" }, 400);
    }
    if (!workspace_id) {
      return jsonResponse({ success: false, error: "School context required" }, 400);
    }

    const verifyLimit = await checkOtpVerifyRateLimits(supabase, { ip, workspaceId: workspace_id });
    if (!verifyLimit.ok) {
      await auditAuthEvent(supabase, {
        event: "rate_limit",
        workspace_id,
        status: "failed",
        ip,
        user_agent: ua,
        metadata: { action: "verify" },
      });
      return jsonResponse({ success: false, error: verifyLimit.message }, 429);
    }

    const { data: byId, error: qerr } = await supabase
      .from("teachers")
      .select("*")
      .ilike("teacher_id", teacher_id_norm)
      .limit(50);
    if (qerr) throw qerr;

    const picked = pickTeacherForOtp(byId ?? [], email_norm, workspace_id);
    if (!picked.teacher) {
      const err =
        picked.error === "WRONG_WORKSPACE"
          ? "Teacher belongs to a different school"
          : "Teacher not found";
      await auditAuthEvent(supabase, {
        event: "otp_verify_fail",
        workspace_id,
        status: "failed",
        ip,
        user_agent: ua,
        metadata: { reason: picked.error, teacher_id: teacher_id_norm },
      });
      return jsonResponse({ success: false, error: err }, picked.error === "WRONG_WORKSPACE" ? 403 : 404);
    }
    const teacher = picked.teacher;

    const { data: otps } = await supabase
      .from("teacher_otps")
      .select("*")
      .eq("teacher_id", teacher.id)
      .eq("workspace_id", teacher.workspace_id)
      .is("consumed_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const otp = otps?.[0];
    if (!otp) {
      await auditAuthEvent(supabase, {
        event: "otp_verify_fail",
        workspace_id: teacher.workspace_id,
        user_id: teacher.id,
        user_label: teacher.name || teacher.teacher_id,
        status: "failed",
        ip,
        user_agent: ua,
        metadata: { reason: "expired_or_missing" },
      });
      return jsonResponse(
        { success: false, error: "Code expired or not found. Request a new one." },
        400,
      );
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await auditAuthEvent(supabase, {
        event: "rate_limit",
        workspace_id: teacher.workspace_id,
        user_id: teacher.id,
        status: "failed",
        ip,
        user_agent: ua,
        metadata: { reason: "otp_attempts_exceeded" },
      });
      return jsonResponse({ success: false, error: "Too many attempts. Request a new code." }, 429);
    }

    const code_hash = await sha256(code);
    if (code_hash !== otp.code_hash) {
      await supabase.from("teacher_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      await auditAuthEvent(supabase, {
        event: "otp_verify_fail",
        workspace_id: teacher.workspace_id,
        user_id: teacher.id,
        user_label: teacher.name || teacher.teacher_id,
        status: "failed",
        ip,
        user_agent: ua,
        metadata: { reason: "invalid_code", attempts: otp.attempts + 1 },
      });
      return jsonResponse({ success: false, error: "Invalid code" }, 400);
    }

    const consumedAt = new Date().toISOString();
    await supabase.from("teacher_otps").update({ consumed_at: consumedAt }).eq("id", otp.id);
    await invalidatePendingOtps(supabase, teacher.id);

    await supabase.from("teacher_accounts").upsert(
      {
        teacher_id: teacher.id,
        workspace_id: teacher.workspace_id,
        email_verified_at: consumedAt,
        last_login_at: consumedAt,
      },
      { onConflict: "teacher_id" },
    );

    try {
      const device_hash = await sha256(`${ua}|${req.headers.get("accept-language") || ""}`);
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: todayRows } = await supabase
        .from("login_activity_logs")
        .select("id")
        .eq("user_id", teacher.id)
        .eq("status", "success")
        .gte("login_at", startOfDay.toISOString())
        .limit(1);
      const is_first_of_day = !todayRows?.length;

      const { data: devRows } = await supabase
        .from("login_activity_logs")
        .select("id")
        .eq("user_id", teacher.id)
        .eq("device_hash", device_hash)
        .gte("login_at", thirtyDaysAgo)
        .limit(1);
      const is_new_device = !devRows?.length;

      await auditAuthEvent(supabase, {
        event: "otp_verify_success",
        workspace_id: teacher.workspace_id,
        user_id: teacher.id,
        user_label: teacher.name || teacher.teacher_id,
        status: "success",
        ip,
        user_agent: ua,
        metadata: {
          teacher_id: teacher.teacher_id,
          is_first_of_day,
          is_new_device,
          device_hash,
        },
      });

      if (is_first_of_day || is_new_device) {
        const reason = is_new_device ? "from a new device" : "for the first time today";
        await supabase.from("notifications").insert({
          workspace_id: teacher.workspace_id,
          type: "login_alert",
          message: `Teacher ${teacher.name || teacher.teacher_id} (${teacher.subject || "—"}) signed in ${reason}.`,
        });
      }
    } catch {
      /* best-effort */
    }

    const token = await signTeacherToken({
      id: teacher.id,
      teacher_id: teacher.teacher_id,
      workspace_id: teacher.workspace_id,
    });

    return jsonResponse({ success: true, ok: true, token, teacher });
  } catch (e) {
    console.error("teacher-verify-otp", e instanceof Error ? e.message : e);
    return jsonResponse({ success: false, error: safeErrorMessage(e) }, 500);
  }
});
