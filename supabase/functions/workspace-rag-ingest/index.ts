// Per-school knowledge ingest: PDF + image (OCR) + ZIP + CSV + XLSX + text.
// Auth: workspace member only (same workspace as source).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import getDocument from "npm:pdf-parse@1.1.1";
import {
  isCsv, isXlsx, extractCsv, extractXlsx,
  buildFailurePatch, aiSummary,
} from "../_shared/ragHelpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const EMBED_MODEL = "openai/text-embedding-3-small";
const EMBED_DIMS = 1536;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const BATCH = 64;
const BUCKET = "workspace-knowledge";

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + CHUNK_SIZE, clean.length);
    let slice = clean.slice(i, end);
    if (end < clean.length) {
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (lastBreak > CHUNK_SIZE * 0.5) slice = slice.slice(0, lastBreak + 1);
    }
    const s = slice.trim();
    if (s.length > 40) out.push(s);
    i += Math.max(slice.length - CHUNK_OVERLAP, 1);
  }
  return out;
}

async function embedBatch(inputs: string[], attempt = 0): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    return embedBatch(inputs, attempt + 1);
  }
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data.map((d: any) => d.embedding as number[]);
}

function b64(bytes: Uint8Array): string {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

async function ocrImage(bytes: Uint8Array, mime: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Transcribe ALL visible text verbatim. Preserve headings, lists, equations, captions, names, marks, dates. Plain text only." },
          { type: "image_url", image_url: { url: `data:${mime || "image/png"};base64,${b64(bytes)}` } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Vision OCR ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function inferMetadata(text: string, filename: string) {
  const sample = text.slice(0, 3500);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: `Extract metadata as JSON with optional keys: chapter, subject, class, board. Use null if unknown.\n\nFILENAME: ${filename}\n\nCONTENT:\n${sample}` }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return {};
    const j = await res.json();
    return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
  } catch { return {}; }
}

const isImage = (n: string, m?: string) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(n) || (m ?? "").startsWith("image/");
const isPdf = (n: string, m?: string) => /\.pdf$/i.test(n) || m === "application/pdf";
const isZip = (n: string, m?: string) => /\.zip$/i.test(n) || m === "application/zip" || m === "application/x-zip-compressed";

async function extractText(bytes: Uint8Array, name: string, mime: string) {
  if (isPdf(name, mime)) {
    const p: any = await (getDocument as any)(bytes);
    return { text: p.text ?? "", pages: p.numpages ?? null };
  }
  if (isImage(name, mime)) return { text: await ocrImage(bytes, mime), pages: null };
  if (isCsv(name, mime)) { const r = extractCsv(bytes); return { text: r.text, pages: r.rows }; }
  if (isXlsx(name, mime)) { const r = extractXlsx(bytes); return { text: r.text, pages: r.rows }; }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), pages: null };
}

async function setStatus(id: string, patch: Record<string, any>) {
  await admin.from("workspace_rag_sources").update(patch).eq("id", id);
}

async function ingestSingle(sourceId: string, bytes: Uint8Array, mime: string) {
  const { data: src } = await admin.from("workspace_rag_sources").select("*").eq("id", sourceId).maybeSingle();
  if (!src) throw new Error("source missing");

  await setStatus(sourceId, { status: "processing", error: null, error_code: null, error_explanation: null, error_suggestion: null });
  await admin.from("workspace_rag_chunks").delete().eq("source_id", sourceId);

  const { text, pages } = await extractText(bytes, src.name, mime);
  if (!text.trim()) {
    const patch = await buildFailurePatch("No text extracted", src.name);
    await setStatus(sourceId, { ...patch, page_count: pages });
    return 0;
  }

  const patch: Record<string, any> = { page_count: pages };
  if (!src.chapter || !src.subject || !src.class) {
    const meta: any = await inferMetadata(text, src.name);
    if (!src.chapter && meta.chapter) patch.chapter = meta.chapter;
    if (!src.subject && meta.subject) patch.subject = meta.subject;
    if (!src.class && meta.class) patch.class = String(meta.class);
    if (!src.board && meta.board) patch.board = meta.board;
  }
  if (Object.keys(patch).length) await admin.from("workspace_rag_sources").update(patch).eq("id", sourceId);

  const chunks = chunkText(text);
  if (!chunks.length) {
    const fp = await buildFailurePatch("No chunks produced", src.name);
    await setStatus(sourceId, fp);
    return 0;
  }

  let inserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vectors = await embedBatch(slice);
    const rows = slice.map((content, j) => ({
      workspace_id: src.workspace_id,
      source_id: sourceId,
      source_name: src.name,
      source_type: src.source_type,
      board: patch.board ?? src.board,
      class: patch.class ?? src.class,
      subject: patch.subject ?? src.subject,
      chapter: patch.chapter ?? src.chapter,
      chunk_index: i + j,
      content,
      embedding: vectors[j] as any,
      metadata: { page_count: pages },
    }));
    const { error } = await admin.from("workspace_rag_chunks").insert(rows);
    if (error) throw new Error(`Insert chunks: ${error.message}`);
    inserted += rows.length;
  }

  const summary = await aiSummary(text, src.name);
  await setStatus(sourceId, {
    status: "ready", chunk_count: inserted,
    error: null, error_code: null, error_explanation: null, error_suggestion: null,
    ai_summary: summary || null,
  });
  return inserted;
}

async function ingestZip(parentId: string, bytes: Uint8Array) {
  const { data: parent } = await admin.from("workspace_rag_sources").select("*").eq("id", parentId).maybeSingle();
  if (!parent) throw new Error("zip parent missing");
  await setStatus(parentId, { status: "processing", error: null, source_kind: "zip" });

  const { data: prior } = await admin.from("workspace_rag_sources").select("id,storage_path").eq("parent_zip_id", parentId);
  if (prior?.length) {
    const paths = prior.map((p: any) => p.storage_path).filter(Boolean);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => {});
    await admin.from("workspace_rag_sources").delete().eq("parent_zip_id", parentId);
  }

  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((f: any) => !f.dir);
  let total = 0, processed = 0;

  for (const entry of entries as any[]) {
    if (!/\.(pdf|png|jpe?g|webp|txt|md|csv|xlsx|xls)$/i.test(entry.name)) continue;
    const fb: Uint8Array = await entry.async("uint8array");
    const safe = entry.name.split("/").pop()!.replace(/[^\w.\-]+/g, "_");
    const childId = crypto.randomUUID();
    const path = `${parent.workspace_id}/${parentId}/${childId}_${safe}`;
    const ext = (entry.name.split(".").pop() || "").toLowerCase();
    const mime = isPdf(entry.name) ? "application/pdf"
      : isImage(entry.name) ? `image/${ext || "png"}`
      : isCsv(entry.name) ? "text/csv"
      : isXlsx(entry.name) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/plain";

    const up = await admin.storage.from(BUCKET).upload(path, fb, { contentType: mime, upsert: true });
    if (up.error) { console.error("zip upload", up.error); continue; }

    const { data: child, error } = await admin.from("workspace_rag_sources").insert({
      id: childId,
      workspace_id: parent.workspace_id,
      name: entry.name,
      board: parent.board, class: parent.class, subject: parent.subject,
      chapter: null,
      source_type: parent.source_type,
      source_kind: "zip_child",
      storage_path: path,
      file_size: fb.byteLength,
      status: "pending",
      uploaded_by: parent.uploaded_by,
      parent_zip_id: parentId,
    }).select("id").single();
    if (error) { console.error("zip child insert", error); continue; }

    try { total += await ingestSingle(child.id, fb, mime); processed++; }
    catch (e: any) {
      console.error("zip child ingest", entry.name, e?.message);
      const fp = await buildFailurePatch(String(e?.message ?? e), entry.name);
      await admin.from("workspace_rag_sources").update(fp).eq("id", child.id);
    }
  }

  await setStatus(parentId, {
    status: "ready", chunk_count: total, page_count: processed,
    error: processed === 0 ? "No supported files in archive" : null,
    error_code: processed === 0 ? "ZIP_EMPTY" : null,
    error_explanation: processed === 0 ? "The ZIP contained no PDF, image, text, CSV, or XLSX files we know how to ingest." : null,
    error_suggestion: processed === 0 ? "Add supported files (PDF / PNG / JPG / TXT / MD / CSV / XLSX) and re-upload." : null,
  });
  return { total, processed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { source_id } = await req.json();
    if (!source_id) return new Response(JSON.stringify({ error: "source_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: source } = await admin.from("workspace_rag_sources").select("*").eq("id", source_id).maybeSingle();
    if (!source) return new Response(JSON.stringify({ error: "source not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Verify caller is member of this workspace via RLS (read with user client)
    const { data: memCheck } = await userClient.from("workspace_rag_sources").select("id").eq("id", source_id).maybeSingle();
    if (!memCheck) return new Response(JSON.stringify({ error: "forbidden — not a workspace member" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const dl = await admin.storage.from(BUCKET).download(source.storage_path);
    if (dl.error || !dl.data) throw new Error(`Download failed: ${dl.error?.message}`);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const mime = dl.data.type || "";

    if (isZip(source.name, mime)) {
      const r = await ingestZip(source_id, bytes);
      return new Response(JSON.stringify({ ok: true, kind: "zip", ...r }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const chunks = await ingestSingle(source_id, bytes, mime);
    return new Response(JSON.stringify({ ok: true, chunks }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("workspace-rag-ingest error", e);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.source_id) {
        const fp = await buildFailurePatch(String(e?.message ?? e), "source");
        await setStatus(body.source_id, fp);
      }
    } catch {}
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
