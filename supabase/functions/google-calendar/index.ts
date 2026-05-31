import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

/** Verify JWT and workspace membership. Returns user or throws. */
async function verifyAuthGcal(req: Request, sb: any, workspaceId: string) {
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

// ─── Token refresh: proactive, expiry-aware, persists rotated refresh token ───
async function getFreshToken(sb: any, workspace_id: string, integration: any): Promise<string> {
  const meta = integration.metadata ?? {}
  const expiresAt: number | undefined = meta.expires_at
  const needsRefresh = !expiresAt || Date.now() > (expiresAt - 60_000)
  if (!needsRefresh) return integration.access_token

  if (!integration.refresh_token) {
    throw new Error("Google token expired and no refresh token available. Please reconnect Google in Integrations.")
  }

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
    }),
  })

  const refreshData = await refreshRes.json()
  if (!refreshRes.ok || !refreshData.access_token) {
    throw new Error("Failed to refresh Google token. Please reconnect Google in Integrations.")
  }

  const newExpiresAt = Date.now() + (Number(refreshData.expires_in ?? 3600) * 1000)
  const update: any = {
    access_token: refreshData.access_token,
    metadata: { ...meta, expires_at: newExpiresAt, expires_in: refreshData.expires_in, token_obtained_at: Date.now() },
  }
  if (refreshData.refresh_token) update.refresh_token = refreshData.refresh_token

  await sb
    .from("integrations")
    .update(update)
    .eq("workspace_id", workspace_id)
    .eq("type", "google")

  return refreshData.access_token
}

// ─── Parse natural language date/time to ISO ───────────────
function parseDateTime(dateStr: string, timeStr: string): string {
  // If already ISO, return as-is
  if (dateStr?.includes("T") || dateStr?.match(/^\d{4}-\d{2}-\d{2}T/)) return dateStr

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let date = today
  const dl = (dateStr || "").toLowerCase()

  if (dl === "today" || !dateStr) date = today
  else if (dl === "tomorrow") date = new Date(today.getTime() + 86400000)
  else if (dl.match(/^\d{4}-\d{2}-\d{2}$/)) date = new Date(dateStr)
  else {
    const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]
    const dayIdx = days.findIndex(d => dl.includes(d))
    if (dayIdx >= 0) {
      const diff = (dayIdx - today.getDay() + 7) % 7 || 7
      date = new Date(today.getTime() + diff * 86400000)
    }
  }

  // Parse time
  let hours = 9, minutes = 0
  if (timeStr) {
    const tl = timeStr.toLowerCase().replace(/\s/g, "")
    const match = tl.match(/(\d{1,2})(?::(\d{2}))?(am|pm)?/)
    if (match) {
      hours = parseInt(match[1])
      minutes = parseInt(match[2] || "0")
      if (match[3] === "pm" && hours < 12) hours += 12
      if (match[3] === "am" && hours === 12) hours = 0
    }
  }

  date.setHours(hours, minutes, 0, 0)
  // Convert to IST (UTC+5:30)
  return new Date(date.getTime() - (5.5 * 60 * 60 * 1000)).toISOString().replace("Z", "+05:30")
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
    const { workspace_id, action } = body

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ── JWT Authentication ──────────────────────────────────
    try {
      await verifyAuthGcal(req, sb, workspace_id)
    } catch (authErr: any) {
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    // ─── Get integration + fresh token ─────────────────────
    const { data: integration, error: intErr } = await sb
      .from("integrations")
      .select("access_token, refresh_token, metadata")
      .eq("workspace_id", workspace_id)
      .eq("type", "google")
      .single()

    if (intErr || !integration?.access_token) {
      return new Response(
        JSON.stringify({ error: "Google not connected. Go to Integrations → Connect Google Workspace." }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    const token = await getFreshToken(sb, workspace_id, integration)

    // ════════════════════════════════════════════════════════
    // ACTION: list — get upcoming events
    // ════════════════════════════════════════════════════════
    if (action === "list") {
      const {
        timeMin = new Date().toISOString(),
        timeMax = new Date(Date.now() + 7 * 86400000).toISOString(),
        maxResults = 20,
        query
      } = body

      const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
      url.searchParams.set("singleEvents", "true")
      url.searchParams.set("orderBy", "startTime")
      url.searchParams.set("maxResults", String(maxResults))
      url.searchParams.set("timeMin", timeMin)
      url.searchParams.set("timeMax", timeMax)
      if (query) url.searchParams.set("q", query)

      const res = await fetch(url.toString(), {
        headers: { Authorization: "Bearer " + token }
      })
      const data = await res.json()

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message ?? "Calendar fetch failed", raw: data }),
          { status: res.status, headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      // Format events cleanly for AI consumption
      const events = (data.items ?? []).map((e: any) => ({
        id: e.id,
        title: e.summary ?? "(No title)",
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        location: e.location ?? null,
        description: e.description ?? null,
        meetLink: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri ?? null,
        attendees: (e.attendees ?? []).map((a: any) => a.email),
        status: e.status,
      }))

      return new Response(
        JSON.stringify({ events, count: events.length }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ════════════════════════════════════════════════════════
    // ACTION: create — create a calendar event
    // ════════════════════════════════════════════════════════
    if (action === "create") {
      const {
        summary,
        description,
        date,        // "tomorrow", "2026-05-10", "Monday"
        time,        // "3pm", "15:00", "3:30 PM"
        startDateTime,  // ISO override if already parsed
        endDateTime,
        durationMinutes = 60,
        attendees = [],  // array of email strings
        addMeet = false,
        location,
        event,       // raw event object fallback (backwards compat)
      } = body

      // If raw event object passed (old format), use it directly
      if (event && !summary) {
        const useMeet = event.conferenceData !== undefined
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events${useMeet ? "?conferenceDataVersion=1" : ""}`
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(event),
        })
        const data = await res.json()
        return new Response(
          JSON.stringify({ event: data, meetLink: data.hangoutLink ?? null }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      if (!summary) {
        return new Response(
          JSON.stringify({ error: "summary (event title) is required" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      // Parse start time
      const start = startDateTime || parseDateTime(date, time)
      const startMs = new Date(start).getTime()
      const end = endDateTime || new Date(startMs + durationMinutes * 60000).toISOString().replace("Z", "+05:30")

      const eventBody: any = {
        summary,
        start: { dateTime: start, timeZone: "Asia/Kolkata" },
        end: { dateTime: end, timeZone: "Asia/Kolkata" },
      }

      if (description) eventBody.description = description
      if (location) eventBody.location = location
      if (attendees.length > 0) {
        eventBody.attendees = attendees.map((email: string) => ({ email }))
        eventBody.guestsCanSeeOtherGuests = true
        eventBody.sendUpdates = "all"
      }
      if (addMeet) {
        eventBody.conferenceData = {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } }
        }
      }

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events${addMeet ? "?conferenceDataVersion=1&sendUpdates=all" : "?sendUpdates=all"}`

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      })
      const data = await res.json()

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message ?? "Event creation failed", raw: data }),
          { status: res.status, headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      const meetLink = data.hangoutLink
        ?? data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri
        ?? null

      return new Response(
        JSON.stringify({
          success: true,
          event: {
            id: data.id,
            title: data.summary,
            start: data.start?.dateTime,
            end: data.end?.dateTime,
            meetLink,
            htmlLink: data.htmlLink,
            attendees: (data.attendees ?? []).map((a: any) => a.email),
          }
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ════════════════════════════════════════════════════════
    // ACTION: create_meet — instant Meet link only
    // ════════════════════════════════════════════════════════
    if (action === "create_meet") {
      const {
        summary = "Meeting",
        startDateTime,
        endDateTime,
        attendees = [],
      } = body

      const now = new Date()
      const start = startDateTime ?? new Date(now.getTime() + 5 * 60000).toISOString()
      const end = endDateTime ?? new Date(now.getTime() + 65 * 60000).toISOString()

      const eventBody: any = {
        summary,
        start: { dateTime: start, timeZone: "Asia/Kolkata" },
        end: { dateTime: end, timeZone: "Asia/Kolkata" },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      }

      if (attendees.length > 0) {
        eventBody.attendees = attendees.map((email: string) => ({ email }))
        eventBody.sendUpdates = "all"
      }

      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(eventBody),
        }
      )
      const data = await res.json()

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message ?? "Meet creation failed", raw: data }),
          { status: res.status, headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      const meetLink = data.hangoutLink
        ?? data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri
        ?? null

      if (!meetLink) {
        return new Response(
          JSON.stringify({ error: "Event created but Meet link not returned. Check your Google Workspace plan supports Meet.", raw: data }),
          { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          meetLink,
          eventId: data.id,
          eventTitle: data.summary,
          start: data.start?.dateTime,
          htmlLink: data.htmlLink,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ════════════════════════════════════════════════════════
    // ACTION: update — update existing event
    // ════════════════════════════════════════════════════════
    if (action === "update") {
      const { eventId, updates } = body

      if (!eventId) {
        return new Response(
          JSON.stringify({ error: "eventId is required for update" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      // Fetch existing event first
      const getRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { headers: { Authorization: "Bearer " + token } }
      )
      const existing = await getRes.json()

      const merged = { ...existing, ...updates }

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
        {
          method: "PUT",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        }
      )
      const data = await res.json()

      return new Response(
        JSON.stringify({ success: true, event: data }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ════════════════════════════════════════════════════════
    // ACTION: delete — delete event by ID
    // ════════════════════════════════════════════════════════
    if (action === "delete") {
      const { eventId } = body

      if (!eventId) {
        return new Response(
          JSON.stringify({ error: "eventId is required" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        )
      }

      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
        { method: "DELETE", headers: { Authorization: "Bearer " + token } }
      )

      return new Response(
        JSON.stringify({ success: true, deleted: eventId }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ════════════════════════════════════════════════════════
    // ACTION: free_slots — find gaps in a day
    // ════════════════════════════════════════════════════════
    if (action === "free_slots") {
      const { date = "today", workdayStart = 9, workdayEnd = 18 } = body

      const targetDate = date === "today" ? new Date() : new Date(date)
      targetDate.setHours(0, 0, 0, 0)
      const dayStart = new Date(targetDate.getTime() + workdayStart * 3600000)
      const dayEnd = new Date(targetDate.getTime() + workdayEnd * 3600000)

      const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
      url.searchParams.set("singleEvents", "true")
      url.searchParams.set("orderBy", "startTime")
      url.searchParams.set("timeMin", dayStart.toISOString())
      url.searchParams.set("timeMax", dayEnd.toISOString())

      const res = await fetch(url.toString(), { headers: { Authorization: "Bearer " + token } })
      const data = await res.json()
      const events = (data.items ?? []).filter((e: any) => e.start?.dateTime)

      const slots: { start: string; end: string; durationMins: number }[] = []
      let cursor = dayStart.getTime()

      for (const e of events) {
        const eStart = new Date(e.start.dateTime).getTime()
        if (eStart > cursor + 30 * 60000) {
          slots.push({
            start: new Date(cursor).toISOString(),
            end: new Date(eStart).toISOString(),
            durationMins: Math.round((eStart - cursor) / 60000),
          })
        }
        cursor = Math.max(cursor, new Date(e.end.dateTime).getTime())
      }

      if (cursor < dayEnd.getTime() - 30 * 60000) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: dayEnd.toISOString(),
          durationMins: Math.round((dayEnd.getTime() - cursor) / 60000),
        })
      }

      return new Response(
        JSON.stringify({ freeSlots: slots.slice(0, 5) }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      )
    }

    // ════════════════════════════════════════════════════════
    // Unknown action
    // ════════════════════════════════════════════════════════
    return new Response(
      JSON.stringify({
        error: `Unknown action: "${action}"`,
        validActions: ["list", "create", "create_meet", "update", "delete", "free_slots"]
      }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    )
  }
})