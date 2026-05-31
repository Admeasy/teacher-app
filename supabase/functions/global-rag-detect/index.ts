// Detect-only pass for ZIP uploads in global knowledge.
// Unpacks ZIP, runs AI metadata detection per file, stores guesses in
// global_rag_sources.detection_payload (parent row), and creates child rows
// with status='pending_review'. Admin reviews/edits then calls ingest with
// approved=true to actually embed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import getDocument from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const BUCKET = "global-academic";

function b64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}
const isImage = (n: string) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(n);
const isPdf = (n: string) => /\.pdf$/i.test(n);

async function quickText(name: string, bytes: Uint8Array): Promise<string> {
  if (isPdf(name)) {
    try {
      const r: any = await (getDocument as any)(bytes);
      return (r.text ?? "").slice(0, 4000);
    } catch {
      return "";
    }
  }
  if (isImage(name)) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Read just the title / chapter / heading visible. Return one short line." },
                { type: "image_url", image_url: { url: `data:image/png;base64,${b64(bytes)}` } },
              ],
            },
          ],
        }),
      });
      const j = await res.json();
      return (j.choices?.[0]?.message?.content ?? "").slice(0, 500);
    } catch {
      return "";
    }
  }
  return new TextDecoder().decode(bytes.slice(0, 4000));
}

async function detectMeta(filename: string, sample: string): Promise<any> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "user",
            content: `From this academic document, return strict JSON {chapter, subject, class, board}. Use null when unsure.\nFILENAME: ${filename}\n\nCONTENT:\n${sample.slice(0, 3500)}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const j = await res.json();
    return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user)
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow)
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const { source_id } = await req.json();
    const { data: parent } = await admin.from("global_rag_sources").select("*").eq("id", source_id).maybeSingle();
    if (!parent)
      return new Response(JSON.stringify({ error: "source not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    await admin
      .from("global_rag_sources")
      .update({ status: "processing", source_kind: "zip", review_status: "detecting", error: null })
      .eq("id", source_id);

    // Clean any prior children
    const { data: prior } = await admin
      .from("global_rag_sources")
      .select("id,storage_path")
      .eq("parent_zip_id", source_id);
    if (prior?.length) {
      const paths = prior.map((p: any) => p.storage_path).filter(Boolean);
      if (paths.length)
        await admin.storage
          .from(BUCKET)
          .remove(paths)
          .catch(() => {});
      await admin.from("global_rag_sources").delete().eq("parent_zip_id", source_id);
    }

    const dl = await admin.storage.from(BUCKET).download(parent.storage_path);
    if (dl.error) throw new Error(`download: ${dl.error.message}`);
    const zip = await JSZip.loadAsync(new Uint8Array(await dl.data!.arrayBuffer()));
    const entries = Object.values(zip.files).filter((f: any) => !f.dir);

    const detected: any[] = [];
    for (const entry of entries as any[]) {
      if (!/\.(pdf|png|jpe?g|webp|txt|md)$/i.test(entry.name)) continue;
      const fileBytes: Uint8Array = await entry.async("uint8array");
      const safe = entry.name
        .split("/")
        .pop()!
        .replace(/[^\w.\-]+/g, "_");
      const childId = crypto.randomUUID();
      const path = `${source_id}/zip/${childId}_${safe}`;
      const mime = isPdf(entry.name)
        ? "application/pdf"
        : isImage(entry.name)
          ? `image/${(entry.name.split(".").pop() || "png").toLowerCase()}`
          : "text/plain";

      const up = await admin.storage.from(BUCKET).upload(path, fileBytes, { contentType: mime, upsert: true });
      if (up.error) {
        console.error("upload", entry.name, up.error);
        continue;
      }

      const sample = await quickText(entry.name, fileBytes);
      const meta = await detectMeta(entry.name, sample);

      const childRow = {
        id: childId,
        name: entry.name,
        board: parent.board ?? meta.board ?? null,
        class: parent.class ?? (meta.class != null ? String(meta.class) : null),
        subject: parent.subject ?? meta.subject ?? null,
        chapter: meta.chapter ?? null,
        source_type: parent.source_type,
        source_kind: "zip_child",
        storage_path: path,
        file_size: fileBytes.byteLength,
        status: "pending",
        review_status: "pending_review",
        uploaded_by: parent.uploaded_by,
        parent_zip_id: source_id,
        detection_payload: meta,
      };
      await admin.from("global_rag_sources").insert(childRow);
      detected.push({ id: childId, name: entry.name, meta });
    }

    await admin
      .from("global_rag_sources")
      .update({
        status: "review",
        review_status: "pending_review",
        detection_payload: { count: detected.length, files: detected.map((d) => d.name) },
        page_count: detected.length,
      })
      .eq("id", source_id);

    return new Response(JSON.stringify({ ok: true, detected }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("global-rag-detect error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
