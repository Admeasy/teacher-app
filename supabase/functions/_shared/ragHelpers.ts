// Shared helpers for RAG ingest functions: CSV/XLSX extraction, error classification, AI summary.
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

export const isCsv = (n: string, m?: string) =>
  /\.csv$/i.test(n) || m === "text/csv" || m === "application/csv";
export const isXlsx = (n: string, m?: string) =>
  /\.(xlsx|xls)$/i.test(n) ||
  m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
  m === "application/vnd.ms-excel";

export function extractCsv(bytes: Uint8Array): { text: string; rows: number } {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  return { text: lines.join("\n"), rows: Math.max(lines.length - 1, 0) };
}

export function extractXlsx(bytes: Uint8Array): { text: string; rows: number } {
  const wb = XLSX.read(bytes, { type: "array" });
  const parts: string[] = [];
  let totalRows = 0;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) continue;
    totalRows += Math.max(lines.length - 1, 0);
    parts.push(`# Sheet: ${sheetName}\n${lines.join("\n")}`);
  }
  return { text: parts.join("\n\n"), rows: totalRows };
}

/** Static error rule table — keep small + high signal. */
const ERROR_RULES: Array<{
  match: RegExp;
  code: string;
  explanation: string;
  suggestion: string;
}> = [
  {
    match: /Embedding API 401|LOVABLE_API_KEY|unauthor/i,
    code: "EMBED_AUTH",
    explanation: "Embedding gateway rejected the request (401). The Lovable AI key is missing, expired, or revoked.",
    suggestion: "Open Lovable Cloud → Secrets and verify LOVABLE_API_KEY is set. Re-issue if rotated, then re-index.",
  },
  {
    match: /Embedding API 402|payment required|credits/i,
    code: "EMBED_NO_CREDITS",
    explanation: "Lovable AI workspace is out of embedding credits.",
    suggestion: "Add credits at Lovable workspace → Usage, then click Re-index.",
  },
  {
    match: /Embedding API 429|rate limit/i,
    code: "EMBED_RATE_LIMIT",
    explanation: "Embedding gateway throttled the request (429). Too many chunks embedded in a short window.",
    suggestion: "Wait 30–60 seconds and re-index. If recurring, split the file or upload during off-peak.",
  },
  {
    match: /Embedding API 5\d\d|fetch failed|ENOTFOUND|ECONNRESET/i,
    code: "EMBED_UPSTREAM",
    explanation: "Embedding provider (OpenAI via Lovable gateway) returned a 5xx or network error.",
    suggestion: "Transient outage. Retry with Re-index in 1–2 minutes.",
  },
  {
    match: /Vision OCR 401|OPENROUTER_API_KEY/i,
    code: "OCR_AUTH",
    explanation: "OpenRouter rejected the OCR request (401). The OPENROUTER_API_KEY secret is missing or invalid.",
    suggestion: "Set or rotate OPENROUTER_API_KEY in Lovable Cloud → Secrets and re-index.",
  },
  {
    match: /Vision OCR 429/i,
    code: "OCR_RATE_LIMIT",
    explanation: "OpenRouter rate-limited the OCR vision call.",
    suggestion: "Wait a minute and retry. Consider compressing or splitting very large image batches.",
  },
  {
    match: /Vision OCR 5\d\d/i,
    code: "OCR_UPSTREAM",
    explanation: "OpenRouter vision endpoint returned a 5xx.",
    suggestion: "Retry shortly. If persistent, change page format (e.g. convert PDF to text).",
  },
  {
    match: /No text extracted|Chunking produced no text|No chunks produced/i,
    code: "EMPTY_TEXT",
    explanation: "The file was readable but contained no extractable text — likely a scanned PDF with no OCR layer, a photo of a blank page, or a corrupt file.",
    suggestion: "If it's a scanned book, run OCR before upload, or split into image pages so vision OCR runs per page.",
  },
  {
    match: /pdf|PDF|getDocument/i,
    code: "PDF_PARSE",
    explanation: "pdf-parse failed to read the PDF. The file may be encrypted, corrupted, or use an unsupported PDF feature.",
    suggestion: "Open the PDF locally, re-save as 'Reduced Size' or 'PDF/A', then re-upload. Remove password protection.",
  },
  {
    match: /JSZip|zip|ZIP|invalid signature/i,
    code: "ZIP_PARSE",
    explanation: "ZIP archive could not be unpacked — corrupt, password-protected, or not a true ZIP.",
    suggestion: "Re-create the ZIP without password using your OS's built-in compressor, then re-upload.",
  },
  {
    match: /No supported files/i,
    code: "ZIP_EMPTY",
    explanation: "The ZIP contained no PDF, image, text, CSV, or XLSX files we know how to ingest.",
    suggestion: "Add supported files (PDF / PNG / JPG / TXT / MD / CSV / XLSX) and re-upload.",
  },
  {
    match: /xlsx|XLSX|sheet/i,
    code: "XLSX_PARSE",
    explanation: "Excel file could not be parsed. The workbook may be password-protected or use an unsupported format.",
    suggestion: "Open in Excel/Numbers and 'Save As' .xlsx, then re-upload.",
  },
  {
    match: /Insert chunks|duplicate key|violates/i,
    code: "DB_INSERT",
    explanation: "Database rejected chunk insertion — usually a vector dimension mismatch or RLS denial.",
    suggestion: "Check that the embedding column dimension matches the model output (1536 for text-embedding-3-small). Re-index after fixing.",
  },
  {
    match: /Download failed|storage|bucket/i,
    code: "STORAGE_DOWNLOAD",
    explanation: "File could not be downloaded from storage. Bucket may be misconfigured or file was deleted.",
    suggestion: "Re-upload the file. If recurring, check Lovable Cloud → Storage for the bucket.",
  },
];

export function classifyError(raw: string): {
  code: string;
  explanation: string;
  suggestion: string;
} {
  for (const r of ERROR_RULES) {
    if (r.match.test(raw)) return { code: r.code, explanation: r.explanation, suggestion: r.suggestion };
  }
  return { code: "UNKNOWN", explanation: "", suggestion: "" };
}

/** Ask Gemini to explain unknown errors. Best-effort, never throws. */
export async function aiExplainError(raw: string, filename: string): Promise<{
  explanation: string;
  suggestion: string;
}> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `A knowledge-base file ingest failed. Return strict JSON: {"explanation": "<2 sentences in plain English, no jargon>", "suggestion": "<1 actionable fix step>"}.\n\nFILE: ${filename}\nERROR: ${raw.slice(0, 1500)}`,
        }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return { explanation: "", suggestion: "" };
    const j = await res.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return {
      explanation: String(parsed.explanation ?? "").slice(0, 500),
      suggestion: String(parsed.suggestion ?? "").slice(0, 500),
    };
  } catch {
    return { explanation: "", suggestion: "" };
  }
}

/** Generate a 2-3 sentence summary of the indexed content. Best-effort, never throws. */
export async function aiSummary(text: string, filename: string): Promise<string> {
  try {
    const sample = text.slice(0, 6000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `Summarise this academic / school document in 2-3 sentences. State what it is, the key topics, and who it's for. No preamble.\n\nFILE: ${filename}\n\n${sample}`,
        }],
      }),
    });
    if (!res.ok) return "";
    const j = await res.json();
    return String(j.choices?.[0]?.message?.content ?? "").trim().slice(0, 600);
  } catch {
    return "";
  }
}

export async function buildFailurePatch(rawError: string, filename: string) {
  const cls = classifyError(rawError);
  if (cls.code !== "UNKNOWN") {
    return {
      status: "failed",
      error: rawError.slice(0, 1000),
      error_code: cls.code,
      error_explanation: cls.explanation,
      error_suggestion: cls.suggestion,
    };
  }
  const ai = await aiExplainError(rawError, filename);
  return {
    status: "failed",
    error: rawError.slice(0, 1000),
    error_code: "UNKNOWN",
    error_explanation: ai.explanation || "Unclassified error. See raw message.",
    error_suggestion: ai.suggestion || "Click Re-index. If it persists, copy the raw error and share with support.",
  };
}
