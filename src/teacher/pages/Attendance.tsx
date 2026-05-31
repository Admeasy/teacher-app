"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Clock, Plane, ChevronLeft, ChevronRight, Save, Loader2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { invokeTeacherFunctionOrThrow } from "@/lib/teacherInvoke";
import { useTeacherSession } from "../hooks/useTeacherSession";
import { getActiveWorkspace } from "@/lib/activeWorkspace";

type Status = "present" | "absent" | "late" | "leave";
interface Student { id: string; name: string | null; roll_number: string | null; student_id: string | null; }
interface ClassRow { id: string; class_name: string | null; section: string | null; }
interface TeacherOpt { id: string; name: string | null; teacher_id: string | null; subject: string | null; }
interface ExistingRow { student_id: string; status: string; reporting_teacher_id?: string | null; reporting_teacher_name_snapshot?: string | null; }

function initials(name?: string | null) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? "").join("") || "?";
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function shiftDate(d: string, days: number) {
  const dt = new Date(d + "T00:00:00"); dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

export default function Attendance() {
  const { teacher } = useTeacherSession();
  const workspace = getActiveWorkspace();
  const [date, setDate] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [initialMap, setInitialMap] = useState<Record<string, Status>>({});
  const [teachers, setTeachers] = useState<TeacherOpt[]>([]);
  const [reportingId, setReportingId] = useState<string>("");
  const [reportingName, setReportingName] = useState<string>("");
  const [reportingSearch, setReportingSearch] = useState("");
  const [reportingOpen, setReportingOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [holiday, setHoliday] = useState<{ is_holiday: boolean; label: string | null; kind: string | null } | null>(null);

  async function load(opts?: { classId?: string | null; dateOverride?: string }) {
    if (!teacher?.id || !workspace?.id) return;
    setLoading(true);
    try {
      const data = await invokeTeacherFunctionOrThrow<any>("teacher-attendance-fetch", {
        teacher_id: teacher.id,
        workspace_id: workspace.id,
        class_id: opts?.classId ?? selectedClass ?? undefined,
        date: opts?.dateOverride ?? date,
      });

      setClasses(data.assigned_classes ?? []);
      setSelectedClass(data.selected_class_id ?? null);
      setStudents(data.students ?? []);
      setTeachers(data.teachers ?? []);
      setHoliday(data.holiday ?? null);

      const ex: ExistingRow[] = data.existing_attendance ?? [];
      const map: Record<string, Status> = {};
      ex.forEach((r) => {
        const s = (r.status || "").toLowerCase();
        if (s === "present" || s === "absent" || s === "late" || s === "leave") {
          map[r.student_id] = s as Status;
        }
      });
      setStatusMap(map);
      setInitialMap(map);

      // Reporting teacher default: existing row's snapshot or logged-in teacher
      const firstExisting = ex.find((r) => r.reporting_teacher_id);
      if (firstExisting?.reporting_teacher_id) {
        setReportingId(firstExisting.reporting_teacher_id);
        setReportingName(firstExisting.reporting_teacher_name_snapshot ?? data.teacher?.name ?? "");
      } else {
        setReportingId(data.teacher?.id ?? "");
        setReportingName(data.teacher?.name ?? "");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load({ dateOverride: date }); /* eslint-disable-next-line */ }, [teacher?.id, workspace?.id, date]);

  function setStatus(studentId: string, s: Status) {
    // Guard: if student already has approved leave for this date, ask for confirm.
    const current = statusMap[studentId];
    if (initialMap[studentId] === "leave" && s !== "leave") {
      const ok = window.confirm(
        "This student already has approved leave for this date. Override anyway?",
      );
      if (!ok) return;
    }
    setStatusMap((m) => ({ ...m, [studentId]: current === s ? current : s }));
  }

  const counts = useMemo(() => {
    let p = 0, a = 0, l = 0, lv = 0, u = 0;
    students.forEach(s => {
      const v = statusMap[s.id];
      if (v === "present") p++;
      else if (v === "absent") a++;
      else if (v === "late") l++;
      else if (v === "leave") lv++;
      else u++;
    });
    return { p, a, l, lv, u, total: students.length };
  }, [students, statusMap]);

  const filteredStudents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      (s.name ?? "").toLowerCase().includes(q) ||
      (s.roll_number ?? "").toLowerCase().includes(q) ||
      (s.student_id ?? "").toLowerCase().includes(q),
    );
  }, [students, filter]);

  const filteredTeachers = useMemo(() => {
    const q = reportingSearch.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(t =>
      (t.name ?? "").toLowerCase().includes(q) ||
      (t.teacher_id ?? "").toLowerCase().includes(q) ||
      (t.subject ?? "").toLowerCase().includes(q),
    );
  }, [teachers, reportingSearch]);

  async function save() {
    if (!teacher?.id || !workspace?.id || !selectedClass) return;
    const rows = students
      .map(s => ({ student_id: s.id, status: statusMap[s.id] }))
      .filter(r => r.status === "present" || r.status === "absent" || r.status === "late" || r.status === "leave");
    if (!rows.length) { toast.error("Mark at least one student"); return; }
    setSaving(true);
    try {
      const data = await invokeTeacherFunctionOrThrow<{ saved: number }>("teacher-attendance-save", {
        workspace_id: workspace.id,
        class_id: selectedClass,
        date,
        teacher_id: teacher.id,
        reporting_teacher_id: reportingId || teacher.id,
        reporting_teacher_name: reportingName || teacher.name,
        attendance: rows,
      });
      toast.success(`Saved ${data.saved} attendance entries`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function markAll(s: Status) {
    setStatusMap((m) => {
      const next = { ...m };
      filteredStudents.forEach(st => { next[st.id] = s; });
      return next;
    });
  }

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-xs text-muted-foreground">Tap to mark · saves in one bulk request</p>
        </div>
      </div>

      {holiday?.is_holiday && (
        <div className="glass rounded-2xl p-4 mb-3 border border-amber-500/30 bg-amber-500/5">
          <div className="text-[10px] uppercase tracking-widest text-amber-500 mb-1">Holiday</div>
          <div className="text-sm font-semibold">{holiday.label} — no attendance today</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {holiday.kind === "weekly_off" ? "Weekly off" : holiday.kind === "vacation" ? "Vacation" : "School holiday"} · marking is disabled
          </div>
        </div>
      )}



      {/* Date + class */}
      <div className="glass rounded-2xl p-3 mb-3 flex items-center gap-2">
        <button
          aria-label="Previous day"
          onClick={() => setDate(d => shiftDate(d, -1))}
          className="p-2 rounded-lg hover:bg-surface-2"
        ><ChevronLeft size={18} /></button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 bg-transparent text-sm font-medium text-center outline-none"
        />
        <button
          aria-label="Next day"
          onClick={() => setDate(d => shiftDate(d, 1))}
          className="p-2 rounded-lg hover:bg-surface-2"
        ><ChevronRight size={18} /></button>
      </div>

      {classes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {classes.map(c => (
            <button
              key={c.id}
              onClick={() => { setSelectedClass(c.id); load({ classId: c.id }); }}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-all ${
                selectedClass === c.id
                  ? "bg-primary text-primary-foreground border-primary glow-violet"
                  : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.class_name}{c.section ? ` · ${c.section}` : ""}
            </button>
          ))}
        </div>
      )}

      {/* Reporting teacher */}
      <div className="glass rounded-2xl p-3 mb-3 relative">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Reporting Teacher</div>
        <button
          onClick={() => setReportingOpen(o => !o)}
          className="w-full flex items-center justify-between text-left text-sm font-medium"
        >
          <span>{reportingName || "Select teacher"}</span>
          <ChevronRight size={16} className={`transition-transform ${reportingOpen ? "rotate-90" : ""}`} />
        </button>
        {reportingOpen && (
          <div className="absolute left-0 right-0 mt-2 z-30 glass-strong rounded-2xl border border-border/40 p-2 max-h-72 overflow-auto shadow-xl">
            <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/30 mb-1">
              <Search size={14} className="text-muted-foreground" />
              <input
                autoFocus
                value={reportingSearch}
                onChange={(e) => setReportingSearch(e.target.value)}
                placeholder="Search teacher…"
                className="bg-transparent text-sm outline-none flex-1"
              />
            </div>
            {filteredTeachers.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setReportingId(t.id); setReportingName(t.name ?? "");
                  setReportingOpen(false); setReportingSearch("");
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-surface-2 flex items-center justify-between ${
                  reportingId === t.id ? "bg-primary/10 text-primary" : ""
                }`}
              >
                <span className="truncate">{t.name ?? t.teacher_id}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{t.subject ?? ""}</span>
              </button>
            ))}
            {!filteredTeachers.length && <div className="px-3 py-4 text-xs text-muted-foreground text-center">No matches</div>}
          </div>
        )}
      </div>

      {/* Counts + search + mark all */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 glass rounded-xl px-3 py-2">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search name or roll…"
            className="bg-transparent text-sm outline-none flex-1"
          />
        </div>
        <button onClick={() => markAll("present")} className="text-[11px] px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">All P</button>
        <button onClick={() => markAll("absent")} className="text-[11px] px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20">All A</button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2 px-1">
        <span className="flex items-center gap-1"><Users size={12} /> {counts.total} students</span>
        <span className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="text-emerald-500">{counts.p} P</span> ·
          <span className="text-rose-500">{counts.a} A</span> ·
          <span className="text-amber-500">{counts.l} L</span> ·
          <span className="text-sky-400">{counts.lv} Lv</span> ·
          <span>{counts.u} pending</span>
        </span>
      </div>

      {/* Student list */}
      {holiday?.is_holiday ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Attendance is paused on holidays. Pick another date or update holidays in School Settings.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="animate-spin" /></div>
      ) : !filteredStudents.length ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {students.length ? "No matches." : "No students in this class."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2 pb-32 md:pb-8">
          {filteredStudents.map((s) => {
            const st = statusMap[s.id];
            const onApprovedLeave = initialMap[s.id] === "leave";
            return (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className={`glass rounded-2xl p-3 flex items-center gap-3 ${
                  onApprovedLeave ? "border border-sky-500/30 bg-sky-500/[0.04]" : ""
                }`}
              >
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary grid place-items-center text-sm font-semibold shrink-0">
                  {initials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {s.name || "Unnamed"}
                    {onApprovedLeave && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-400 font-semibold">
                        On Leave
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    Roll {s.roll_number || "—"}{s.student_id ? ` · ${s.student_id}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatus(s.id, "present")}
                    aria-label="Present"
                    className={`h-9 w-9 rounded-xl grid place-items-center border transition-all ${
                      st === "present"
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-md scale-105"
                        : "border-border/40 text-muted-foreground hover:text-emerald-500 hover:border-emerald-500/50"
                    }`}
                  ><Check size={16} /></button>
                  <button
                    onClick={() => setStatus(s.id, "absent")}
                    aria-label="Absent"
                    className={`h-9 w-9 rounded-xl grid place-items-center border transition-all ${
                      st === "absent"
                        ? "bg-rose-500 text-white border-rose-500 shadow-md scale-105"
                        : "border-border/40 text-muted-foreground hover:text-rose-500 hover:border-rose-500/50"
                    }`}
                  ><X size={16} /></button>
                  <button
                    onClick={() => setStatus(s.id, "late")}
                    aria-label="Late"
                    className={`h-9 w-9 rounded-xl grid place-items-center border transition-all ${
                      st === "late"
                        ? "bg-amber-500 text-white border-amber-500 shadow-md scale-105"
                        : "border-border/40 text-muted-foreground hover:text-amber-500 hover:border-amber-500/50"
                    }`}
                  ><Clock size={16} /></button>
                  <button
                    onClick={() => setStatus(s.id, "leave")}
                    aria-label="On leave"
                    title="Mark as on leave"
                    className={`h-9 w-9 rounded-xl grid place-items-center border transition-all ${
                      st === "leave"
                        ? "bg-sky-500 text-white border-sky-500 shadow-md scale-105"
                        : "border-border/40 text-muted-foreground hover:text-sky-400 hover:border-sky-500/50"
                    }`}
                  ><Plane size={16} /></button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-16 md:bottom-4 inset-x-0 px-4 md:px-6 z-40 pointer-events-none">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={save}
            disabled={saving || loading || !selectedClass || !!holiday?.is_holiday}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-medium shadow-xl glow-violet disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {holiday?.is_holiday ? `${holiday.label} — Holiday` : (saving ? "Saving…" : `Save Attendance · ${counts.p + counts.a + counts.l + counts.lv}/${counts.total}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
