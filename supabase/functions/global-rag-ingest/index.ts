// Global knowledge ingest: PDF + image (OCR) + ZIP (recursive) + CSV + XLSX + text.
// Auth: super_admin only.
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
const BUCKET = "global-academic";

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
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
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
          { type: "text", text: "Transcribe ALL text visible in this image verbatim. Preserve headings, lists, equations, captions, and any chapter/section titles. Output plain text only, no commentary." },
          { type: "image_url", image_url: { url: `data:${mime || "image/png"};base64,${b64(bytes)}` } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Vision OCR ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

async function inferMetadata(text: string, filename: string): Promise<{ chapter?: string; subject?: string; class?: string; board?: string }> {
  const sample = text.slice(0, 3500);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `From this academic document, extract metadata as strict JSON with optional keys: chapter, subject, class, board. Use null if unknown. No prose, JSON only.\n\nFILENAME: ${filename}\n\nCONTENT:\n${sample}`,
        }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return {};
    const j = await res.json();
    const txt = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt);
    return {
      chapter: parsed.chapter || undefined,
      subject: parsed.subject || undefined,
      class: parsed.class ? String(parsed.class) : undefined,
      board: parsed.board || undefined,
    };
  } catch {
    return {};
  }
}

async function setStatus(sourceId: string, patch: Record<string, any>) {
  await admin.from("global_rag_sources").update(patch).eq("id", sourceId);
}

function isImage(name: string, mime?: string) {
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name) || (mime ?? "").startsWith("image/");
}
function isPdf(name: string, mime?: string) {
  return /\.pdf$/i.test(name) || mime === "application/pdf";
}
function isZip(name: string, mime?: string) {
  return /\.zip$/i.test(name) || mime === "application/zip" || mime === "application/x-zip-compressed";
}

async function extractTextFromBytes(bytes: Uint8Array, name: string, mime: string): Promise<{ text: string; pages: number | null }> {
  if (isPdf(name, mime)) {
    const parsed: any = await (getDocument as any)(bytes);
    return { text: parsed.text ?? "", pages: parsed.numpages ?? null };
  }
  if (isImage(name, mime)) {
    return { text: await ocrImage(bytes, mime), pages: null };
  }
  if (isCsv(name, mime)) { const r = extractCsv(bytes); return { text: r.text, pages: r.rows }; }
  if (isXlsx(name, mime)) { const r = extractXlsx(bytes); return { text: r.text, pages: r.rows }; }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), pages: null };
}

async function ingestSingle(sourceId: string, bytes: Uint8Array, mime: string) {
  const { data: source } = await admin.from("global_rag_sources").select("*").eq("id", sourceId).maybeSingle();
  if (!source) throw new Error("source missing during ingest");

  await setStatus(sourceId, { status: "processing", error: null, error_code: null, error_explanation: null, error_suggestion: null });
  await admin.from("global_rag_chunks").delete().eq("source_id", sourceId);

  const { text, pages } = await extractTextFromBytes(bytes, source.name, mime);
  if (!text.trim()) {
    const fp = await buildFailurePatch("No text extracted", source.name);
    await setStatus(sourceId, { ...fp, page_count: pages });
    return 0;
  }

  const patch: Record<string, any> = { page_count: pages };
  if (!source.chapter || !source.subject || !source.class || !source.board) {
    const meta = await inferMetadata(text, source.name);
    if (!source.chapter && meta.chapter) patch.chapter = meta.chapter;
    if (!source.subject && meta.subject) patch.subject = meta.subject;
    if (!source.class && meta.class) patch.class = meta.class;
    if (!source.board && meta.board) patch.board = meta.board;
  }
  if (Object.keys(patch).length) await admin.from("global_rag_sources").update(patch).eq("id", sourceId);

  const chunks = chunkText(text);
  if (!chunks.length) {
    const fp = await buildFailurePatch("Chunking produced no text", source.name);
    await setStatus(sourceId, fp);
    return 0;
  }

  let inserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vectors = await embedBatch(slice);
    const rows = slice.map((content, j) => ({
      source_id: sourceId,
      source_name: source.name,
      board: patch.board ?? source.board,
      class: patch.class ?? source.class,
      subject: patch.subject ?? source.subject,
      chapter: patch.chapter ?? source.chapter,
      source_type: source.source_type,
      chunk_index: i + j,
      content,
      embedding: vectors[j] as any,
      metadata: { page_count: pages },
    }));
    const { error: insErr } = await admin.from("global_rag_chunks").insert(rows);
    if (insErr) throw new Error(`Insert chunks: ${insErr.message}`);
    inserted += rows.length;
  }

  const summary = await aiSummary(text, source.name);
  await setStatus(sourceId, {
    status: "ready", error: null, error_code: null, error_explanation: null, error_suggestion: null,
    chunk_count: inserted, ai_summary: summary || null,
  });
  return inserted;
}

async function ingestZip(parentId: string, bytes: Uint8Array) {
  const { data: parent } = await admin.from("global_rag_sources").select("*").eq("id", parentId).maybeSingle();
  if (!parent) throw new Error("zip parent missing");

  await setStatus(parentId, { status: "processing", error: null, source_kind: "zip" });
  // Remove prior children + chunks
  const { data: prior } = await admin.from("global_rag_sources").select("id,storage_path").eq("parent_zip_id", parentId);
  if (prior?.length) {
    const paths = prior.map((p: any) => p.storage_path).filter(Boolean);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => {});
    await admin.from("global_rag_sources").delete().eq("parent_zip_id", parentId);
  }

  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((f: any) => !f.dir);
  let totalChunks = 0;
  let processed = 0;

  for (const entry of entries as any[]) {
    if (!/\.(pdf|png|jpe?g|webp|txt|md|csv|xlsx|xls)$/i.test(entry.name)) continue;
    const fileBytes: Uint8Array = await entry.async("uint8array");
    const safe = entry.name.split("/").pop()!.replace(/[^\w.\-]+/g, "_");
    const childId = crypto.randomUUID();
    const path = `${parentId}/zip/${childId}_${safe}`;
    const ext = (entry.name.split(".").pop() || "").toLowerCase();
    const mime = isPdf(entry.name) ? "application/pdf"
      : isImage(entry.name) ? `image/${ext || "png"}`
      : isCsv(entry.name) ? "text/csv"
      : isXlsx(entry.name) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/plain";

    const up = await admin.storage.from(BUCKET).upload(path, fileBytes, { contentType: mime, upsert: true });
    if (up.error) { console.error("zip child upload failed", up.error); continue; }

    const { data: child, error: insErr } = await admin.from("global_rag_sources").insert({
      id: childId,
      name: entry.name,
      board: parent.board,
      class: parent.class,
      subject: parent.subject,
      chapter: null,
      source_type: parent.source_type,
      source_kind: "zip_child",
      storage_path: path,
      file_size: fileBytes.byteLength,
      status: "pending",
      uploaded_by: parent.uploaded_by,
      parent_zip_id: parentId,
    }).select("id").single();
    if (insErr) { console.error("zip child insert failed", insErr); continue; }

    try {
      totalChunks += await ingestSingle(child.id, fileBytes, mime);
      processed += 1;
    } catch (e: any) {
      console.error("zip child ingest error", entry.name, e?.message);
      const fp = await buildFailurePatch(String(e?.message ?? e), entry.name);
      await admin.from("global_rag_sources").update(fp).eq("id", child.id);
    }
  }

  await setStatus(parentId, {
    status: "ready",
    chunk_count: totalChunks,
    page_count: processed,
    error: processed === 0 ? "No supported files found in archive" : null,
    error_code: processed === 0 ? "ZIP_EMPTY" : null,
    error_explanation: processed === 0 ? "The ZIP contained no PDF, image, text, CSV, or XLSX files." : null,
    error_suggestion: processed === 0 ? "Add supported files and re-upload." : null,
  });
  return { totalChunks, processed };
}

async function ingestApprovedChildren(parentId: string): Promise<{ totalChunks: number; processed: number }> {
  const { data: children } = await admin.from("global_rag_sources").select("*").eq("parent_zip_id", parentId);
  let totalChunks = 0, processed = 0;
  for (const child of children ?? []) {
    if (child.review_status && child.review_status !== "approved") continue;
    try {
      const dl = await admin.storage.from(BUCKET).download(child.storage_path);
      if (dl.error || !dl.data) throw new Error(`download: ${dl.error?.message}`);
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const mime = dl.data.type || (isPdf(child.name) ? "application/pdf" : isImage(child.name) ? "image/png" : "text/plain");
      totalChunks += await ingestSingle(child.id, bytes, mime);
      processed += 1;
    } catch (e: any) {
      console.error("approved child failed", child.name, e?.message);
      const fp = await buildFailurePatch(String(e?.message ?? e), child.name);
      await admin.from("global_rag_sources").update(fp).eq("id", child.id);
    }
  }
  await setStatus(parentId, { status: "ready", chunk_count: totalChunks, page_count: processed, review_status: "approved", error: processed === 0 ? "No approved files to ingest" : null });
  return { totalChunks, processed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "super_admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { source_id, approved } = await req.json();
    if (!source_id) return new Response(JSON.stringify({ error: "source_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: source } = await admin.from("global_rag_sources").select("*").eq("id", source_id).maybeSingle();
    if (!source) return new Response(JSON.stringify({ error: "source not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Approved-children mode: zip parent whose children have been reviewed/approved
    if (approved && (source.source_kind === "zip" || isZip(source.name))) {
      const r = await ingestApprovedChildren(source_id);
      return new Response(JSON.stringify({ ok: true, kind: "approved_zip", ...r }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    console.error("global-rag-ingest error", e);
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

