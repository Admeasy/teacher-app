// Voice session — proxies a transcript through the SAME `command` pipeline.
// Logs the spoken request to `voice_command_history` and links it to the conversation.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { workspace_id, transcript, mode, conversation_id, history, intent,
    student_data, teacher_data, mentor_data, page_context } = body;

  if (!workspace_id || !transcript) {
    return new Response(JSON.stringify({ error: "Missing workspace_id or transcript" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const auth = req.headers.get("Authorization") ?? "";
  const cmdRes = await fetch(`${SUPABASE_URL}/functions/v1/command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify({
      workspace_id, conversation_id, input: transcript, mode: mode ?? "Agent",
      intent, history, student_data, teacher_data, mentor_data,
      client_source: "voice_runtime",
    }),
  });

  const cmdJson = await cmdRes.json().catch(() => ({}));

  // Save to history (best-effort)
  try {
    await sb.from("voice_command_history").insert({
      workspace_id,
      conversation_id: conversation_id ?? null,
      transcript,
      response: (cmdJson?.response ?? "").toString().slice(0, 4000),
      page_context: page_context ?? null,
    });
  } catch (_) { /* non-fatal */ }

  return new Response(JSON.stringify(cmdJson), {
    status: cmdRes.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
