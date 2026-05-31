import { useState, useMemo } from "react";
import { Search, Download } from "lucide-react";

interface Props {
  title?: string;
  data: any[];
  columns?: { key: string; label: string }[];
  empty?: string;
  onRowClick?: (row: any) => void;
}

export default function DataTable({ title, data, columns, empty, onRowClick }: Props) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const cols = useMemo(() => {
    if (!data || data.length === 0) return [];
    return columns ?? Object.keys(data[0])
      .filter(k => !["id", "workspace_id", "created_at"].includes(k))
      .map(k => ({ key: k, label: k.replace(/_/g, " ") }));
  }, [data, columns]);

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(s)));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null) return 1; if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return rows;
  }, [data, q, sortKey, sortDir]);

  function exportCsv() {
    const header = cols.map(c => c.label).join(",");
    const lines = filtered.map(r => cols.map(c => {
      const v = r[c.key];
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(","));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title ?? "export"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  if (!data || data.length === 0) {
    return (
      <div className="border border-archive bg-archive p-12 text-center font-serif italic text-ink-muted text-sm">
        {empty ?? "No records."}
      </div>
    );
  }

  return (
    <div className="border border-archive bg-archive flex flex-col min-h-0">
      <div className="border-b border-archive px-4 py-2.5 flex items-center justify-between bg-archive-panel gap-3">
        {title && <div className="font-serif text-base text-ink">{title}</div>}
        <div className="flex-1 max-w-xs relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/60" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search..."
            className="w-full bg-black border border-black/80 pl-8 pr-2 py-1.5 text-xs font-mono text-white placeholder:text-white/50 focus:outline-none focus:border-banker-bright/60 rounded-sm" />
        </div>
        <div className="font-mono text-[10px] text-ink-muted uppercase tracking-widest">{filtered.length} / {data.length}</div>
        <button onClick={exportCsv}
          className="px-2.5 py-1.5 bg-black border border-black/80 text-white font-mono text-[10px] uppercase tracking-widest hover:border-banker-bright/60 flex items-center gap-1 rounded-sm">
          <Download size={11} /> CSV
        </button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-archive-panel sticky top-0">
            <tr>
              {cols.map(c => (
                <th key={c.key} onClick={() => toggleSort(c.key)}
                  className="text-left px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted border-b border-archive whitespace-nowrap cursor-pointer hover:text-ink select-none">
                  {c.label}{sortKey === c.key && (sortDir === "asc" ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-archive/50 hover:bg-archive-surface/50 ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {cols.map(c => (
                  <td key={c.key} className="px-4 py-2.5 font-mono text-ink whitespace-nowrap">
                    {formatCell(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(v: any) {
  if (v === null || v === undefined || v === "") return <span className="text-ink-muted">—</span>;
  if (typeof v === "number") return v.toLocaleString("en-IN");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
