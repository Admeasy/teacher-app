import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signToken(payload: Record<string, unknown>, secret: string) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`)));
  return `${header}.${body}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const raw = await req.json();
    const student_id_norm = String(raw?.student_id ?? "").trim();
    const parent_email_norm = String(raw?.parent_email ?? "").trim().toLowerCase();
    const code = raw?.code;
    const workspace_id = raw?.workspace_id ? String(raw.workspace_id).trim() : undefined;
    if (!student_id_norm || !parent_email_norm || !code) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: byId } = await supabase
      .from("students")
      .select("*")
      .ilike("student_id", student_id_norm)
      .limit(50);
    const emailMatches = (byId || []).filter((s: any) => (s.parent_email || "").trim().toLowerCase() === parent_email_norm);
    let student: any = workspace_id ? emailMatches.find((s: any) => s.workspace_id === workspace_id) : undefined;
    if (!student) student = emailMatches[0];
    if (!student) {
      console.warn("student-verify-otp: not found", { student_id_norm, workspace_id });
      return new Response(JSON.stringify({ error: "Student not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: otps } = await supabase
      .from("student_otps")
      .select("*")
      .eq("student_id", student.id)
      .is("consumed_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const otp = otps?.[0];
    if (!otp) {
      return new Response(JSON.stringify({ error: "Code expired or not found. Request a new one." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (otp.attempts >= 5) {
      return new Response(JSON.stringify({ error: "Too many attempts" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const code_hash = await sha256(String(code).trim());
    if (code_hash !== otp.code_hash) {
      await supabase.from("student_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return new Response(JSON.stringify({ error: "Invalid code" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("student_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);

    // Upsert student_account
    await supabase.from("student_accounts").upsert({
      student_id: student.id,
      workspace_id: student.workspace_id,
      email_verified_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    }, { onConflict: "student_id" });

    // ---------- Activity logging + spam-safe notification ----------
    try {
      const ua = req.headers.get("user-agent") || "";
      const accLang = req.headers.get("accept-language") || "";
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
      const device_hash = await sha256(`${ua}|${accLang}`);
      const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: todayRows } = await supabase
        .from("login_activity_logs")
        .select("id")
        .eq("user_id", student.id).eq("status", "success")
        .gte("login_at", startOfDay.toISOString()).limit(1);
      const is_first_of_day = !todayRows || todayRows.length === 0;

      const { data: devRows } = await supabase
        .from("login_activity_logs")
        .select("id")
        .eq("user_id", student.id).eq("device_hash", device_hash)
        .gte("login_at", thirtyDaysAgo).limit(1);
      const is_new_device = !devRows || devRows.length === 0;

      await supabase.from("login_activity_logs").insert({
        workspace_id: student.workspace_id, role: "student",
        user_id: student.id, user_label: student.name || student.student_id,
        ip, user_agent: ua, device_hash, status: "success",
        is_first_of_day, is_new_device,
        metadata: { student_id: student.student_id, class: student.class, section: student.section, parent_email: student.parent_email, fee_status: student.fee_status },
      });

      if (is_first_of_day || is_new_device) {
        const reason = is_new_device ? "from a new device" : "for the first time today";
        await supabase.from("notifications").insert({
          workspace_id: student.workspace_id,
          type: "login_alert",
          message: `Student ${student.name || student.student_id} (Class ${student.class || "-"} ${student.section || ""}) signed in ${reason}.`,
        });
      }
    } catch (_e) { /* logging is best-effort */ }

    const secret = Deno.env.get("STUDENT_OTP_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = await signToken({
      sub: student.id,
      sid: student.student_id,
      ws: student.workspace_id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }, secret);

    return new Response(JSON.stringify({ ok: true, token, student }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
