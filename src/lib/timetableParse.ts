// Shared timetable parser — extracts {day, period, subject, teacher_name}[] from a sheet.
import * as XLSX from "xlsx";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export interface ParsedCell { day: string; period: number; subject: string; teacher_name: string }

export function normalizeDay(raw: string): string | null {
  const v = (raw ?? "").trim().toLowerCase().slice(0, 3);
  const map: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
  return map[v] ?? null;
}

/** Parse one worksheet into timetable cells. Returns [] if no header row found. */
export function parseSheet(json: any[][]): ParsedCell[] {
  const out: ParsedCell[] = [];
  if (!json.length) return out;
  const headerIdx = json.findIndex(r => r.some((c: any) => /^p\s*\d+$/i.test(String(c ?? "").trim())));
  if (headerIdx < 0) return out;
  const headerRow = json[headerIdx];
  const hasDayCol = /day/i.test(String(headerRow[0] ?? "").trim());
  const periodCols: { idx: number; period: number }[] = [];
  headerRow.forEach((c: any, idx: number) => {
    const m = /^p\s*(\d+)$/i.exec(String(c ?? "").trim());
    if (m) periodCols.push({ idx, period: parseInt(m[1], 10) });
  });
  if (!periodCols.length) return out;

  let dayCursor = 0;
  let i = headerIdx + 1;
  while (i < json.length) {
    const subjRow = json[i] ?? [];
    if (subjRow.every((c: any) => String(c ?? "").trim() === "")) { i++; continue; }
    let day: string | null = null;
    if (hasDayCol) {
      day = normalizeDay(String(subjRow[0] ?? ""));
      if (!day) { i++; continue; }
    } else {
      day = DAYS[dayCursor % DAYS.length];
      dayCursor++;
    }
    const teachRow = json[i + 1] ?? [];
    for (const { idx, period } of periodCols) {
      let subject = String(subjRow[idx] ?? "").trim();
      let teacher_name = String(teachRow[idx] ?? "").trim();
      if (subject.includes(" - ") && !teacher_name) {
        const [s, t] = subject.split(/\s*-\s*/);
        subject = (s ?? "").trim();
        teacher_name = (t ?? "").trim();
      }
      if (!subject && !teacher_name) continue;
      if (/^free$/i.test(subject)) continue;
      out.push({ day, period, subject, teacher_name });
    }
    i += 2;
  }
  return out;
}

/** Try to extract class+section from a sheet name like "Class 12 A", "12-B", "12B Science". */
export function parseClassSection(sheetName: string): { cls: string; section: string } | null {
  const s = sheetName.trim();
  // Pattern: optional "class", number, optional separator, single letter
  const m = s.match(/(?:class\s*)?([0-9]{1,2})\s*[-_ ]?\s*([A-Za-z])\b/i);
  if (!m) return null;
  return { cls: m[1], section: m[2].toUpperCase() };
}

export interface SheetImportResult {
  sheetName: string;
  cls?: string;
  section?: string;
  rows: number;
  saved: number;
  skipped: number;
  error?: string;
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

export function sheetToMatrix(sheet: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}
