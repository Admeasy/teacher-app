// Drains workspace_rag_sync_queue in batches. Called by pg_cron.
// Cheap on write path: triggers just enqueue. This worker does the embedding.
// Idempotent per (workspace, entity_type, entity_key).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const EMBED_MODEL = "openai/text-embedding-3-small";
const EMBED_DIMS = 1536;
const BATCH = 64;
const MAX_PER_RUN = 200; // queue rows processed per invocation

async function embed(inputs: string[]): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS }),
  });
  if (!res.ok) throw new Error(`Embed ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.data.map((d: any) => d.embedding as number[]);
}

function descStudent(s: any): string {
  return `Student ${s.name ?? s.student_id} (id=${s.student_id ?? ""}, class ${s.class ?? "?"}-${s.section ?? "?"}, roll ${s.roll_number ?? ""}). ` +
    (s.parent_name ? `Parent: ${s.parent_name} (${s.parent_phone ?? "-"}, ${s.parent_email ?? "-"}). ` : "") +
    `Attendance: ${s.attendance_pct ?? "?"}%. Fees: total ${s.total_fees ?? 0}, paid ${s.paid ?? 0}, due ${s.due ?? 0}, status ${s.fee_status ?? "?"}.` +
    (s.interests ? ` Interests: ${s.interests}.` : "");
}
function descTeacher(t: any): string {
  return `Teacher ${t.name ?? t.teacher_id} (id=${t.teacher_id ?? ""}). Subject: ${t.subject ?? "—"}. Classes: ${t.assigned_classes ?? "—"}. Contact: ${t.phone ?? ""} ${t.email ?? ""}.`;
}
function descAttAlert(a: any): string {
  return `Attendance alert: ${a.student_name} (${a.student_id}) ${a.section ?? ""}, ${a.attendance_pct}% — risk ${a.risk_level}. Parent ${a.parent_name ?? ""} ${a.parent_phone ?? ""}.`;
}
function descFee(f: any): string {
  return `Fee: ${f.student_name} (${f.student_id}) ${f.section ?? ""}, due ${f.amount_due}, status ${f.fee_status}. Parent ${f.parent_name ?? ""} ${f.parent_phone ?? ""}.`;
}
function descTimetable(rows: any[]): string[] {
  const byDay: Record<string, any[]> = {};
  for (const r of rows) (byDay[r.day] ??= []).push(r);
  return Object.entries(byDay).map(([day, list]) => {
    const lines = list.sort((a, b) =>
      (a.class || "").localeCompare(b.class || "") ||
      (a.section || "").localeCompare(b.section || "") ||
      a.period_number - b.period_number
    ).map((r) => `Class ${r.class}-${r.section} P${r.period_number}: ${r.subject ?? "—"} by ${r.teacher_name ?? "—"}`).join("\n");
    return `Timetable for ${day}:\n${lines}`;
  });
}
function descClassSubjects(rows: any[]): string[] {
  const byClass: Record<string, any[]> = {};
  for (const r of rows) (byClass[`${r.class}${r.stream ? "/" + r.stream : ""}`] ??= []).push(r);
  return Object.entries(byClass).map(([k, list]) =>
    `Subjects for class ${k}:\n` + list.map((r) =>
      `- ${r.subject} (${r.kind}, ${r.periods_per_week}/wk, teacher: ${r.teacher_name ?? "—"})`
    ).join("\n")
  );
}
function descTimetableSettings(s: any): string {
  if (!s) return "";
  return `Timetable settings: ${s.periods_per_day} periods/day of ${s.period_duration}min, start ${s.start_time}, working days ${(s.working_days ?? []).join(",")}, short break after P${s.short_break_after} (${s.short_break_duration}m), lunch after P${s.lunch_break_after} (${s.lunch_break_duration}m).`;
}

async function ensureSource(workspaceId: string, sourceType: string, name: string): Promise<string> {
  const { data: existing } = await admin
    .from("workspace_rag_sources").select("id")
    .eq("workspace_id", workspaceId).eq("source_type", sourceType).eq("source_kind", "synthetic")
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await admin.from("workspace_rag_sources").insert({
    workspace_id: workspaceId, name, source_type: sourceType, source_kind: "synthetic",
    status: "ready", chunk_count: 0,
  }).select("id").single();
  if (error) throw new Error(`ensureSource: ${error.message}`);
  return data.id;
}

// Per-entity upsert: one chunk per entity_key (idempotent via delete-then-insert by metadata.entity_key)
async function upsertEntityChunk(workspaceId: string, sourceType: string, name: string, entityKey: string, text: string) {
  const sourceId = await ensureSource(workspaceId, sourceType, name);
  await admin.from("workspace_rag_chunks").delete()
    .eq("workspace_id", workspaceId).eq("source_id", sourceId)
    .eq("metadata->>entity_key", entityKey);
  if (!text.trim()) return;
  const [vec] = await embed([text]);
  await admin.from("workspace_rag_chunks").insert({
    workspace_id: workspaceId, source_id: sourceId, source_name: name, source_type: sourceType,
    chunk_index: 0, content: text, embedding: vec as any,
    metadata: { synthetic: true, entity_key: entityKey, updated_at: new Date().toISOString() },
  });
}
async function deleteEntityChunk(workspaceId: string, sourceType: string, entityKey: string) {
  const { data: src } = await admin.from("workspace_rag_sources").select("id")
    .eq("workspace_id", workspaceId).eq("source_type", sourceType).eq("source_kind", "synthetic").maybeSingle();
  if (!src) return;
  await admin.from("workspace_rag_chunks").delete()
    .eq("workspace_id", workspaceId).eq("source_id", src.id)
    .eq("metadata->>entity_key", entityKey);
}

// Snapshot rebuild: drop all chunks for that source_type and re-embed from current DB
async function rebuildSnapshot(workspaceId: string, sourceType: string, name: string, texts: string[]) {
  const sourceId = await ensureSource(workspaceId, sourceType, name);
  await admin.from("workspace_rag_chunks").delete()
    .eq("workspace_id", workspaceId).eq("source_id", sourceId);
  if (!texts.length) return 0;
  let inserted = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vectors = await embed(slice);
    const rows = slice.map((content, j) => ({
      workspace_id: workspaceId, source_id: sourceId, source_name: name, source_type: sourceType,
      chunk_index: i + j, content, embedding: vectors[j] as any,
      metadata: { synthetic: true, generated_at: new Date().toISOString() },
    }));
    const { error } = await admin.from("workspace_rag_chunks").insert(rows);
    if (error) throw new Error(`snapshot insert: ${error.message}`);
    inserted += rows.length;
  }
  await admin.from("workspace_rag_sources").update({ status: "ready", chunk_count: inserted }).eq("id", sourceId);
  return inserted;
}

async function processGroup(workspaceId: string, entityType: string, items: any[]): Promise<void> {
  // Snapshot types: any pending row triggers full rebuild
  const SNAPSHOT = new Set(["timetable", "class_subjects", "timetable_settings"]);
  if (SNAPSHOT.has(entityType)) {
    if (entityType === "timetable") {
      const { data } = await admin.from("timetable").select("class,section,day,period_number,subject,teacher_name").eq("workspace_id", workspaceId).limit(5000);
      await rebuildSnapshot(workspaceId, "timetable", "Weekly timetable", descTimetable(data ?? []));
    } else if (entityType === "class_subjects") {
      const { data } = await admin.from("class_subjects").select("*").eq("workspace_id", workspaceId).limit(2000);
      await rebuildSnapshot(workspaceId, "class_subjects", "Class subjects map", descClassSubjects(data ?? []));
    } else if (entityType === "timetable_settings") {
      const { data } = await admin.from("timetable_settings").select("*").eq("workspace_id", workspaceId).eq("is_active", true).maybeSingle();
      const txt = descTimetableSettings(data);
      await rebuildSnapshot(workspaceId, "timetable_settings", "Timetable settings", txt ? [txt] : []);
    }
    return;
  }

  // Per-entity types — fetch all referenced ids in one go
  const ids = items.map((q) => q.entity_key).filter(Boolean);
  const ops: Record<string, string> = Object.fromEntries(items.map((q) => [q.entity_key, q.op]));
  const upsertIds = ids.filter((id) => ops[id] !== "delete");
  const deleteIds = ids.filter((id) => ops[id] === "delete");

  if (entityType === "students") {
    const { data } = await admin.from("students").select("*").in("id", upsertIds.length ? upsertIds : ["00000000-0000-0000-0000-000000000000"]);
    for (const s of data ?? []) await upsertEntityChunk(workspaceId, "students", "Students roster", s.id, descStudent(s));
    for (const id of deleteIds) await deleteEntityChunk(workspaceId, "students", id);
  } else if (entityType === "teachers") {
    const { data } = await admin.from("teachers").select("*").in("id", upsertIds.length ? upsertIds : ["00000000-0000-0000-0000-000000000000"]);
    for (const t of data ?? []) await upsertEntityChunk(workspaceId, "teachers", "Teachers roster", t.id, descTeacher(t));
    for (const id of deleteIds) await deleteEntityChunk(workspaceId, "teachers", id);
  } else if (entityType === "attendance_alerts") {
    const { data } = await admin.from("attendance_alerts").select("*").in("id", upsertIds.length ? upsertIds : ["00000000-0000-0000-0000-000000000000"]);
    for (const a of data ?? []) await upsertEntityChunk(workspaceId, "attendance", "Attendance alerts log", a.id, descAttAlert(a));
    for (const id of deleteIds) await deleteEntityChunk(workspaceId, "attendance", id);
  } else if (entityType === "fee_reminders") {
    const { data } = await admin.from("fee_reminders").select("*").in("id", upsertIds.length ? upsertIds : ["00000000-0000-0000-0000-000000000000"]);
    for (const f of data ?? []) await upsertEntityChunk(workspaceId, "fees", "Fee reminders log", f.id, descFee(f));
    for (const id of deleteIds) await deleteEntityChunk(workspaceId, "fees", id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Claim a batch of pending rows
    const { data: pending, error } = await admin
      .from("workspace_rag_sync_queue").select("*")
      .is("processed_at", null)
      .order("enqueued_at", { ascending: true })
      .limit(MAX_PER_RUN);
    if (error) throw new Error(`fetch queue: ${error.message}`);
    if (!pending?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Group by workspace + entity_type
    const groups: Record<string, any[]> = {};
    for (const row of pending) {
      const k = `${row.workspace_id}::${row.entity_type}`;
      (groups[k] ??= []).push(row);
    }

    const failedIds: number[] = [];
    const successIds: number[] = [];
    for (const [k, items] of Object.entries(groups)) {
      const [ws, et] = k.split("::");
      try {
        await processGroup(ws, et, items);
        successIds.push(...items.map((i) => i.id));
      } catch (e: any) {
        console.error("group failed", k, e?.message);
        failedIds.push(...items.map((i) => i.id));
        await admin.from("workspace_rag_sync_queue")
          .update({ attempts: items[0].attempts + 1, error: String(e?.message ?? e).slice(0, 500) })
          .in("id", items.map((i) => i.id));
      }
    }

    if (successIds.length) {
      await admin.from("workspace_rag_sync_queue")
        .update({ processed_at: new Date().toISOString(), error: null })
        .in("id", successIds);
    }

    return new Response(JSON.stringify({ ok: true, processed: successIds.length, failed: failedIds.length, total_queued: pending.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("workspace-rag-worker error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
