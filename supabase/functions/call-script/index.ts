import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url)

    // Exotel sends phone as Called, To, From, or custom param
    const phone =
      url.searchParams.get("phone") ??
      url.searchParams.get("Called") ??
      url.searchParams.get("To") ??
      url.searchParams.get("From") ??
      null

    // Also accept POST body (Exotel sometimes POSTs)
    let bodyPhone: string | null = null
    if (req.method === "POST") {
      try {
        const ct = req.headers.get("content-type") ?? ""
        if (ct.includes("application/x-www-form-urlencoded")) {
          const form = await req.formData()
          bodyPhone = (form.get("Called") ?? form.get("To") ?? form.get("From"))?.toString() ?? null
        } else {
          const b = await req.json()
          bodyPhone = b.phone ?? b.Called ?? b.To ?? b.From ?? null
        }
      } catch {}
    }

    const resolvedPhone = (bodyPhone ?? phone ?? "").replace(/\s/g, "")
    console.log("Script request — phone:", resolvedPhone)

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Try exact phone match
    if (resolvedPhone) {
      const { data } = await sb
        .from("call_scripts")
        .select("script")
        .eq("phone", resolvedPhone)
        .single()

      if (data?.script) {
        console.log("Script found for:", resolvedPhone)
        return new Response(data.script, { headers: { "Content-Type": "text/plain" } })
      }

      // Try without country code (e.g., stored as 9xxxxxxxxxx vs +919xxxxxxxxxx)
      const stripped = resolvedPhone.replace(/^\+91/, "").replace(/^91/, "")
      const { data: data2 } = await sb
        .from("call_scripts")
        .select("script")
        .ilike("phone", `%${stripped}`)
        .single()

      if (data2?.script) {
        console.log("Script found via stripped:", stripped)
        return new Response(data2.script, { headers: { "Content-Type": "text/plain" } })
      }
    }

    // Fallback — most recent script for any number
    const { data: recent } = await sb
      .from("call_scripts")
      .select("script")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (recent?.script) {
      console.log("Fallback to most recent script")
      return new Response(recent.script, { headers: { "Content-Type": "text/plain" } })
    }

    return new Response(
      "Hello. This is an automated call from Admeasy School. Please contact the school office. Thank you and have a good day.",
      { headers: { "Content-Type": "text/plain" } }
    )

  } catch (err: any) {
    console.log("Error:", err.message)
    return new Response(
      "Hello. This is an automated call from Admeasy School. Thank you.",
      { headers: { "Content-Type": "text/plain" }, status: 200 }
    )
  }
})