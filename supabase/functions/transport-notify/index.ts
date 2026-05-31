// Transport notification dispatcher
// - persists a row in transport_notifications
// - if channels include "email" → fetches recipient emails (students/teachers/route)
//   and sends via Resend (RESEND_API_KEY) using SMTP_EMAIL as sender

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      workspace_id, kind = "info", title, message = "", severity = "info",
      audience = "all", route_id = null, vehicle_id = null,
      target_student_ids = [], channels = ["in_app"],
    } = body;

    if (!workspace_id || !title) {
      return json({ error: "workspace_id and title are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let email_recipients = 0;
    let email_sent = false;

    // 1) collect recipient emails if email channel requested
    if (channels.includes("email")) {
      const emails = new Set<string>();
      if (audience === "students" || audience === "all") {
        const { data } = await supabase
          .from("students").select("email").eq("workspace_id", workspace_id)
          .not("email", "is", null);
        (data ?? []).forEach((r: any) => r.email && emails.add(r.email));
      }
      if (audience === "teachers" || audience === "all") {
        const { data } = await supabase
          .from("teachers").select("email").eq("workspace_id", workspace_id)
          .not("email", "is", null);
        (data ?? []).forEach((r: any) => r.email && emails.add(r.email));
      }
      if (audience === "route" && route_id) {
        const { data: assigns } = await supabase
          .from("transport_assignments").select("student_id")
          .eq("workspace_id", workspace_id).eq("route_id", route_id).eq("active", true);
        const ids = (assigns ?? []).map((a: any) => a.student_id);
        if (ids.length) {
          const { data: students } = await supabase
            .from("students").select("email").in("id", ids).not("email", "is", null);
          (students ?? []).forEach((r: any) => r.email && emails.add(r.email));
        }
      }
      if (target_student_ids?.length) {
        const { data: students } = await supabase
          .from("students").select("email").in("id", target_student_ids).not("email", "is", null);
        (students ?? []).forEach((r: any) => r.email && emails.add(r.email));
      }

      email_recipients = emails.size;

      const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
      const SENDER = Deno.env.get("SMTP_EMAIL") ?? "no-reply@admeasy.in";
      if (RESEND_KEY && email_recipients > 0) {
        const sevBadge = severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "🚌";
        const html = `
          <div style="font-family:Inter,system-ui,sans-serif;background:#0A0A0F;color:#fff;padding:24px;border-radius:12px;max-width:560px;">
            <div style="font-size:12px;letter-spacing:2px;color:#A78BFA;text-transform:uppercase;">Admeasy Transport</div>
            <h2 style="margin:8px 0 4px;font-size:20px;">${sevBadge} ${escape(title)}</h2>
            <p style="color:#cbd5e1;line-height:1.55;white-space:pre-wrap;">${escape(message)}</p>
            <div style="margin-top:16px;padding-top:12px;border-top:1px solid #1f1f2e;font-size:11px;color:#94a3b8;">Kind: ${kind} · Severity: ${severity}</div>
          </div>`;
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: `Admeasy Transport <${SENDER}>`,
              to: Array.from(emails),
              subject: `[Transport] ${title}`,
              html,
            }),
          });
          email_sent = res.ok;
          if (!res.ok) console.error("resend error", res.status, await res.text());
        } catch (e) {
          console.error("email send failed", e);
        }
      }
    }

    // 2) persist notification row
    const { data, error } = await supabase
      .from("transport_notifications").insert({
        workspace_id, kind, title, message, severity, audience,
        route_id, vehicle_id, target_student_ids, channels, email_sent,
      }).select().single();

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, notification: data, email_recipients, email_sent });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message ?? "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
