import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

export const importSupabase = supabase;

const num = (v: any) => {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
};
const str = (v: any) => (v == null ? null : String(v).trim() || null);

const NUMERIC_FIELDS = new Set([
  "attendance_pct", "total_fees", "paid", "due", "amount_due",
]);

const STUDENT_FIELDS = [
  "student_id","name","class","section","student_email","parent_name",
  "parent_email","parent_phone","attendance_pct","total_fees","paid","due",
  "fee_status","interests",
];
const TEACHER_FIELDS = ["teacher_id","name","subject","email","phone","assigned_classes"];
const MENTOR_FIELDS = ["mentor_id","name","institution","program","college","expertise_tags","available_for","contact_email"];
const FEE_FIELDS = ["student_id","student_name","section","parent_name","parent_email","parent_phone","amount_due","fee_status","channels"];
const ATTENDANCE_FIELDS = ["student_id","student_name","section","attendance_pct","parent_name","parent_email","parent_phone","risk_level"];
const MATCH_FIELDS = ["student_id","student_name","section","student_interests","mentor_id","mentor_name","mentor_institution","mentor_tags"];

export interface SchemaInference {
  entity: string;
  mappings: Record<string, string>; // raw_header -> canonical_field
  confidence: number;
  source: "memory" | "ai" | "fallback";
  inferred_class?: string | null;
  inferred_section?: string | null;
}

export interface ImportOverrides {
  forced_class?: string | null;
  forced_section?: string | null;
}

/** Extract class + section from a tab/sheet name like "Class 6A", "Grade 7 B", "Nursery". */
export function extractClassSectionFromName(name: string): { cls: string | null; section: string | null } {
  const ctx = String(name ?? "");
  let cls: string | null = null;
  let section: string | null = null;
  const cm = ctx.match(/(nursery|prep|lkg|ukg|kg|\d{1,2})/i);
  if (cm) {
    const v = cm[1].toLowerCase();
    cls = /^\d+$/.test(v) ? v : v.toUpperCase();
  }
  const sm = ctx.match(/(?:^|[^A-Za-z])([A-E])(?:\s|$)/i) || ctx.match(/([A-E])$/i);
  if (sm) section = sm[1].toUpperCase();
  return { cls, section };
}

export interface SheetDebug {
  sheetName: string;
  entity: string;
  headerRowIndex: number;        // 0-based row index where headers were found
  rawHeaders: string[];
  flattenedHeaders: string[];    // after multi-row merge
  mappings: Record<string, string>;
  unmappedHeaders: string[];
  missingCriticalFields: string[];
  suggestions: string[];         // "Rename 'Roll #' to 'student_id'"
  sampleRows: Record<string, any>[]; // first 3 mapped rows
  rowCount: number;
}

export interface ParsedData {
  students: any[];
  teachers: any[];
  mentors: any[];
  fee_reminders: any[];
  attendance_alerts: any[];
  mentor_matches: any[];
  summary: Record<string, string | null> | null;
  fileName: string;
  schemaInference: Record<string, SchemaInference>;
  debug: SheetDebug[];
}

/* ────────── AI / memory mapping ────────── */

async function loadMemoryMappings(
  workspaceId: string,
  headers: string[],
): Promise<Record<string, { canonical: string; entity: string; confidence: number }>> {
  const { data } = await supabase
    .from("canonical_schema_memory" as any)
    .select("source_header, canonical_field, entity_type, confidence")
    .eq("workspace_id", workspaceId)
    .in("source_header", headers);
  const out: Record<string, any> = {};
  (data ?? []).forEach((r: any) => {
    if (r.confidence > 0.85) {
      out[r.source_header] = { canonical: r.canonical_field, entity: r.entity_type, confidence: r.confidence };
    }
  });
  return out;
}

async function persistMappings(
  workspaceId: string,
  inference: SchemaInference,
) {
  if (inference.source !== "ai") return;
  const rows = Object.entries(inference.mappings).map(([source_header, canonical_field]) => ({
    workspace_id: workspaceId,
    source_header,
    canonical_field,
    entity_type: inference.entity,
    confidence: inference.confidence,
    last_seen_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  // upsert; bump seen_count on conflict via two-step (rpc-free)
  for (const row of rows) {
    const { data: existing } = await supabase
      .from("canonical_schema_memory" as any)
      .select("id, seen_count")
      .eq("workspace_id", row.workspace_id)
      .eq("source_header", row.source_header)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("canonical_schema_memory" as any)
        .update({
          canonical_field: row.canonical_field,
          entity_type: row.entity_type,
          confidence: row.confidence,
          seen_count: ((existing as any).seen_count ?? 1) + 1,
          last_seen_at: row.last_seen_at,
        })
        .eq("id", (existing as any).id);
    } else {
      await supabase.from("canonical_schema_memory" as any).insert(row);
    }
  }
}

async function aiInferMappings(headers: string[], sheetName: string, workspaceId: string): Promise<SchemaInference | null> {
  try {
    const { data, error } = await supabase.functions.invoke("infer-schema", {
      body: { headers, sheetName, tab_name_context: sheetName, workspace_id: workspaceId },
    });
    if (error) {
      console.warn("[import] infer-schema error", error);
      return null;
    }
    if (!data || !data.mappings) return null;
    return {
      entity: data.entity ?? "unknown",
      mappings: data.mappings ?? {},
      confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
      source: "ai",
      inferred_class: data.inferred_class ?? null,
      inferred_section: data.inferred_section ?? null,
    };
  } catch (e) {
    console.warn("[import] AI inference failed", e);
    return null;
  }
}

/* hardcoded fallback (legacy logic) */
function fallbackInfer(headers: string[], sheetName: string): SchemaInference {
  const lower = sheetName.toLowerCase();
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tryMap = (candidates: Record<string, string[]>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const n = norm(h);
      for (const [canon, alts] of Object.entries(candidates)) {
        if (alts.some(a => n === norm(a) || n.includes(norm(a)))) {
          if (!Object.values(out).includes(canon)) out[h] = canon;
          break;
        }
      }
    }
    return out;
  };

  if (lower.includes("student")) {
    return {
      entity: "student", confidence: 0.6, source: "fallback",
      mappings: tryMap({
        student_id: ["student id","studentid","gr no","grno","roll no","rollno","sno","sl no","admission no"],
        name: ["name","student name","full name"],
        class: ["class","grade","standard"],
        section: ["section"],
        student_email: ["student email","email"],
        parent_name: ["parent name","father name","guardian"],
        parent_email: ["parent email","father email","guardian email"],
        parent_phone: ["parent phone","phone","mobile","contact"],
        attendance_pct: ["attendance","attendance %","attendance pct"],
        total_fees: ["total fees","fees"],
        paid: ["paid"],
        due: ["due","balance"],
        fee_status: ["fee status","status"],
        interests: ["interests","hobbies"],
      }),
    };
  }
  if (lower.includes("teacher")) {
    return {
      entity: "teacher", confidence: 0.6, source: "fallback",
      mappings: tryMap({
        teacher_id: ["teacher id","emp id","employee id"],
        name: ["name","teacher name"],
        subject: ["subject"],
        email: ["email"],
        phone: ["phone","mobile","contact"],
        assigned_classes: ["assigned classes","classes"],
      }),
    };
  }
  if (lower.includes("mentor") && !lower.includes("match")) {
    return {
      entity: "mentor", confidence: 0.6, source: "fallback",
      mappings: tryMap({
        mentor_id: ["mentor id"],
        name: ["name"],
        institution: ["institution"],
        program: ["program"],
        college: ["college"],
        expertise_tags: ["expertise tags","tags","expertise"],
        available_for: ["available for"],
        contact_email: ["contact email","email"],
      }),
    };
  }
  if (lower.includes("fee") || lower.includes("reminder")) {
    return {
      entity: "fee", confidence: 0.6, source: "fallback",
      mappings: tryMap({
        student_id: ["student id","studentid","gr no","grno","roll no","admission no"],
        student_name: ["student name","name","full name"],
        section: ["section","class","grade"],
        parent_name: ["parent name","father name","guardian"],
        parent_email: ["parent email","email"],
        parent_phone: ["parent phone","phone","mobile","contact"],
        amount_due: ["amount due","due","balance","outstanding","pending"],
        fee_status: ["fee status","status","payment status"],
        channels: ["channels","channel","contact channel"],
      }),
    };
  }
  if (lower.includes("attendance") || lower.includes("alert")) {
    return {
      entity: "attendance", confidence: 0.6, source: "fallback",
      mappings: tryMap({
        student_id: ["student id","studentid","gr no","grno","roll no","admission no"],
        student_name: ["student name","name","full name"],
        section: ["section","class","grade"],
        attendance_pct: ["attendance","attendance %","attendance pct","present pct","present %"],
        parent_name: ["parent name","father name","guardian"],
        parent_email: ["parent email","email"],
        parent_phone: ["parent phone","phone","mobile","contact"],
        risk_level: ["risk level","risk","priority","severity"],
      }),
    };
  }
  if (lower.includes("match")) {
    return {
      entity: "match", confidence: 0.6, source: "fallback",
      mappings: tryMap({
        student_id: ["student id","studentid","gr no"],
        student_name: ["student name","student"],
        section: ["section","class","grade"],
        student_interests: ["student interests","interests","hobbies"],
        mentor_id: ["mentor id","mentor"],
        mentor_name: ["mentor name"],
        mentor_institution: ["mentor institution","institution","college"],
        mentor_tags: ["mentor tags","tags","expertise","expertise tags"],
      }),
    };
  }
  return { entity: "unknown", confidence: 0, source: "fallback", mappings: {} };
}

async function inferSchema(
  headers: string[],
  sheetName: string,
  workspaceId: string,
): Promise<SchemaInference> {
  // 1) memory
  const memory = await loadMemoryMappings(workspaceId, headers);
  const memoryHits = Object.keys(memory);
  if (memoryHits.length >= Math.max(3, Math.floor(headers.length * 0.6))) {
    const mappings: Record<string, string> = {};
    let entity = "unknown";
    let conf = 0;
    for (const h of memoryHits) {
      mappings[h] = memory[h].canonical;
      entity = memory[h].entity;
      conf = Math.max(conf, memory[h].confidence);
    }
    return { entity, mappings, confidence: conf, source: "memory" };
  }
  // 2) AI
  const ai = await aiInferMappings(headers, sheetName, workspaceId);
  if (ai && Object.keys(ai.mappings).length > 0) return ai;
  // 3) fallback
  return fallbackInfer(headers, sheetName);
}

/* ────────── header / row utilities ────────── */

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Canonical-field synonym table — used to (a) score header rows and (b)
// fuzzily merge any AI/memory mappings with known aliases.
const SYNONYMS: Record<string, string[]> = {
  student_id: ["studentid","student id","gr no","grno","gr.no","gr#","admission no","admission#","adm no","admno","roll no","rollno","roll#","sno","s.no","sl no","slno","reg no","regno","enrollment","enrollment no","enrolment","student code"],
  name: ["name","full name","student name","candidate name"],
  student_name: ["student name","name of student","name","candidate","pupil","ward name"],
  class: ["class","grade","standard","std","year","level"],
  section: ["section","sec","division","div","stream"],
  student_email: ["student email","email","email id","emailid","mail"],
  parent_name: ["parent name","father name","mother name","guardian","guardian name","parent","father","mother"],
  parent_email: ["parent email","father email","mother email","guardian email","contact email"],
  parent_phone: ["parent phone","father phone","mother phone","phone","mobile","contact","contact no","mobile no","whatsapp","cell"],
  attendance_pct: ["attendance","attendance %","attendance pct","present pct","present %","attendance percent","att%","att pct","attended"],
  total_fees: ["total fees","fees","total fee","fee total","gross fees"],
  paid: ["paid","amount paid","received","collected"],
  due: ["due","balance","outstanding","pending","unpaid"],
  amount_due: ["amount due","due amount","balance due","outstanding","pending amount","fees due","unpaid amount","balance"],
  fee_status: ["fee status","status","payment status","pay status"],
  channels: ["channels","channel","contact channel","preferred channel","via"],
  risk_level: ["risk level","risk","priority","severity","alert level"],
  interests: ["interests","hobbies","aspirations","goals","stream interest"],
  teacher_id: ["teacher id","emp id","employee id","staff id","tid"],
  subject: ["subject","subjects","department","specialization"],
  email: ["email","email id","mail"],
  phone: ["phone","mobile","contact","cell","whatsapp"],
  assigned_classes: ["assigned classes","classes","class taught","classes handled"],
  mentor_id: ["mentor id","mid"],
  institution: ["institution","mentor institution","alma mater"],
  program: ["program","programme","course"],
  college: ["college","university"],
  expertise_tags: ["expertise tags","tags","expertise","specialty","skills"],
  available_for: ["available for","available","slots"],
  contact_email: ["contact email","email","mentor email"],
  mentor_name: ["mentor name","mentor"],
  mentor_institution: ["mentor institution","institution","college"],
  mentor_tags: ["mentor tags","tags","expertise tags","expertise"],
  student_interests: ["student interests","interests","aspirations","hobbies"],
};
const NORM_SYN: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(SYNONYMS).map(([k, v]) => [k, new Set(v.map(norm))])
);

const CRITICAL_BY_ENTITY: Record<string, string[]> = {
  student: ["student_id", "name"],
  teacher: ["teacher_id", "name"],
  mentor: ["mentor_id", "name"],
  fee: ["student_id", "amount_due"],
  attendance: ["student_id", "attendance_pct"],
  match: ["student_id", "mentor_id"],
};

function fuzzyCanonical(rawHeader: string, allowed: string[]): string | null {
  const n = norm(rawHeader);
  if (!n) return null;
  // 1) direct synonym hit
  for (const canon of allowed) {
    const set = NORM_SYN[canon];
    if (set?.has(n)) return canon;
  }
  // 2) substring containment either way
  for (const canon of allowed) {
    const set = NORM_SYN[canon];
    if (!set) continue;
    for (const alt of set) {
      if (alt.length >= 4 && (n.includes(alt) || alt.includes(n))) return canon;
    }
  }
  // 3) canonical-name substring (e.g. raw "studentid" → student_id)
  for (const canon of allowed) {
    const cn = norm(canon);
    if (cn && (n === cn || n.includes(cn) || cn.includes(n))) return canon;
  }
  return null;
}

/** Score a candidate header row: fraction of cells that look like headers. */
function scoreHeaderRow(row: any[], allAllowed: string[]): number {
  const filled = row.filter(c => c != null && String(c).trim() !== "");
  if (filled.length < 2) return 0;
  let canonHits = 0;
  let stringy = 0;
  for (const c of filled) {
    const s = String(c).trim();
    if (typeof c === "string" && !/^-?\d+(\.\d+)?$/.test(s)) stringy++;
    if (fuzzyCanonical(s, allAllowed)) canonHits++;
  }
  return (stringy / filled.length) * 0.4 + (canonHits / Math.max(filled.length, 1)) * 0.6;
}

/** Pick the best header row in the first 15 rows; merge with the next row if
 *  cells are sparsely filled (multi-row headers / merged cells). */
function detectHeaderRow(allRows: any[][], allAllowed: string[]): { idx: number; headers: string[]; raw: string[]; merged: boolean } {
  const limit = Math.min(allRows.length, 15);
  let best = { idx: 0, score: 0 };
  for (let i = 0; i < limit; i++) {
    const s = scoreHeaderRow(allRows[i] ?? [], allAllowed);
    if (s > best.score) best = { idx: i, score: s };
  }
  const idx = best.idx;
  const row = allRows[idx] ?? [];
  // Multi-row merge: if many empty cells, fold next row's text into the gap
  const next = allRows[idx + 1] ?? [];
  const sparse = row.filter(c => c == null || String(c).trim() === "").length;
  let merged: any[] = row;
  let didMerge = false;
  if (sparse > row.length * 0.3 && scoreHeaderRow(next, allAllowed) > 0.2) {
    merged = row.map((c, i) => {
      const a = c == null ? "" : String(c).trim();
      const b = next[i] == null ? "" : String(next[i]).trim();
      return [a, b].filter(Boolean).join(" ").trim();
    });
    didMerge = true;
  }
  // Forward-fill empty header cells from previous filled cell (handles merged/grouped headers)
  let lastSeen = "";
  const flattened = merged.map((c) => {
    const s = c == null ? "" : String(c).trim();
    if (s) { lastSeen = s; return s; }
    return lastSeen;
  });
  const raw = row.map(c => (c == null ? "" : String(c).trim()));
  return { idx, headers: flattened.map(h => h.trim()), raw, merged: didMerge };
}

/** Salvage missing critical values from neighbor cells when alignment is off. */
function neighborSalvage(
  row: Record<string, any>,
  headers: string[],
  rawIndex: Record<string, number>,
  canonical: string,
  rawHeader: string | null,
): any {
  if (rawHeader && row[rawHeader] != null && String(row[rawHeader]).trim() !== "") return row[rawHeader];
  const target = rawHeader ? rawIndex[rawHeader] : -1;
  // Heuristic patterns per canonical field
  const isPhone = /phone|mobile|contact|whatsapp/i.test(canonical);
  const isEmail = /email|mail/i.test(canonical);
  const isPct = canonical === "attendance_pct";
  const isNum = NUMERIC_FIELDS.has(canonical);
  const ok = (v: any) => {
    if (v == null) return false;
    const s = String(v).trim();
    if (!s) return false;
    if (isPhone) return /\d{7,}/.test(s.replace(/\D/g, ""));
    if (isEmail) return /@/.test(s) && /\./.test(s);
    if (isPct) { const n = parseFloat(s); return isFinite(n) && n >= 0 && n <= 100; }
    if (isNum) return isFinite(parseFloat(s.replace(/[^0-9.-]/g, "")));
    return true;
  };
  // Prefer immediate neighbours, then any cell in the row.
  const order = target >= 0
    ? [target - 1, target + 1, target - 2, target + 2, ...headers.map((_, i) => i)]
    : headers.map((_, i) => i);
  for (const i of order) {
    if (i < 0 || i >= headers.length) continue;
    const h = headers[i];
    if (!h || h === rawHeader) continue;
    if (ok(row[h])) return row[h];
  }
  return null;
}

/* ────────── row builder (with neighbor salvage) ────────── */

function buildRow(
  rawRow: Record<string, any>,
  mappings: Record<string, string>,
  workspaceId: string,
  allowedFields: string[],
  headers: string[],
): Record<string, any> {
  const out: Record<string, any> = { workspace_id: workspaceId };
  const reverse: Record<string, string> = {}; // canonical -> rawHeader
  for (const [raw, canon] of Object.entries(mappings)) {
    if (allowedFields.includes(canon)) reverse[canon] = raw;
  }
  const rawIndex: Record<string, number> = {};
  headers.forEach((h, i) => { rawIndex[h] = i; });

  for (const canon of allowedFields) {
    const rawHeader = reverse[canon] ?? null;
    let v = rawHeader ? rawRow[rawHeader] : null;
    if (v == null || String(v).trim() === "") {
      v = neighborSalvage(rawRow, headers, rawIndex, canon, rawHeader);
    }
    out[canon] = NUMERIC_FIELDS.has(canon) ? num(v) : str(v);
  }
  return out;
}

/* ────────── main parse ────────── */

const ENTITY_FIELDS: Record<string, string[]> = {
  student: STUDENT_FIELDS,
  teacher: TEACHER_FIELDS,
  mentor: MENTOR_FIELDS,
  fee: FEE_FIELDS,
  attendance: ATTENDANCE_FIELDS,
  match: MATCH_FIELDS,
};

export async function parseAndImport(file: File, workspaceId: string, overrides: ImportOverrides = {}): Promise<ParsedData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const parsed: ParsedData = {
    students: [], teachers: [], mentors: [],
    fee_reminders: [], attendance_alerts: [], mentor_matches: [],
    summary: null, fileName: file.name, schemaInference: {}, debug: [],
  };

  const ALL_ALLOWED = Array.from(new Set(Object.values(ENTITY_FIELDS).flat()));

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const lower = name.toLowerCase().replace(/\s/g, "");

    if (lower === "summary") {
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      parsed.summary = Object.fromEntries(
        rows.filter(r => r[0] && r[1]).map(r => [str(r[0])!, str(r[1])])
      );
      continue;
    }

    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
    if (!allRows.length) continue;

    // Robust multi-row / merged-cell aware header detection
    const { idx: headerRowIdx, headers: flattened, raw: rawHeaders, merged: didMerge } = detectHeaderRow(allRows, ALL_ALLOWED);
    const headers = flattened.map(h => h || "").map((h, i) => h || rawHeaders[i] || `col_${i + 1}`);
    if (!headers.some(h => h && !/^col_\d+$/.test(h))) continue;

    // Build data rows starting AFTER header. Only skip an "extra" second
    // header row when detectHeaderRow actually performed a multi-row merge —
    // otherwise the first real data row can look header-ish (e.g. it contains
    // values like "Class 11A") and get silently dropped.
    const skipExtra = didMerge &&
      (allRows[headerRowIdx + 1] ?? []).filter(c => c != null && String(c).trim() !== "").length > 0 &&
      scoreHeaderRow(allRows[headerRowIdx + 1] ?? [], ALL_ALLOWED) > 0.4 ? 1 : 0;

    const dataRows: Record<string, any>[] = [];
    for (let i = headerRowIdx + 1 + skipExtra; i < allRows.length; i++) {
      const r = allRows[i] ?? [];
      if (r.every(c => c == null || c === "")) continue;
      const obj: Record<string, any> = {};
      headers.forEach((h, idx2) => { obj[h] = r[idx2]; });
      dataRows.push(obj);
    }

    // Parser diagnostics — fail loud if first data row disappears
    const nonEmptyAfterHeader = allRows
      .slice(headerRowIdx + 1)
      .filter(r => Array.isArray(r) && r.some(c => c != null && String(c).trim() !== "")).length;
    console.log(`[import] sheet="${name}" worksheetRows=${allRows.length} headerRowIdx=${headerRowIdx} mergedHeader=${didMerge} skipExtra=${skipExtra} dataRows=${dataRows.length} expectedAfterHeader=${nonEmptyAfterHeader} firstRow=`, dataRows[0]);
    if (nonEmptyAfterHeader > 0 && dataRows.length < nonEmptyAfterHeader) {
      console.warn(`[import] sheet="${name}" parsed ${dataRows.length} rows but worksheet has ${nonEmptyAfterHeader} non-empty rows after header — possible first-row loss.`);
    }

    // Schema inference (memory → AI → fallback)
    const inference = await inferSchema(headers, name, workspaceId);

    // Route to entity bucket — sheet-name hint wins over inference.
    const entity =
      lower.includes("match") ? "match" :
      lower.includes("fee") ? "fee" :
      lower.includes("attendance") ? "attendance" :
      lower.includes("student") ? "student" :
      lower.includes("teacher") ? "teacher" :
      lower.includes("mentor") ? "mentor" :
      inference.entity;

    const allowed = ENTITY_FIELDS[entity] ?? [];

    // Augment AI/memory mapping with fuzzy synonyms for any unmapped header.
    const mappings: Record<string, string> = { ...inference.mappings };
    for (const h of headers) {
      if (!h || mappings[h]) continue;
      const guess = fuzzyCanonical(h, allowed);
      if (guess && !Object.values(mappings).includes(guess)) mappings[h] = guess;
    }

    parsed.schemaInference[name] = { ...inference, entity, mappings };

    // Build canonical rows
    const built = dataRows.map(r => buildRow(r, mappings, workspaceId, allowed, headers));

    // Auto-tag class/section from tab name when missing on each row.
    // Precedence: forced override (per-import tag) > tab-derived inference > existing row value.
    const fromTab = extractClassSectionFromName(name);
    const tabClass = inference.inferred_class ?? fromTab.cls ?? null;
    const tabSection = inference.inferred_section ?? fromTab.section ?? null;
    const forcedClass = overrides.forced_class ?? null;
    const forcedSection = overrides.forced_section ?? null;
    for (const row of built) {
      if (allowed.includes("class")) {
        if (forcedClass) row.class = forcedClass;
        else if ((row.class == null || row.class === "") && tabClass) row.class = tabClass;
      }
      if (allowed.includes("section")) {
        if (forcedSection) row.section = forcedSection;
        else if ((row.section == null || row.section === "") && tabSection) row.section = tabSection;
      }
    }

    if (entity === "student")        parsed.students          = built.filter(r => r.student_id || r.name);
    else if (entity === "teacher")   parsed.teachers          = built.filter(r => r.teacher_id || r.name);
    else if (entity === "mentor")    parsed.mentors           = built.filter(r => r.mentor_id || r.name);
    else if (entity === "fee")       parsed.fee_reminders     = built.filter(r => r.student_id || r.student_name);
    else if (entity === "attendance") parsed.attendance_alerts = built.filter(r => r.student_id || r.student_name);
    else if (entity === "match")     parsed.mentor_matches    = built.filter(r => r.mentor_id || r.student_id);

    // Debug entry — what was detected, what's mis/un-mapped, suggestions
    const mapped = new Set(Object.keys(mappings));
    const unmapped = headers.filter(h => h && !mapped.has(h) && !/^col_\d+$/.test(h));
    const presentCanon = new Set(Object.values(mappings));
    const critical = CRITICAL_BY_ENTITY[entity] ?? [];
    const missing = critical.filter(c => !presentCanon.has(c));
    const suggestions: string[] = [];
    for (const c of missing) {
      const synonyms = SYNONYMS[c]?.slice(0, 3).join('", "') ?? "";
      suggestions.push(`Sheet "${name}" is missing **${c}** — rename one column to "${c}" (e.g. "${synonyms}")`);
    }
    for (const u of unmapped) {
      const guess = fuzzyCanonical(u, ALL_ALLOWED);
      if (guess && !presentCanon.has(guess)) {
        suggestions.push(`"${u}" looks like **${guess}** — confirm or rename header.`);
      }
    }
    parsed.debug.push({
      sheetName: name,
      entity,
      headerRowIndex: headerRowIdx,
      rawHeaders,
      flattenedHeaders: headers,
      mappings,
      unmappedHeaders: unmapped,
      missingCriticalFields: missing,
      suggestions,
      sampleRows: built.slice(0, 3),
      rowCount: built.length,
    });

    persistMappings(workspaceId, inference).catch(() => {});
  }

  return parsed;
}

/* ────────── commit (reconciliation-based, duplicate-safe) ────────── */

export interface ReconcileResult {
  count: number;          // rows in sheet for this entity
  inserted: number;       // newly created
  updated: number;        // existing rows refreshed
  deactivated: number;    // present before, missing now → is_active=false
  skipped: number;        // rows missing the natural key
  error?: string;
}

const ENTITY_DEFS = {
  students: { table: "students", key: "student_id", conflict: "workspace_id,student_id" },
  teachers: { table: "teachers", key: "teacher_id", conflict: "workspace_id,teacher_id" },
} as const;

async function reconcileEntity(
  workspaceId: string,
  batchId: string | null,
  entity: "students" | "teachers",
  rows: any[],
): Promise<ReconcileResult> {
  const def = ENTITY_DEFS[entity];
  // Normalize natural keys + email so login lookups are always consistent.
  const normalized = rows.map((r) => {
    if (!r) return r;
    const out = { ...r };
    if (entity === "teachers") {
      if (out.teacher_id != null) out.teacher_id = String(out.teacher_id).trim().toUpperCase();
      if (out.email != null) out.email = String(out.email).trim().toLowerCase() || null;
    } else if (entity === "students") {
      if (out.student_id != null) out.student_id = String(out.student_id).trim().toUpperCase();
      if (out.parent_email != null) out.parent_email = String(out.parent_email).trim().toLowerCase() || null;
      if (out.student_email != null) out.student_email = String(out.student_email).trim().toLowerCase() || null;
    }
    return out;
  });
  const stamped = normalized
    .filter((r) => r && r[def.key] && String(r[def.key]).trim() !== "")
    .map((r) => ({
      ...r,
      workspace_id: workspaceId,
      is_active: true,
      last_imported_at: new Date().toISOString(),
      import_batch_id: batchId,
    }));
  const skipped = rows.length - stamped.length;
  if (stamped.length === 0) {
    const reason = `All ${rows.length} rows missing canonical "${def.key}" — fix header mapping in the sheet (rename your ID column to "${def.key}").`;
    return { count: rows.length, inserted: 0, updated: 0, deactivated: 0, skipped, error: rows.length > 0 ? reason : undefined };
  }

  // Pre-fetch existing keys to compute inserted vs updated
  const incomingKeys = Array.from(new Set(stamped.map((r) => String(r[def.key]))));
  const { data: existing } = await importSupabase
    .from(def.table as any)
    .select(def.key)
    .eq("workspace_id", workspaceId)
    .in(def.key, incomingKeys);
  const existingSet = new Set<string>((existing ?? []).map((r: any) => String(r[def.key])));

  // Bulk upsert in chunks (ON CONFLICT preserves identity → no duplicate accounts)
  const CHUNK = 500;
  for (let i = 0; i < stamped.length; i += CHUNK) {
    const { error } = await importSupabase
      .from(def.table as any)
      .upsert(stamped.slice(i, i + CHUNK), { onConflict: def.conflict });
    if (error) {
      return { count: rows.length, inserted: 0, updated: 0, deactivated: 0, skipped, error: error.message };
    }
  }

  const inserted = incomingKeys.filter((k) => !existingSet.has(k)).length;
  const updated = incomingKeys.length - inserted;

  // Deactivate rows missing from the sheet (scoped to affected classes for students).
  let deactivated = 0;
  if (entity === "students") {
    const affectedClasses = Array.from(new Set(stamped.map((r: any) => r.class).filter(Boolean)));
    if (affectedClasses.length) {
      const { data: stale } = await importSupabase
        .from("students")
        .select("id, student_id")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .in("class", affectedClasses);
      const incomingSet = new Set(incomingKeys);
      const staleIds = (stale ?? [])
        .filter((r: any) => r.student_id && !incomingSet.has(String(r.student_id)))
        .map((r: any) => r.id);
      if (staleIds.length) {
        const { error } = await importSupabase.from("students").update({ is_active: false }).in("id", staleIds);
        if (!error) deactivated = staleIds.length;
      }
    }
  } else {
    const { data: stale } = await importSupabase
      .from("teachers")
      .select("id, teacher_id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    const incomingSet = new Set(incomingKeys);
    const staleIds = (stale ?? [])
      .filter((r: any) => r.teacher_id && !incomingSet.has(String(r.teacher_id)))
      .map((r: any) => r.id);
    if (staleIds.length) {
      const { error } = await importSupabase.from("teachers").update({ is_active: false }).in("id", staleIds);
      if (!error) deactivated = staleIds.length;
    }
  }

  return { count: rows.length, inserted, updated, deactivated, skipped };
}

export async function commitAll(parsed: ParsedData): Promise<Record<string, ReconcileResult> & { __batch_id?: string | null }> {
  const workspaceId = (parsed.students[0]?.workspace_id ?? parsed.teachers[0]?.workspace_id) as string | undefined;
  const empty: ReconcileResult = { count: 0, inserted: 0, updated: 0, deactivated: 0, skipped: 0 };
  if (!workspaceId) return { students: empty, teachers: empty };

  const affectedClasses = Array.from(new Set((parsed.students ?? []).map((r: any) => r.class).filter(Boolean)));
  const totalRows = (parsed.students?.length ?? 0) + (parsed.teachers?.length ?? 0);
  const entityType = parsed.students?.length && parsed.teachers?.length ? "mixed"
    : parsed.teachers?.length ? "teachers" : "students";

  const { data: batchRow } = await importSupabase
    .from("import_batches")
    .insert({
      workspace_id: workspaceId,
      entity_type: entityType,
      file_name: parsed.fileName ?? null,
      scope: affectedClasses.length ? { classes: affectedClasses } : null,
      total_rows: totalRows,
      status: "completed",
    })
    .select("id")
    .single();
  const batchId = (batchRow as any)?.id ?? null;

  const results: Record<string, ReconcileResult> = { students: empty, teachers: empty };
  for (const entity of ["students", "teachers"] as const) {
    const rows = (parsed as any)[entity] as any[];
    results[entity] = rows?.length
      ? await reconcileEntity(workspaceId, batchId, entity, rows)
      : empty;
  }

  // Post-import verification: confirm rows really exist in DB (catches silent failures).
  for (const entity of ["students", "teachers"] as const) {
    const r = results[entity];
    if (r.count === 0) continue;
    const def = ENTITY_DEFS[entity];
    const { count: dbCount } = await importSupabase
      .from(def.table as any)
      .select(def.key, { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    (r as any).db_total = dbCount ?? 0;
    if ((dbCount ?? 0) === 0 && r.inserted + r.updated > 0) {
      r.error = `Import reported ${r.inserted + r.updated} rows but DB has 0 — RLS or write blocked.`;
    }
  }

  if (batchId) {
    const sum = (k: keyof ReconcileResult) =>
      Object.values(results).reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const errors = Object.entries(results).filter(([, v]) => v.error);
    await importSupabase.from("import_batches").update({
      created_rows: sum("inserted"),
      updated_rows: sum("updated"),
      deactivated_rows: sum("deactivated"),
      skipped_rows: sum("skipped"),
      failed_rows: errors.length,
      status: errors.length ? "partial" : "completed",
      errors: errors.length ? Object.fromEntries(errors.map(([k, v]) => [k, v.error])) : null,
    }).eq("id", batchId);
  }

  return { ...results, __batch_id: batchId };
}

// ---------- P4: Version detection ----------
// Compare incoming students' roll_numbers/student_ids against existing for this workspace+class.
// Returns overlap ratio + recommendation.
export async function detectStudentVersionOverlap(workspaceId: string, incoming: Array<{ student_id?: string | null; roll_number?: string | null; class?: string | null }>): Promise<{
  totalIncoming: number;
  matchedCount: number;
  overlapPct: number;
  recommendation: "create_v2" | "append" | "first_upload";
  affectedClasses: string[];
}> {
  const classes = Array.from(new Set(incoming.map(s => (s.class ?? "").toString().trim()).filter(Boolean)));
  const ids = incoming.map(s => (s.student_id ?? s.roll_number ?? "").toString().trim()).filter(Boolean);
  if (ids.length === 0) {
    return { totalIncoming: incoming.length, matchedCount: 0, overlapPct: 0, recommendation: "first_upload", affectedClasses: classes };
  }
  let q = importSupabase.from("students").select("student_id, roll_number, class").eq("workspace_id", workspaceId);
  if (classes.length) q = q.in("class", classes);
  const { data } = await q.limit(5000);
  const existing = new Set<string>();
  for (const r of (data ?? []) as any[]) {
    if (r.student_id) existing.add(String(r.student_id).trim());
    if (r.roll_number) existing.add(String(r.roll_number).trim());
  }
  if (existing.size === 0) {
    return { totalIncoming: incoming.length, matchedCount: 0, overlapPct: 0, recommendation: "first_upload", affectedClasses: classes };
  }
  const matched = ids.filter(id => existing.has(id)).length;
  const pct = matched / Math.max(1, ids.length);
  const recommendation: "create_v2" | "append" = pct > 0.7 ? "create_v2" : "append";
  return { totalIncoming: incoming.length, matchedCount: matched, overlapPct: pct, recommendation, affectedClasses: classes };
}
