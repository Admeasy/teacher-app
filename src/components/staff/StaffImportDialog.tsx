import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Staff Import Dialog
 * Columns: Name, Email, Phone number, Job position, Department
 * Behaviour:
 *  - Always insert a row into `non_teaching_staff`.
 *  - If Department === "Transport", we also insert a transport-side record
 *    (already represented by non_teaching_staff with role=driver/conductor,
 *     since transport_vehicles FKs into non_teaching_staff).
 *    The Job position string ("Driver" / "Conductor" / "Helper") drives the
 *    `role` column ('driver' default, 'conductor' if matched, else 'helper').
 */
type Row = {
  name: string;
  email: string | null;
  phone: string | null;
  job_position: string | null;
  department: string | null;
  __role: "driver" | "conductor" | "helper" | "staff";
  __isTransport: boolean;
};

const TEMPLATE_HEADERS = ["Name", "Email", "Phone number", "Job position", "Department"];
const TEMPLATE_ROWS = [
  ["Ramesh Kumar", "ramesh@example.com", "9876543210", "Bus Driver", "Transport"],
  ["Sunita Devi", "sunita@example.com", "9988776655", "Conductor", "Transport"],
  ["Anita Sharma", "anita@example.com", "9123456789", "Front Desk", "Receptionist"],
];
const DEPARTMENT_TAGS = [
  "Transport",
  "Receptionist",
  "Administration",
  "Security",
  "Housekeeping",
  "Maintenance",
  "Library",
  "Accounts",
  "Other",
];

function suggestTag(value: string): string | null {
  const lower = value.toLowerCase();
  if (/transport|bus|driver|conduct/.test(lower)) return "Transport";
  if (/reception|front/.test(lower)) return "Receptionist";
  if (/account|fee|cash/.test(lower)) return "Accounts";
  if (/security|guard/.test(lower)) return "Security";
  if (/clean|house/.test(lower)) return "Housekeeping";
  if (/library/.test(lower)) return "Library";
  return null;
}

function detectRole(jobPosition: string | null): Row["__role"] {
  const lc = (jobPosition || "").toLowerCase();
  if (/conduct/.test(lc)) return "conductor";
  if (/driver|chauffeur/.test(lc)) return "driver";
  if (/helper|attend/.test(lc)) return "helper";
  return "staff";
}

function normaliseDepartment(raw: string | null): string {
  if (!raw) return "Other";
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const match = DEPARTMENT_TAGS.find((d) => d.toLowerCase() === lower);
  if (match) return match;
  if (/transport|bus|driver|conduct/.test(lower)) return "Transport";
  const suggested = suggestTag(trimmed);
  return suggested ?? "Other";
}

export default function StaffImportDialog({
  workspaceId,
  onComplete,
}: {
  workspaceId: string;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ ok: number; transport: number; fail: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff");
    XLSX.writeFile(wb, "non-teaching-staff-template.xlsx");
  }

  async function handleFile(file: File) {
    setBusy(true);
    setReport(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const parsed: Row[] = raw
        .map((r) => {
          const lower: Record<string, any> = {};
          Object.keys(r).forEach((k) => (lower[k.toLowerCase().trim()] = r[k]));
          const name = String(lower["name"] ?? "").trim();
          if (!name) return null;
          const dept = normaliseDepartment(String(lower["department"] ?? "").trim() || null);
          const job = String(lower["job position"] ?? lower["job_position"] ?? lower["role"] ?? "").trim() || null;
          const role = dept === "Transport" ? detectRole(job) : "staff";
          return {
            name,
            email: String(lower["email"] ?? "").trim() || null,
            phone: String(lower["phone number"] ?? lower["phone"] ?? lower["phone_number"] ?? "").trim() || null,
            job_position: job,
            department: dept,
            __role: role,
            __isTransport: dept === "Transport",
          } as Row;
        })
        .filter((r): r is Row => !!r);
      setRows(parsed);
      if (!parsed.length) toast.error("No rows found in file");
    } catch (e: any) {
      toast.error(e.message || "Failed to parse file");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!rows.length) return;
    setBusy(true);
    const errors: string[] = [];
    let ok = 0;
    let transport = 0;
    // Single batch insert — let DB handle uniqueness; failures roll back this call.
    const payload = rows.map((r) => ({
      workspace_id: workspaceId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      sub_role: r.job_position,
      department_tag: r.department,
      role: r.__role === "staff" ? "driver" : r.__role, // schema requires non-null; for non-transport we still default to driver but their department_tag distinguishes
      status: "active",
      active: true,
    }));
    // Insert one-by-one so partial failures still import the rest, and we can report.
    for (let i = 0; i < payload.length; i++) {
      const { error } = await supabase.from("non_teaching_staff").insert(payload[i]);
      if (error) {
        errors.push(`Row ${i + 2} (${payload[i].name}): ${error.message}`);
      } else {
        ok++;
        if (rows[i].__isTransport) transport++;
      }
    }
    setReport({ ok, transport, fail: errors.length, errors: errors.slice(0, 10) });
    setBusy(false);
    if (ok > 0) {
      toast.success(`Imported ${ok} staff${transport ? ` (${transport} to Transport)` : ""}`);
      onComplete();
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setRows([]);
          setReport(null);
        }}
        className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border rounded hover:bg-surface-2 flex items-center gap-1.5"
      >
        <Upload size={12} /> Import staff
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Non-Teaching Staff</DialogTitle>
            <DialogDescription>
              Required columns: <span className="font-mono text-foreground">Name, Email, Phone number, Job position, Department</span>.
              Rows with Department = <Badge variant="outline" className="mx-1">Transport</Badge> are also routed into the Transport
              module (Drivers & Conductors) based on Job position.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-1.5" /> Template (.xlsx)
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload className="w-4 h-4 mr-1.5" /> Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {rows.length > 0 && (
              <div className="border border-border rounded max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 sticky top-0">
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-2 py-1.5">Name</th>
                      <th className="text-left px-2 py-1.5">Phone</th>
                      <th className="text-left px-2 py-1.5">Job position</th>
                      <th className="text-left px-2 py-1.5">Department</th>
                      <th className="text-left px-2 py-1.5">Routing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1.5 font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 font-mono">{r.phone ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.job_position ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.department}</td>
                        <td className="px-2 py-1.5">
                          {r.__isTransport ? (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                              Transport · {r.__role}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Staff only</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {report && (
              <div className="rounded border border-border bg-surface-2 p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 text-emerald-500">
                  <CheckCircle2 className="w-4 h-4" /> Imported {report.ok} · Transport routed: {report.transport}
                </div>
                {report.fail > 0 && (
                  <>
                    <div className="flex items-center gap-2 text-rose-500">
                      <AlertTriangle className="w-4 h-4" /> Failed {report.fail}
                    </div>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {report.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={commit} disabled={busy || !rows.length}>
              {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
              Import {rows.length} row{rows.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
