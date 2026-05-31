import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { EXT_SUPABASE_ANON, EXT_SUPABASE_URL } from "./extFn";

const BASE = `${EXT_SUPABASE_URL}/functions/v1/timetable-ai`;
const ANON = EXT_SUPABASE_ANON;

export interface PeriodSlot {
  period: number;
  subject: string;
  teacher: string;
  time_start?: string;
  time_end?: string;
}
export type WeekTimetable = Record<string, PeriodSlot[]>;

async function call(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `timetable-ai ${res.status}`);
    return data;
  }
  if (!res.ok) throw new Error(`timetable-ai ${res.status}`);
  return res;
}

const SUBJECT_COLORS = [
  "#7c3aed", "#2563eb", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#db2777", "#9333ea", "#0d9488", "#ca8a04",
];

export function getSubjectColor(subject: string): string {
  const s = (subject || "Free").trim().toLowerCase();
  if (s === "free" || s === "break" || s === "lunch") return "#64748b";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length];
}

export function isTimetableGenerateIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(generate|create|build|make)\b/.test(t) && /\btimetable\b/.test(t);
}

/** Parse "class 12 B" / "class 12-B" from natural language. */
export function parseTimetableCommand(text: string): { class: string; section: string } | null {
  const m = text.match(/\bclass\s+(\d{1,2})\s*[- ]?\s*([A-Za-z0-9]+)/i);
  if (!m) return null;
  return { class: m[1], section: m[2].toUpperCase() };
}

export async function generateTimetable(opts: {
  workspace_id: string;
  class: string;
  section: string;
  stream?: string;
  constraints?: string;
}): Promise<any> {
  return call({ mode: "generate", ...opts });
}

export async function saveTimetable(opts: {
  workspace_id: string;
  class: string;
  section: string;
  timetable: WeekTimetable;
  apply_all?: boolean;
  sections?: string[];
}): Promise<any> {
  return call({ mode: "save", ...opts });
}

export async function exportTimetableCsv(opts: {
  workspace_id: string;
  class: string;
  section: string;
  day?: string;
}): Promise<void> {
  const res = (await call({ mode: "export", format: "csv", ...opts })) as Response;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timetable-${opts.class}-${opts.section}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportNodeAsImage(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${filename}.png`;
  a.click();
}

export async function exportNodeAsPdf(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });
  const pdf = new jsPDF({ orientation: img.width > img.height ? "landscape" : "portrait", unit: "px" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageW / img.width, pageH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  pdf.addImage(dataUrl, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
  pdf.save(`${filename}.pdf`);
}
