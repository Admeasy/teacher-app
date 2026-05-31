"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { REQUIRED_COLUMNS, importTeachers, validateRows } from "../services/import";
import type { TeacherImportRow } from "../types";

export default function Import() {
  const [rows, setRows] = useState<TeacherImportRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importTeachers>> | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      const normalized: TeacherImportRow[] = json.map((r) => ({
        teacher_id: String(r.teacher_id ?? r.Teacher_ID ?? r["Teacher ID"] ?? "").trim(),
        teacher_name: String(r.teacher_name ?? r["Teacher Name"] ?? r.name ?? "").trim(),
        email: String(r.email ?? r.Email ?? "").trim(),
        subject: String(r.subject ?? r.Subject ?? "").trim(),
        phone: String(r.phone ?? r.Phone ?? "").trim() || undefined,
        assigned_classes: String(r.assigned_classes ?? r["Assigned Classes"] ?? "").trim() || undefined,
      }));
      setRows(validateRows(normalized));
      toast.success(`Parsed ${normalized.length} rows`);
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  async function runImport() {
    if (!rows.length) return;
    setBusy(true);
    try {
      const res = await importTeachers(rows, fileName);
      setResult(res);
      toast.success(`${res.inserted} new · ${res.updated} updated · ${res.deactivated} deactivated`);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const valid = rows.filter((r) => !r.__errors?.length).length;
  const failed = rows.length - valid;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold tracking-tight">Import Teachers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an Excel sheet with columns: {REQUIRED_COLUMNS.join(", ")}.
        </p>
      </motion.div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`glass-strong rounded-2xl p-8 border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 text-center ${
          dragOver ? "border-violet-glow glow-violet" : "border-border/40 hover:border-violet-glow/50"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div className="w-12 h-12 rounded-2xl gradient-violet grid place-items-center glow-violet">
          <Upload size={20} className="text-white" />
        </div>
        <div className="text-sm font-medium">Drop your Excel file here, or click to browse</div>
        <div className="text-xs text-muted-foreground">.xlsx, .xls, .csv</div>
        {fileName && (
          <div className="mt-2 text-xs flex items-center gap-1.5 text-violet-glow">
            <FileSpreadsheet size={12} /> {fileName}
          </div>
        )}
      </label>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total" value={rows.length} />
            <Stat label="Valid" value={valid} tone="success" />
            <Stat label="Errors" value={failed} tone={failed ? "danger" : "muted"} />
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Status</th>
                    <th className="p-3">Teacher ID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Classes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="p-3">
                        {r.__errors?.length ? (
                          <span title={r.__errors.join(", ")} className="text-danger flex items-center gap-1"><AlertTriangle size={14} /> Error</span>
                        ) : (
                          <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={14} /> OK</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.teacher_id}</td>
                      <td className="p-3">{r.teacher_name}</td>
                      <td className="p-3">{r.email}</td>
                      <td className="p-3">{r.subject}</td>
                      <td className="p-3 text-muted-foreground">{r.assigned_classes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => { setRows([]); setFileName(""); setResult(null); }}
              className="glass rounded-xl px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
            >
              <Trash2 size={14} /> Clear
            </button>
            <button
              onClick={runImport}
              disabled={busy || valid === 0}
              className="gradient-violet text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:glow-violet-strong transition-all disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Import {valid} teacher{valid === 1 ? "" : "s"}
            </button>
          </div>

          {result && (
            <div className="glass rounded-xl p-4 text-sm space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 size={16} /> Reconciliation complete
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                <Stat label="New" value={result.inserted} tone="success" />
                <Stat label="Updated" value={result.updated} />
                <Stat label="Deactivated" value={result.deactivated} tone={result.deactivated ? "danger" : "muted"} />
                <Stat label="Skipped" value={result.skipped} />
                <Stat label="Failed" value={result.failed} tone={result.failed ? "danger" : "muted"} />
              </div>
              {result.batch_id && (
                <div className="text-[10px] font-mono text-muted-foreground pt-1">Batch · {result.batch_id.slice(0, 8)}</div>
              )}
              {!!result.errors?.length && (
                <details className="text-xs text-muted-foreground mt-2">
                  <summary className="cursor-pointer text-danger">View {result.errors.length} error(s)</summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="font-mono text-[11px]">Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: "muted" | "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
