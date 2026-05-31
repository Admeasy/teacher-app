import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function verifyAuth(req: Request, sb: any, workspaceId: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("Unauthorized");
  const { data: m } = await sb.from("workspace_members")
    .select("user_id").eq("workspace_id", workspaceId).eq("user_id", data.user.id).maybeSingle();
  if (!m) throw new Error("Forbidden");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });

  try {
    const body = await req.json();

    const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    if (!body.workspace_id || typeof body.workspace_id !== "string") {
      return json(400, { error: "Missing workspace_id" });
    }
    try {
      await verifyAuth(req, sb, body.workspace_id);
    } catch (e: any) {
      const msg = e?.message ?? "Unauthorized";
      return json(msg === "Forbidden" ? 403 : 401, { error: msg });
    }

    // Refresh-only mode (called by extension when token expires)
    if (body.refresh_only && body.refresh_token && body.workspace_id) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: body.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const tokens = await refreshRes.json();
      if (!tokens.access_token) return json(400, { error: "Refresh failed" });

      
      const expiresAt = Date.now() + (Number(tokens.expires_in ?? 3600) * 1000);
      await sb.from("integrations")
        .update({
          access_token: tokens.access_token,
          metadata: {
            expires_at: expiresAt,
            expires_in: tokens.expires_in,
            token_obtained_at: Date.now(),
          },
        })
        .eq("workspace_id", body.workspace_id)
        .eq("type", "google");

      return json(200, { access_token: tokens.access_token, expires_in: tokens.expires_in });
    }

    const { code, workspace_id, redirect_uri } = body;
    if (!code || !workspace_id) return json(400, { error: "Missing code or workspace_id" });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirect_uri ?? "https://ai.admeasy.in/oauth/google/callback",
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      return json(400, { error: tokens.error_description ?? tokens.error ?? "Token exchange failed" });
    }

    const { access_token, refresh_token, expires_in } = tokens;

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userRes.json();
    const email = userInfo.email ?? null;

    

    const { data: existing } = await sb
      .from("integrations")
      .select("id, refresh_token")
      .eq("workspace_id", workspace_id)
      .eq("type", "google")
      .maybeSingle();

    const finalRefreshToken = refresh_token ?? existing?.refresh_token ?? null;

    if (!finalRefreshToken) {
      return json(400, {
        error: "No refresh token. Delete Google integration from DB and reconnect.",
      });
    }

    const expiresAt = Date.now() + (Number(expires_in ?? 3600) * 1000);
    const payload = {
      workspace_id,
      type: "google",
      access_token,
      refresh_token: finalRefreshToken,
      connected_at: new Date().toISOString(),
      metadata: {
        email,
        expires_in,
        token_obtained_at: Date.now(),
        expires_at: expiresAt,
      },
    };

    if (existing?.id) {
      await sb.from("integrations").update(payload).eq("id", existing.id);
    } else {
      await sb.from("integrations").insert(payload);
    }

    return json(200, { ok: true, email });
  } catch (e: any) {
    return json(500, { error: e.message ?? "Unknown error" });
  }
});
