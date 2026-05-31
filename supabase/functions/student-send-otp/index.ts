import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function otpEmailHtml(studentName: string, parentName: string, code: string) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif;">
    <div style="padding:32px 16px;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(17,12,46,0.08);">
        <div style="background:linear-gradient(135deg,#7C3AED 0%,#A78BFA 100%);padding:32px 28px;text-align:center;">
          <div style="color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Admeasy</div>
          <div style="color:rgba(255,255,255,0.85);font-size:11px;text-transform:uppercase;letter-spacing:3px;margin-top:6px;">Student Login</div>
        </div>
        <div style="padding:32px 28px;">
          <h2 style="color:#0f0f1a;font-size:20px;margin:0 0 12px;font-weight:600;">Your login code</h2>
          <p style="font-size:14px;color:#4a4a5e;line-height:1.6;margin:0 0 24px;">
            Hi ${parentName || "there"}, use the code below to sign in <b>${studentName || "your student"}</b> to the Admeasy Student Portal.
          </p>
          <div style="background:#f3f0ff;border:1px solid #e4dcff;border-radius:14px;padding:22px;text-align:center;margin:0 0 24px;">
            <div style="font-size:11px;color:#7C3AED;text-transform:uppercase;letter-spacing:2px;font-weight:600;margin-bottom:10px;">One-Time Password</div>
            <div style="font-size:36px;font-weight:700;letter-spacing:12px;color:#4e2bb8;font-family:'SF Mono',Menlo,Consolas,monospace;">${code}</div>
          </div>
          <div style="background:#fff8e6;border-left:3px solid #f59e0b;padding:12px 14px;border-radius:6px;margin:0 0 20px;">
            <p style="font-size:12px;color:#92670a;margin:0;line-height:1.5;">⏱ This code expires in <b>5 minutes</b>. Do not share it with anyone.</p>
          </div>
          <p style="font-size:12px;color:#888;line-height:1.6;margin:0 0 8px;">
            If you did not request this OTP, please ignore this email.
          </p>
          <p style="font-size:12px;color:#888;line-height:1.6;margin:0;">
            Need help? Reach us at <a href="mailto:support@admeasy.in" style="color:#7C3AED;text-decoration:none;">support@admeasy.in</a>
          </p>
        </div>
        <div style="background:#fafafc;padding:18px 28px;text-align:center;border-top:1px solid #eef0f5;">
          <div style="font-size:11px;color:#9a9aae;">© ${new Date().getFullYear()} Admeasy · School Operations Console</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const raw = await req.json();
    const student_id_norm = String(raw?.student_id ?? "").trim();
    const parent_email_norm = String(raw?.parent_email ?? "").trim().toLowerCase();
    const workspace_id = raw?.workspace_id ? String(raw.workspace_id).trim() : undefined;
    if (!student_id_norm || !parent_email_norm) {
      return new Response(JSON.stringify({ success: false, message: "Missing student_id or parent_email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: byId, error: qerr } = await supabase
      .from("students")
      .select("id, name, workspace_id, parent_email, parent_name, class, section, student_id")
      .ilike("student_id", student_id_norm)
      .limit(50);
    if (qerr) throw qerr;

    const allMatches = byId || [];
    const emailMatches = allMatches.filter((s: any) => (s.parent_email || "").trim().toLowerCase() === parent_email_norm);

    let match: any = workspace_id ? emailMatches.find((s: any) => s.workspace_id === workspace_id) : undefined;
    if (!match) match = emailMatches[0];

    if (!match) {
      if (allMatches.length === 0) {
        console.warn("student-send-otp: student_id not found", { student_id_norm, workspace_id });
        return new Response(JSON.stringify({ success: false, message: "No imported student record found for that Student ID" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const wrongWs = workspace_id && allMatches.some((s: any) => (s.parent_email || "").trim().toLowerCase() === parent_email_norm && s.workspace_id !== workspace_id);
      if (wrongWs) {
        console.warn("student-send-otp: wrong workspace", { student_id_norm, workspace_id });
        return new Response(JSON.stringify({ success: false, message: "Student belongs to a different school workspace" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.warn("student-send-otp: parent email mismatch", { student_id_norm, workspace_id });
      return new Response(JSON.stringify({ success: false, message: "Student ID exists but the parent email does not match our records" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("student_otps")
      .select("id", { count: "exact", head: true })
      .eq("student_id", match.id)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      return new Response(JSON.stringify({ success: false, message: "Too many requests. Try again in a few minutes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256(code);
    const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const smtpUser = Deno.env.get("SMTP_EMAIL");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpUser || !smtpPass) {
      return new Response(JSON.stringify({ success: false, message: "Email service is not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.zoho.in",
        port: 465,
        secure: true,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: `"Admeasy" <${smtpUser}>`,
        to: match.parent_email,
        subject: "Your Admeasy Login OTP",
        text: `Your Admeasy login OTP is ${code}. Valid for 5 minutes only. If you did not request this, please ignore.`,
        html: otpEmailHtml(match.name, match.parent_name, code),
      });
    } catch (e) {
      console.error("SMTP send failed");
      return new Response(JSON.stringify({ success: false, message: "Unable to send OTP email" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("student_otps").insert({
      student_id: match.id,
      workspace_id: match.workspace_id,
      code_hash,
      parent_email: match.parent_email,
      expires_at,
    });

    const maskedEmail = match.parent_email.replace(/(.{2}).+(@.+)/, "$1***$2");
    return new Response(JSON.stringify({ success: true, ok: true, masked_email: maskedEmail }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("send-otp error", (e as any)?.message);
    return new Response(JSON.stringify({ success: false, message: "Unable to send OTP email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
