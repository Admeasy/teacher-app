import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

/** Verify JWT and workspace membership for data queries */
async function verifyAuthCallStatus(req: Request, sb: any, workspaceId: string) {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { status: 200, headers: cors })

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // ─── Exotel webhook (form POST) ─────────────────────────
    if (req.method === "POST") {
      const ct = req.headers.get("content-type") ?? ""

      if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        // Exotel status callback
        const form = await req.formData()
        const callSid   = form.get("CallSid")?.toString() ?? form.get("Sid")?.toString() ?? null
        const status    = form.get("Status")?.toString() ?? form.get("CallStatus")?.toString() ?? "unknown"
        const duration  = parseInt(form.get("Duration")?.toString() ?? "0", 10)
        const dialStatus = form.get("DialCallStatus")?.toString() ?? null

        console.log("Exotel webhook:", { callSid, status, duration })

        if (callSid) {
          const finalStatus = normaliseStatus(dialStatus ?? status)
          await sb.from("call_logs")
            .update({ status: finalStatus, duration })
            .eq("exotel_call_id", callSid)
        }

        return new Response("ok", { status: 200 })
      }

      // JSON request — return logs / summary (requires auth)
      let body: any = {}
      try { body = await req.json() } catch {}
      if (body.workspace_id) {
        try { await verifyAuthCallStatus(req, sb, body.workspace_id) } catch {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } })
        }
      }
      return await handleQuery(sb, body)
    }

    // ─── GET request — return logs / summary ────────────────
    const url = new URL(req.url)

    // Could be Exotel GET callback
    const callSid  = url.searchParams.get("CallSid") ?? url.searchParams.get("Sid")
    const status   = url.searchParams.get("Status") ?? url.searchParams.get("CallStatus")
    const duration = parseInt(url.searchParams.get("Duration") ?? "0", 10)

    if (callSid && status) {
      console.log("Exotel GET callback:", { callSid, status })
      await sb.from("call_logs")
        .update({ status: normaliseStatus(status), duration })
        .eq("exotel_call_id", callSid)
      return new Response("ok", { status: 200 })
    }

    // Otherwise treat as data query (requires auth)
    const workspace_id = url.searchParams.get("workspace_id")
    const session_id   = url.searchParams.get("session_id")
    if (workspace_id) {
      try { await verifyAuthCallStatus(req, sb, workspace_id) } catch {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } })
      }
    }
    return await handleQuery(sb, { workspace_id, session_id })

  } catch (err: any) {
    console.log("Error:", err.message)
    return new Response("ok", { status: 200 })
  }
})

async function handleQuery(sb: any, body: any) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }

  const { workspace_id, session_id, call_id, limit = 50 } = body ?? {}

  if (!workspace_id) {
    return new Response(
      JSON.stringify({ error: "workspace_id required" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    )
  }

  // Single call lookup
  if (call_id) {
    const { data } = await sb.from("call_logs")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("exotel_call_id", call_id)
      .single()
    return new Response(JSON.stringify(data ?? {}), {
      headers: { ...cors, "Content-Type": "application/json" }
    })
  }

  // Session summary
  let query = sb.from("call_logs")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (session_id) query = query.eq("session_id", session_id)

  const { data: logs } = await query

  const all = logs ?? []
  const summary = {
    total: all.length,
    answered: all.filter((l: any) => l.status === "answered" || l.status === "completed").length,
    no_answer: all.filter((l: any) => l.status === "no_answer" || l.status === "no-answer").length,
    failed: all.filter((l: any) => l.status === "failed" || l.status === "busy").length,
    initiated: all.filter((l: any) => l.status === "initiated" || l.status === "initiating" || l.status === "ringing").length,
    logs: all,
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...cors, "Content-Type": "application/json" }
  })
}

function normaliseStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/-/g, "_")
  if (s === "completed" || s === "answered") return "answered"
  if (s === "no_answer" || s === "noanswer") return "no_answer"
  if (s === "busy") return "busy"
  if (s === "failed" || s === "canceled") return "failed"
  if (s === "in_progress" || s === "ringing" || s === "initiated") return s
  return s
}