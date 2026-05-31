// Snapshot workspace DB tables (students, teachers, timetable, fees, attendance) into vector chunks
// so AI can semantically retrieve them. Live attendance/fees figures stay injected fresh in `command`
// — this sync provides searchable historical / context layer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const BATCH = 64;

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

function describeStudent(s: any): string {
  return [
    `Student ${s.name ?? s.student_id} (id=${s.student_id ?? ""}, class ${s.class ?? "?"}-${s.section ?? "?"}, roll ${s.roll_number ?? ""}).`,
    s.parent_name ? `Parent: ${s.parent_name} (${s.parent_phone ?? "no phone"}, ${s.parent_email ?? "no email"}).` : "",
    `Attendance: ${s.attendance_pct ?? "?"}%. Fees: total ${s.total_fees ?? 0}, paid ${s.paid ?? 0}, due ${s.due ?? 0}, status ${s.fee_status ?? "?"}.`,
    s.interests ? `Interests: ${s.interests}.` : "",
  ].filter(Boolean).join(" ");
}
function describeTeacher(t: any): string {
  return `Teacher ${t.name ?? t.teacher_id} (id=${t.teacher_id ?? ""}). Subject: ${t.subject ?? "—"}. Classes: ${t.assigned_classes ?? "—"}. Contact: ${t.phone ?? ""} ${t.email ?? ""}.`;
}
function describeTimetable(rows: any[]): string[] {
  const byDay: Record<string, any[]> = {};
  for (const r of rows) (byDay[r.day] ??= []).push(r);
  return Object.entries(byDay).map(([day, list]) => {
    const lines = list
      .sort((a, b) => (a.class || "").localeCompare(b.class || "") || (a.section || "").localeCompare(b.section || "") || a.period_number - b.period_number)
      .map((r) => `Class ${r.class}-${r.section} P${r.period_number}: ${r.subject ?? "—"} by ${r.teacher_name ?? "—"}`).join("\n");
    return `Timetable for ${day}:\n${lines}`;
  });
}

async function rebuildSyntheticSource(workspaceId: string, sourceType: string, name: string, texts: string[]) {
  // Remove old synthetic source + chunks for this kind
  const { data: olds } = await admin.from("workspace_rag_sources").select("id").eq("workspace_id", workspaceId).eq("source_kind", "synthetic").eq("source_type", sourceType);
  if (olds?.length) {
    const ids = olds.map((o: any) => o.id);
    await admin.from("workspace_rag_chunks").delete().in("source_id", ids);
    await admin.from("workspace_rag_sources").delete().in("id", ids);
  }
  if (!texts.length) return 0;

  const { data: src, error } = await admin.from("workspace_rag_sources").insert({
    workspace_id: workspaceId,
    name,
    source_type: sourceType,
    source_kind: "synthetic",
    status: "processing",
    chunk_count: 0,
  }).select("id").single();
  if (error || !src) throw new Error(`Create synthetic source: ${error?.message}`);

  let inserted = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vectors = await embed(slice);
    const rows = slice.map((content, j) => ({
      workspace_id: workspaceId,
      source_id: src.id,
      source_name: name,
      source_type: sourceType,
      chunk_index: i + j,
      content,
      embedding: vectors[j] as any,
      metadata: { synthetic: true, generated_at: new Date().toISOString() },
    }));
    const { error: insErr } = await admin.from("workspace_rag_chunks").insert(rows);
    if (insErr) throw new Error(`Insert: ${insErr.message}`);
    inserted += rows.length;
  }
  await admin.from("workspace_rag_sources").update({ status: "ready", chunk_count: inserted }).eq("id", src.id);
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { workspace_id } = await req.json();
    if (!workspace_id) return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Verify membership via RLS
    const { data: mem } = await userClient.from("workspaces").select("id").eq("id", workspace_id).maybeSingle();
    if (!mem) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [students, teachers, timetable, fees, attendance] = await Promise.all([
      admin.from("students").select("*").eq("workspace_id", workspace_id).limit(2000),
      admin.from("teachers").select("*").eq("workspace_id", workspace_id).limit(500),
      admin.from("timetable").select("class,section,day,period_number,subject,teacher_name").eq("workspace_id", workspace_id).limit(5000),
      admin.from("fee_reminders").select("*").eq("workspace_id", workspace_id).limit(2000),
      admin.from("attendance_alerts").select("*").eq("workspace_id", workspace_id).limit(2000),
    ]);

    const results: Record<string, number> = {};
    results.students  = await rebuildSyntheticSource(workspace_id, "students",  "Students roster",      (students.data ?? []).map(describeStudent));
    results.teachers  = await rebuildSyntheticSource(workspace_id, "teachers",  "Teachers roster",      (teachers.data ?? []).map(describeTeacher));
    results.timetable = await rebuildSyntheticSource(workspace_id, "timetable", "Weekly timetable",     describeTimetable(timetable.data ?? []));
    results.fees      = await rebuildSyntheticSource(workspace_id, "fees",      "Fee reminders log",    (fees.data ?? []).map((f: any) => `Fee: ${f.student_name} (${f.student_id}) class ${f.section}, due ${f.amount_due}, status ${f.fee_status}, parent ${f.parent_name} ${f.parent_phone}`));
    results.attendance= await rebuildSyntheticSource(workspace_id, "attendance","Attendance alerts log",(attendance.data ?? []).map((a: any) => `Attendance alert: ${a.student_name} (${a.student_id}) section ${a.section}, ${a.attendance_pct}% — risk ${a.risk_level}, parent ${a.parent_name} ${a.parent_phone}`));

    return new Response(JSON.stringify({ ok: true, indexed: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("workspace-rag-sync error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
