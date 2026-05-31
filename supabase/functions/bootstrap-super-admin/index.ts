// Idempotent bootstrap: ensures the hardcoded super-admin auth user exists.
// Safe to call publicly — only ever creates the one specific account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPER_ADMIN_EMAIL = "schooladmeasy@admeasy.in";
const SUPER_ADMIN_PASSWORD = "Admeasy@school";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Check if user already exists
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find((u) => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL);

    if (found) {
      // Ensure role row exists
      await admin.from("user_roles").upsert(
        { user_id: found.id, role: "super_admin" },
        { onConflict: "user_id,role" },
      );
      return new Response(JSON.stringify({ ok: true, created: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;

    // Trigger will grant the role; insert as a belt-and-braces backup.
    if (created?.user?.id) {
      await admin.from("user_roles").upsert(
        { user_id: created.user.id, role: "super_admin" },
        { onConflict: "user_id,role" },
      );
    }

    return new Response(JSON.stringify({ ok: true, created: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
