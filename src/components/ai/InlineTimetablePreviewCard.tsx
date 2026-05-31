import { useMemo, useRef, useState } from "react";
import { CalendarDays, Download, RefreshCw, Check, ChevronDown, FileImage, FileText, AlertTriangle, ShieldAlert } from "lucide-react";
import { WeekTimetable, exportNodeAsImage, exportNodeAsPdf } from "@/lib/timetableAi";
import ExecutionCard from "@/components/ui/ExecutionCard";
import TimetableGrid, { TimetableSlotRow } from "@/components/timetable/TimetableGrid";
import { validateTimetable, streamForClass, type Stream, type TimetableSettings } from "@/lib/timetableSettings";

export interface TimetableCollision {
  day: string;
  period: number;
  teacher: string;
  conflict_class: string;
  conflict_section: string;
}

interface Props {
  classNum: string;
  section: string;
  timetable: WeekTimetable;
  summary?: string;
  availableSections: string[];
  onApply: (sections: string[], opts?: { override?: boolean; onlyDay?: string }) => Promise<{ ok: boolean; collisions?: TimetableCollision[] }> | void;
  onRegenerate: () => void;
  onExport: () => void;
  applying?: boolean;
  stream?: Stream;
  settings?: Partial<TimetableSettings> | null;
}

function flatten(weekly: WeekTimetable): TimetableSlotRow[] {
  const out: TimetableSlotRow[] = [];
  for (const [day, slots] of Object.entries(weekly ?? {})) {
    for (const s of slots ?? []) {
      out.push({
        day: day.toUpperCase(),
        period_number: s.period,
        subject: s.subject ?? null,
        teacher_name: s.teacher ?? null,
      });
    }
  }
  return out;
}

export default function InlineTimetablePreviewCard({
  classNum, section, timetable, summary, availableSections, onApply, onRegenerate, onExport, applying, stream, settings,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set([section]));
  const [collisions, setCollisions] = useState<TimetableCollision[]>([]);
  const [lastTargetSections, setLastTargetSections] = useState<string[]>([]);
  const [oneDay, setOneDay] = useState("MON");
  const [busy, setBusy] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const flatSlots = useMemo(() => flatten(timetable), [timetable]);
  const effectiveStream = stream ?? streamForClass(classNum);
  const violations = useMemo(() => validateTimetable(flatSlots, effectiveStream), [flatSlots, effectiveStream]);
  const violationKey = useMemo(() => new Set(violations.map(v => `${v.day}|${v.period}`)), [violations]);
  const isBusy = busy || applying;

  async function handleApply(sections: string[], opts?: { override?: boolean; onlyDay?: string }) {
    setBusy(true);
    setLastTargetSections(sections);
    try {
      const res = await Promise.resolve(onApply(sections, opts));
      if (res && typeof res === "object") {
        if (res.ok) {
          setCollisions([]);
        } else if (res.collisions?.length) {
          setCollisions(res.collisions);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ExecutionCard
      title={`Timetable · Class ${classNum}-${section}`}
      subtitle={summary || `AI-generated weekly schedule · Stream: ${effectiveStream}${settings?.school_level ? ` · ${settings.school_level}` : ""}`}
      icon={<CalendarDays size={14} />}
      accentColor="violet"
      className="w-full"
    >
      {violations.length > 0 && (
        <div className="mb-2 border border-red-500/40 bg-red-500/10 rounded-md p-2 text-[11px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold uppercase tracking-wider text-[10px] mb-1">
              {violations.length} stream violation{violations.length !== 1 ? "s" : ""} · {effectiveStream}
            </div>
            <div className="flex flex-wrap gap-1">
              {violations.slice(0, 8).map((v, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30">
                  {v.day} P{v.period}: {v.subject}
                </span>
              ))}
              {violations.length > 8 && <span className="opacity-70">+{violations.length - 8}</span>}
            </div>
          </div>
        </div>
      )}

      {collisions.length > 0 && (
        <div className="mb-2 border border-amber-500/50 bg-amber-500/10 rounded-md p-3 text-[11px] text-amber-200 flex items-start gap-2">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold uppercase tracking-wider text-[10px] mb-1">
              {collisions.length} teacher collision{collisions.length !== 1 ? "s" : ""} — apply blocked
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {collisions.slice(0, 8).map((c, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                  {c.teacher} · {c.day} P{c.period} ↔ {c.conflict_class}-{c.conflict_section}
                </span>
              ))}
              {collisions.length > 8 && <span className="opacity-70">+{collisions.length - 8}</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleApply(lastTargetSections.length ? lastTargetSections : [section], { override: true })}
                disabled={isBusy}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-[10px] font-semibold uppercase tracking-wider rounded disabled:opacity-50 flex items-center gap-1.5"
              >
                <ShieldAlert size={11} /> Override Anyway
              </button>
              <button
                onClick={() => setCollisions([])}
                disabled={isBusy}
                className="px-3 py-1.5 border border-amber-500/40 text-amber-200 text-[10px] font-semibold uppercase tracking-wider rounded hover:bg-amber-500/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={gridRef} className="bg-background rounded">
        <TimetableGrid slots={flatSlots} settings={settings ?? undefined} />
        {violationKey.size > 0 && (
          <div className="text-[9px] text-red-400 italic mt-1 px-1">
            ⚠ Slots in red violate stream rules — regenerate or edit before applying.
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => handleApply([section])}
          disabled={isBusy}
          className="flex-1 min-w-[120px] py-2 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Check size={12} /> Apply to {classNum}-{section}
        </button>
        <select value={oneDay} onChange={e => setOneDay(e.target.value)} disabled={isBusy}
          className="px-2 py-2 bg-surface-2 border border-border rounded-lg text-[11px] font-semibold uppercase tracking-wider">
          {Object.keys(timetable ?? {}).map(d => d.toUpperCase().slice(0, 3)).filter(Boolean).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button
          onClick={() => handleApply([section], { onlyDay: oneDay })}
          disabled={isBusy}
          className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-[11px] font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
        >
          Apply {oneDay} only
        </button>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          disabled={isBusy}
          className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-[11px] font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
        >
          Apply to All <ChevronDown size={12} />
        </button>
        <button
          onClick={onRegenerate}
          disabled={isBusy}
          className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-[11px] font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
        >
          <RefreshCw size={12} /> Regenerate
        </button>
        <button
          onClick={onExport}
          className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-[11px] font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
        >
          <Download size={12} /> CSV
        </button>
        <button
          onClick={() => gridRef.current && exportNodeAsPdf(gridRef.current, `timetable-${classNum}${section}`)}
          className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-[11px] font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
        >
          <FileText size={12} /> PDF
        </button>
        <button
          onClick={() => gridRef.current && exportNodeAsImage(gridRef.current, `timetable-${classNum}${section}`)}
          className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-[11px] font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
        >
          <FileImage size={12} /> Image
        </button>
      </div>

      {pickerOpen && (
        <div className="mt-3 border border-border/50 rounded-lg p-3 bg-surface-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Apply Class {classNum} timetable to:
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {availableSections.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={picked.has(s)}
                  onChange={(e) => {
                    setPicked((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(s);
                      else n.delete(s);
                      return n;
                    });
                  }}
                />
                {classNum}-{s}
              </label>
            ))}
            {availableSections.length === 0 && (
              <span className="text-[11px] text-muted-foreground">No other sections found</span>
            )}
          </div>
          <button
            onClick={() => {
              const arr = Array.from(picked);
              if (arr.length) handleApply(arr);
              setPickerOpen(false);
            }}
            disabled={isBusy || picked.size === 0}
            className="w-full py-2 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg disabled:opacity-50"
          >
            Apply to {picked.size} section{picked.size !== 1 ? "s" : ""}
          </button>
        </div>
      )}
    </ExecutionCard>
  );
}
