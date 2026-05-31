import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

/** Verify JWT and workspace membership. Returns user or throws. */
async function verifyAuthGmail(req: Request, sb: any, workspaceId: string) {
  const authHeader = req.headers.get("Authorization") ?? ""
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized")
  const token = authHeader.replace("Bearer ", "")
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) throw new Error("Unauthorized")
  const { data: membership } = await sb.from("workspace_members")
    .select("user_id").eq("workspace_id", workspaceId).eq("user_id", data.user.id).maybeSingle()
  if (!membership) throw new Error("Forbidden: not a workspace member")
  return data.user
}

async function getFreshToken(sb: any, integration: any): Promise<string> {
  const meta = integration.metadata ?? {};
  const expiresAt: number | undefined = meta.expires_at;
  // Proactive: refresh if missing expiry, or within 60s of expiring
  const needsRefresh = !expiresAt || Date.now() > (expiresAt - 60_000);
  if (!needsRefresh) return integration.access_token;

  const rt = integration.refresh_token ?? meta.refresh_token;
  if (!rt) throw new Error("Google token expired. Please reconnect Google Workspace in Integrations.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: rt,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error("Token refresh failed: " + (data.error_description ?? data.error ?? "unknown"));
  }
  const newExpiresAt = Date.now() + (Number(data.expires_in ?? 3600) * 1000);
  const update: any = {
    access_token: data.access_token,
    metadata: { ...meta, expires_at: newExpiresAt, expires_in: data.expires_in, token_obtained_at: Date.now() },
  };
  if (data.refresh_token) update.refresh_token = data.refresh_token;
  await sb.from("integrations").update(update).eq("id", integration.id);
  return data.access_token;
}

function buildRaw(from: string, to: string, subject: string, htmlBody: string, threadId?: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    htmlBody,
  ]
  return btoa(unescape(encodeURIComponent(lines.join("\r\n"))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function wrapHtml(body: string, sender: string): string {
  return `<div style="font-family:sans-serif;max-width:600px;padding:20px;line-height:1.6">
    ${body.replace(/\n/g, "<br>")}
    <hr style="margin-top:30px;border:none;border-top:1px solid #eee">
    <p style="color:#999;font-size:11px">Sent via Admeasy AI · ${sender}</p>
  </div>`
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { status: 200, headers: cors })

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const body = await req.json()
    const { workspace_id, action, ...params } = body

    if (!workspace_id) throw new Error("workspace_id required")

    // ── JWT Authentication ──────────────────────────────────
    try {
      await verifyAuthGmail(req, sb, workspace_id)
    } catch (authErr: any) {
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    const { data: integration } = await sb.from("integrations")
      .select("*").eq("workspace_id", workspace_id).eq("type", "google").single()

    if (!integration?.access_token) {
      return new Response(
        JSON.stringify({ error: "Gmail not connected. Go to Integrations → Connect Google Workspace." }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    const token = await getFreshToken(sb, integration)
    const senderEmail = integration.metadata?.email ?? "me"
    const BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

    // ── list — inbox summary ──────────────────────────────
    if (action === "list" || action === "list_messages" || action === "inbox") {
      const maxResults = params.maxResults ?? 20
      const q = params.q ?? ""

      const url = new URL(`${BASE}/messages`)
      url.searchParams.set("maxResults", String(maxResults))
      url.searchParams.set("labelIds", "INBOX")
      if (q) url.searchParams.set("q", q)

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? "Gmail list failed")

      const messages = []
      for (const msg of (data.messages ?? []).slice(0, 15)) {
        const mRes = await fetch(
          `${BASE}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const mData = await mRes.json()
        const hdrs = mData.payload?.headers ?? []
        messages.push({
          id: msg.id,
          threadId: mData.threadId,
          from: hdrs.find((h: any) => h.name === "From")?.value ?? "Unknown",
          subject: hdrs.find((h: any) => h.name === "Subject")?.value ?? "(no subject)",
          date: hdrs.find((h: any) => h.name === "Date")?.value ?? "",
          snippet: mData.snippet ?? "",
          unread: (mData.labelIds ?? []).includes("UNREAD"),
        })
      }

      return new Response(JSON.stringify({ messages, total: data.messages?.length ?? 0, account: senderEmail }), {
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    // ── read — full message body ──────────────────────────
    if (action === "read" || action === "read_message") {
      const { message_id, messageId } = params
      const id = message_id ?? messageId
      if (!id) throw new Error("message_id required")

      const res = await fetch(`${BASE}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      const hdrs = data.payload?.headers ?? []

      const extractText = (parts: any[]): string => {
        for (const p of parts) {
          if (p.mimeType === "text/plain" && p.body?.data)
            return atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"))
          if (p.parts) { const n = extractText(p.parts); if (n) return n }
        }
        return ""
      }

      let bodyText = ""
      if (data.payload?.body?.data)
        bodyText = atob(data.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"))
      else if (data.payload?.parts)
        bodyText = extractText(data.payload.parts)

      return new Response(JSON.stringify({
        id: data.id, threadId: data.threadId,
        from: hdrs.find((h: any) => h.name === "From")?.value ?? "",
        to: hdrs.find((h: any) => h.name === "To")?.value ?? "",
        subject: hdrs.find((h: any) => h.name === "Subject")?.value ?? "",
        date: hdrs.find((h: any) => h.name === "Date")?.value ?? "",
        body: bodyText.slice(0, 4000),
        snippet: data.snippet ?? "",
      }), { headers: { ...cors, "Content-Type": "application/json" } })
    }

    // ── send — single email ───────────────────────────────
    if (action === "send") {
      const { to, subject, body: emailBody, html, threadId, email } = params
      // Support both direct params and nested email object
      const finalTo      = to ?? email?.to
      const finalSubject = subject ?? email?.subject
      const finalBody    = emailBody ?? email?.body ?? ""

      if (!finalTo || !finalSubject) throw new Error("to and subject required")

      const htmlBody = html ?? wrapHtml(finalBody, senderEmail)
      const raw = buildRaw(senderEmail, finalTo, finalSubject, htmlBody)
      const sendBody: any = { raw }
      if (threadId) sendBody.threadId = threadId

      const res = await fetch(`${BASE}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(sendBody),
      })
      const data = await res.json()
      if (!res.ok) throw new Error("Gmail send failed: " + (data.error?.message ?? JSON.stringify(data)))

      return new Response(
        JSON.stringify({ success: true, messageId: data.id, from: senderEmail, to: finalTo }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ── send_batch — multiple emails ──────────────────────
    if (action === "send_batch") {
      const { emails } = params
      if (!emails?.length) throw new Error("emails array required")

      const results = []
      for (const em of emails) {
        try {
          const htmlBody = em.html ?? wrapHtml(em.body ?? "", senderEmail)
          const raw = buildRaw(senderEmail, em.to, em.subject, htmlBody)
          const res = await fetch(`${BASE}/messages/send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw }),
          })
          const data = await res.json()
          results.push({ to: em.to, status: res.ok ? "sent" : "failed", error: res.ok ? null : data.error?.message })
        } catch (e: any) {
          results.push({ to: em.to, status: "failed", error: e.message })
        }
      }

      const sent = results.filter(r => r.status === "sent").length
      return new Response(JSON.stringify({
        success: sent === emails.length,
        sent, failed: emails.length - sent, total: emails.length,
        from: senderEmail, results,
      }), { headers: { ...cors, "Content-Type": "application/json" } })
    }

    // ── archive / mark_read ───────────────────────────────
    if (action === "archive" || action === "mark_read") {
      const id = params.message_id ?? params.messageId
      if (!id) throw new Error("message_id required")
      const mod = action === "archive" ? { removeLabelIds: ["INBOX"] } : { removeLabelIds: ["UNREAD"] }
      await fetch(`${BASE}/messages/${id}/modify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(mod),
      })
      return new Response(JSON.stringify({ success: true, action, id }), {
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: "${action}"`, validActions: ["list","read","send","send_batch","archive","mark_read"] }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    )
  }
})