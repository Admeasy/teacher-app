import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { q } = await req.json().catch(() => ({ q: "" }));
    const query = String(q || "").trim();
    if (query.length < 2) {
      return new Response(JSON.stringify({ results: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Match against id (workspace key derived from email), school_code, slug, or name.
    const like = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, school_code, logo_url")
      .or(`id.ilike.${like},name.ilike.${like},slug.ilike.${like},school_code.ilike.${like}`)
      .limit(12);

    if (error) throw error;

    const results = (data || []).map((w) => ({
      id: w.id,
      name: w.name || w.id,
      slug: w.slug,
      code: w.school_code,
      logo_url: w.logo_url,
    }));

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ results: [], error: String((e as any)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
