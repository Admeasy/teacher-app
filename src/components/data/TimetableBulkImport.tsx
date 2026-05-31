import { useRef, useState } from "react";
import { CalendarDays, FileUp, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  parseSheet, parseClassSection, readWorkbook, sheetToMatrix,
  type SheetImportResult, DAYS,
} from "@/lib/timetableParse";

interface Props { workspaceId: string }

export default function TimetableBulkImport({ workspaceId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [results, setResults] = useState<SheetImportResult[] | null>(null);

  function isLikelyTimetableSheet(matrix: any[][]): boolean {
    return matrix.some(r => r.some((c: any) => /^p\s*\d+$/i.test(String(c ?? "").trim())));
  }

  async function onPick(file: File) {
    setBusy(true);
    setResults(null);
    setProgress(null);
    try {
      const wb = await readWorkbook(file);
      const sheets = wb.SheetNames;

      // Pre-scan: only sheets that look like timetables AND have a class+section in name
      const candidates: { name: string; matrix: any[][]; cls: string; section: string }[] = [];
      for (const name of sheets) {
        const matrix = sheetToMatrix(wb.Sheets[name]);
        if (!isLikelyTimetableSheet(matrix)) continue;
        const cs = parseClassSection(name);
        if (!cs) continue;
        candidates.push({ name, matrix, cls: cs.cls, section: cs.section });
      }

      if (!candidates.length) {
        setBusy(false);
        return toast.error("No timetable sheets detected. Sheet names must include class+section (e.g. \"12-A\" or \"Class 10 B\") and contain P1..P8 headers.");
      }

      // Pre-load teachers for fuzzy match
      const { data: teacherRows } = await supabase
        .from("teachers").select("id, name").eq("workspace_id", workspaceId);
      const teachers = (teacherRows ?? []) as { id: string; name: string }[];
      const teacherByLower = new Map(teachers.map(t => [t.name.toLowerCase(), t]));
      function matchTeacher(name: string) {
        const n = name.trim().toLowerCase();
        if (!n) return null;
        if (teacherByLower.has(n)) return teacherByLower.get(n)!;
        for (const t of teachers) {
          const tn = t.name.toLowerCase();
          if (tn.includes(n) || n.includes(tn)) return t;
        }
        const last = n.split(/\s+/).pop()!;
        return teachers.find(t => t.name.toLowerCase().split(/\s+/).pop() === last) ?? null;
      }

      const out: SheetImportResult[] = [];
      const newTeacherNames = new Set<string>();

      // First pass — collect cells & unmatched teachers
      const sheetParsed = candidates.map(c => {
        const cells = parseSheet(c.matrix);
        cells.forEach(cell => {
          if (cell.teacher_name && !matchTeacher(cell.teacher_name)) newTeacherNames.add(cell.teacher_name);
        });
        return { ...c, cells };
      });

      // Auto-create missing teachers in one batch
      if (newTeacherNames.size) {
        const inserts = Array.from(newTeacherNames).map(name => ({ workspace_id: workspaceId, name }));
        const { data: created } = await supabase.from("teachers").insert(inserts).select("id, name");
        (created ?? []).forEach((t: any) => {
          teachers.push(t);
          teacherByLower.set(t.name.toLowerCase(), t);
        });
        if (created?.length) toast.success(`Auto-created ${created.length} teachers from workbook`);
      }

      // Second pass — upsert per sheet with progress
      for (let i = 0; i < sheetParsed.length; i++) {
        const sp = sheetParsed[i];
        setProgress({ done: i, total: sheetParsed.length, current: `${sp.cls}-${sp.section}` });
        const rows = sp.cells
          .filter(c => DAYS.includes(c.day) && c.period >= 1 && c.period <= 8)
          .filter(c => c.subject || c.teacher_name)
          .map(c => {
            const t = c.teacher_name ? matchTeacher(c.teacher_name) : null;
            return {
              workspace_id: workspaceId,
              class: sp.cls,
              section: sp.section,
              day: c.day,
              period_number: c.period,
              subject: c.subject || null,
              teacher_id: t?.id ?? null,
              teacher_name: t?.name ?? c.teacher_name ?? null,
            };
          });
        if (!rows.length) {
          out.push({ sheetName: sp.name, cls: sp.cls, section: sp.section, rows: 0, saved: 0, skipped: sp.cells.length, error: "no usable rows" });
          continue;
        }
        const { error } = await supabase.from("timetable").upsert(rows, {
          onConflict: "workspace_id,class,section,day,period_number",
        });
        out.push({
          sheetName: sp.name, cls: sp.cls, section: sp.section,
          rows: sp.cells.length, saved: error ? 0 : rows.length,
          skipped: sp.cells.length - rows.length,
          error: error?.message,
        });
      }

      setProgress({ done: sheetParsed.length, total: sheetParsed.length, current: "" });
      setResults(out);
      const totalSaved = out.reduce((s, r) => s + r.saved, 0);
      const failed = out.filter(r => r.error).length;
      if (failed) toast.error(`${totalSaved} rows saved · ${failed} sheet${failed > 1 ? "s" : ""} failed`);
      else toast.success(`Imported ${totalSaved} periods across ${out.length} classes`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border rounded-xl bg-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-lg text-foreground flex items-center gap-2">
            <CalendarDays size={18} className="text-violet-glow" /> Bulk Timetable Workbook
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            Upload .xlsx — every sheet named like "12-A" or "Class 10 B" auto-fills its timetable
          </div>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="px-4 py-2 text-[11px] font-mono uppercase tracking-widest gradient-violet text-white rounded hover:glow-violet-strong disabled:opacity-50 flex items-center gap-2">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
          {busy ? "Importing…" : "Upload Timetable Workbook"}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e => e.target.files?.[0] && onPick(e.target.files[0])} />
      </div>

      {progress && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>Processing {progress.current || "…"}</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-violet transition-all"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
        </div>
      )}

      {results && (
        <div className="border-t border-border pt-3 flex flex-col gap-1.5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Import summary · {results.length} sheets · {results.reduce((s, r) => s + r.saved, 0)} periods saved
          </div>
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                {r.error
                  ? <XCircle size={13} className="text-red-400 shrink-0" />
                  : <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
                <span className="text-foreground w-44 truncate">{r.sheetName}</span>
                <span className="text-muted-foreground">→ {r.cls}-{r.section}</span>
                <span className="text-muted-foreground">· {r.saved}/{r.rows} saved</span>
                {r.skipped > 0 && <span className="text-amber-400">· {r.skipped} skipped</span>}
                {r.error && <span className="text-red-400 truncate">· {r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
