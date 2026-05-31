import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah

async function verifyAuth(req: Request, sb: any, workspaceId: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("Unauthorized");
  const { data: membership } = await sb.from("workspace_members")
    .select("user_id").eq("workspace_id", workspaceId).eq("user_id", data.user.id).maybeSingle();
  if (!membership) throw new Error("Forbidden");
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const text = (body.text ?? "").toString().slice(0, 4000);
  const voiceId = body.voiceId ?? DEFAULT_VOICE;
  const workspace_id = body.workspace_id;

  if (!workspace_id || typeof workspace_id !== "string") {
    return new Response(JSON.stringify({ error: "Missing workspace_id" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!text.trim()) {
    return new Response(JSON.stringify({ error: "Missing text" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    await verifyAuth(req, sb, workspace_id);
  } catch (e: any) {
    const msg = e?.message ?? "Unauthorized";
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Forbidden" ? 403 : 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not set" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
    },
  );

  if (!r.ok || !r.body) {
    const err = await r.text();
    return new Response(JSON.stringify({ error: err.slice(0, 500) }), {
      status: 502, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(r.body, {
    headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
});
