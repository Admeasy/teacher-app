// Schema inference edge function — maps raw CSV/XLSX headers to canonical fields.
// Uses Lovable AI Gateway (OPENROUTER_API_KEY auto-provided).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAuth(req: Request, sb: any, workspaceId: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await sb.auth.getUser(token);
  const user = data?.user;
  if (error || !user) throw new Error("Unauthorized");
  const { data: m } = await sb.from("workspace_members")
    .select("user_id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (m) return;

  const email = String(user.email ?? "").toLowerCase();
  const expectedWorkspaceId = email.endsWith("@admeasy.in") ? email.split("@")[0] : null;
  if (expectedWorkspaceId !== workspaceId.toLowerCase()) throw new Error("Forbidden");

  const { error: workspaceError } = await sb
    .from("workspaces")
    .upsert({ id: expectedWorkspaceId, name: email }, { onConflict: "id", ignoreDuplicates: true });
  if (workspaceError) throw new Error("Forbidden");

  const { error: memberError } = await sb
    .from("workspace_members")
    .upsert({ user_id: user.id, workspace_id: expectedWorkspaceId, role: "admin" }, { onConflict: "user_id,workspace_id", ignoreDuplicates: true });
  if (memberError) throw new Error("Forbidden");
}

const SYSTEM_PROMPT = `You are a school data schema mapper. Map raw spreadsheet headers to canonical fields based on the sheet name and headers.

Canonical fields by entity:
- student: student_id, name, class, section, student_email, parent_name, parent_email, parent_phone, attendance_pct, total_fees, paid, due, fee_status, interests
- teacher: teacher_id, name, subject, email, phone, assigned_classes
- mentor: mentor_id, name, institution, program, college, expertise_tags, available_for, contact_email
- fee (fee reminders / unpaid parents): student_id, student_name, section, parent_name, parent_email, parent_phone, amount_due, fee_status, channels
- attendance (attendance alerts / risk lists): student_id, student_name, section, attendance_pct, parent_name, parent_email, parent_phone, risk_level
- match (mentor matches / pre-computed pairs): student_id, student_name, section, student_interests, mentor_id, mentor_name, mentor_institution, mentor_tags

Rules:
- Pick the entity that best matches the sheet name AND the headers (e.g., "Fee Reminders" → fee, "Attendance Alerts" → attendance, "Mentor Matches" → match).
- Map every header you can confidently identify; skip ones you are unsure about.
- Use the map_schema tool to return the result.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { headers, sheetName, tab_name_context, workspace_id } = await req.json();

    if (!workspace_id || typeof workspace_id !== "string") {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    try {
      await verifyAuth(req, sb, workspace_id);
    } catch (e: any) {
      const msg = e?.message ?? "Unauthorized";
      return new Response(JSON.stringify({ error: msg }), {
        status: msg === "Forbidden" ? 403 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (Array.isArray(headers) && headers.length > 200) {
      return new Response(JSON.stringify({ error: "too many headers" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Array.isArray(headers) && !headers.every((h) => typeof h === "string" && h.length < 500)) {
      return new Response(JSON.stringify({ error: "invalid headers" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract class/section from tab name context (e.g. "Class 6A", "Grade 7B", "Nursery")
    let inferred_class: string | null = null;
    let inferred_section: string | null = null;
    const ctx = String(tab_name_context ?? sheetName ?? "");
    if (ctx) {
      const classMatch = ctx.match(/(nursery|prep|lkg|ukg|kg|\d{1,2})/i);
      if (classMatch) {
        const v = classMatch[1].toLowerCase();
        inferred_class = /^\d+$/.test(v) ? v : v.toUpperCase();
      }
      // section: trailing single letter A-E (e.g. "6A", "Class 7 B")
      const sectionMatch = ctx.match(/(?:^|[^A-Za-z])([A-E])(?:\s|$)/i) || ctx.match(/([A-E])$/i);
      if (sectionMatch) inferred_section = sectionMatch[1].toUpperCase();
    }

    if (!Array.isArray(headers) || headers.length === 0) {
      return new Response(JSON.stringify({ error: "headers array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Sheet name: "${sheetName ?? ""}". Headers: ${JSON.stringify(headers)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "map_schema",
              description: "Return mapping of raw headers to canonical fields.",
              parameters: {
                type: "object",
                properties: {
                  entity: {
                    type: "string",
                    enum: ["student", "teacher", "mentor", "fee", "attendance", "match", "unknown"],
                  },
                  mappings: {
                    type: "object",
                    description: "Object whose keys are raw headers and values are canonical field names.",
                    additionalProperties: { type: "string" },
                  },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
                required: ["entity", "mappings", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "map_schema" } },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("AI gateway error", resp.status, text);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = { entity: "unknown", mappings: {}, confidence: 0 };
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); } catch { /* fall through */ }
    }

    return new Response(
      JSON.stringify({
        entity: parsed.entity ?? "unknown",
        mappings: parsed.mappings ?? {},
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        inferred_class,
        inferred_section,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("infer-schema error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
