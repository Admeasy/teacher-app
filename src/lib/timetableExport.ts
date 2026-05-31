// Export a class+section timetable as PDF (landscape A4) and PNG.
// Now includes period timings, breaks, and lunch rows from active settings.
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { buildSchedule, DEFAULT_SETTINGS, type TimetableSettings } from "@/lib/timetableSettings";

export const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

export interface TTRow { day: string; period_number: number; subject: string | null; teacher_name: string | null }

function splitMulti(value: string | null | undefined): string[] {
  if (!value) return [""];
  return value.split("/").map(s => s.trim()).filter(Boolean);
}

export function buildTimetableHTML(opts: {
  className: string; section: string; rows: TTRow[]; schoolName?: string;
  settings?: Partial<TimetableSettings> | null; stream?: string;
}): HTMLDivElement {
  const s = { ...DEFAULT_SETTINGS, ...(opts.settings ?? {}) } as any;
  const schedule = buildSchedule(s);
  const days = (s.working_days ?? DAYS).filter((d: string) => DAYS.includes(d.toUpperCase().slice(0,3))).map((d: string) => d.toUpperCase().slice(0,3));

  const map = new Map<string, TTRow>();
  opts.rows.forEach(r => map.set(`${(r.day ?? "").toUpperCase().slice(0,3)}|${r.period_number}`, r));

  const root = document.createElement("div");
  root.style.cssText = "background:#fff;color:#111;font-family:Inter,system-ui,sans-serif;padding:24px;width:1500px;";

  const headerCells = schedule.map(slot => {
    if (slot.kind === "period") {
      return `<th style="padding:8px 6px;text-align:center;border:1px solid #ddd;background:#1e3a8a;color:#fff;font-size:11px;">
        <div style="font-weight:700;">P${slot.period}</div>
        <div style="font-size:9px;font-weight:400;opacity:.85;">${slot.start}–${slot.end}</div>
      </th>`;
    }
    return `<th style="padding:8px 6px;text-align:center;border:1px solid #ddd;background:#fed7aa;color:#7c2d12;font-size:10px;">
      <div style="font-weight:700;">${slot.kind === "lunch" ? "🍽 LUNCH" : "☕ BREAK"}</div>
      <div style="font-size:9px;font-weight:400;">${slot.start}–${slot.end} · ${slot.duration}m</div>
    </th>`;
  }).join("");

  const bodyRows = days.map((d: string) => {
    const subjectRow = schedule.map(slot => {
      if (slot.kind !== "period") {
        return `<td rowspan="2" style="padding:8px;border:1px solid #ddd;background:#fff7ed;text-align:center;font-size:10px;color:#9a3412;font-style:italic;vertical-align:middle;">${slot.kind === "lunch" ? "Lunch" : "Break"}</td>`;
      }
      const cell = map.get(`${d}|${slot.period}`);
      const subjects = splitMulti(cell?.subject ?? "");
      return `<td style="padding:0;border:1px solid #ddd;text-align:center;vertical-align:top;">
        ${subjects.map((sub, i) => `<div style="padding:6px 4px;font-size:11px;font-weight:600;color:#111;${i>0?'border-top:1px dashed #ccc;':''}">${sub || "—"}</div>`).join("")}
      </td>`;
    }).join("");

    const teacherRow = schedule.filter(s => s.kind === "period").map(slot => {
      const cell = map.get(`${d}|${slot.period}`);
      const teachers = splitMulti(cell?.teacher_name ?? "");
      return `<td style="padding:0;border:1px solid #ddd;background:#f9fafb;text-align:center;vertical-align:top;">
        ${teachers.map((t, i) => `<div style="padding:5px 4px;font-size:10px;color:#555;font-style:italic;${i>0?'border-top:1px dashed #ddd;':''}">${t || "—"}</div>`).join("")}
      </td>`;
    }).join("");

    return `
      <tr>
        <td rowspan="2" style="padding:10px 8px;border:1px solid #ddd;background:#f3f4f6;font-weight:700;text-align:center;vertical-align:middle;font-size:11px;">${d}</td>
        ${subjectRow}
      </tr>
      <tr>${teacherRow}</tr>
    `;
  }).join("");

  root.innerHTML = `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px;">
      <div>
        <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#666;">${opts.schoolName ?? "Admeasy"}${opts.stream ? ` · ${opts.stream}` : ""}</div>
        <div style="font-size:24px;font-weight:700;">Class ${opts.className}-${opts.section} · Weekly Timetable</div>
      </div>
      <div style="font-size:10px;color:#888;">Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;">
      <thead>
        <tr>
          <th style="padding:8px;border:1px solid #ddd;background:#1e3a8a;color:#fff;width:60px;font-size:11px;">DAY</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div style="margin-top:8px;font-size:9px;color:#999;text-align:right;">Times in IST · Cells with multiple values denote optional subject groups (Class 11/12).</div>
  `;
  return root;
}

async function renderToCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  document.body.appendChild(node);
  node.style.position = "fixed";
  node.style.left = "-10000px";
  node.style.top = "0";
  try {
    return await html2canvas(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
  } finally {
    node.remove();
  }
}

export async function exportTimetablePNG(opts: { className: string; section: string; rows: TTRow[]; settings?: Partial<TimetableSettings> | null; stream?: string }) {
  const node = buildTimetableHTML(opts);
  const canvas = await renderToCanvas(node);
  const link = document.createElement("a");
  link.download = `Timetable-${opts.className}-${opts.section}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export async function exportTimetablePDF(opts: { className: string; section: string; rows: TTRow[]; settings?: Partial<TimetableSettings> | null; stream?: string }) {
  const node = buildTimetableHTML(opts);
  const canvas = await renderToCanvas(node);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
  pdf.save(`Timetable-${opts.className}-${opts.section}.pdf`);
}
