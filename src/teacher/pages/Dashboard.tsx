"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Users, BookOpen, ClipboardCheck, Activity, Brain, GraduationCap, CalendarDays, Upload, FileText } from "lucide-react";
import Link from "next/link";
import { useTeacherSession } from "../hooks/useTeacherSession";
import { getDashboard, type DashboardData } from "../services/teacher";

export default function Dashboard() {
  const { teacher } = useTeacherSession();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacher?.teacher_id) return;
    setLoading(true);
    getDashboard(teacher.teacher_id)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [teacher?.teacher_id]);

  if (!teacher) return null;

  const cards = [
    { label: "Total Students", value: stats?.total_students ?? "—", icon: Users },
    { label: "Classes", value: stats?.classes_assigned ?? "—", icon: GraduationCap },
    { label: "Today Present", value: stats ? `${stats.attendance_today.present}/${stats.attendance_today.total || "—"}` : "—", icon: ClipboardCheck },
    { label: "Weekly Att %", value: stats ? `${stats.weekly_attendance_pct}%` : "—", icon: Activity },
    { label: "AI Usage", value: stats?.ai_usage_count ?? "—", icon: Brain },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 gradient-violet opacity-10 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Welcome back</div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1 truncate">{teacher.name}</h1>
            <div className="text-sm text-muted-foreground mt-1">
              {teacher.subject || "—"} {stats && stats.classes_assigned > 0 && `• ${stats.classes_assigned} class${stats.classes_assigned > 1 ? "es" : ""}`}
            </div>
          </div>
          <Link href="/teacher/ai" className="gradient-violet text-white text-sm font-semibold px-5 py-3 rounded-xl flex items-center gap-2 hover:glow-violet-strong transition-all shrink-0">
            <Sparkles size={16} /> Open AI Workspace
          </Link>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {cards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-[11px] uppercase tracking-wider">{s.label}</span>
              <s.icon size={14} />
            </div>
            <div className="text-xl md:text-2xl font-semibold">
              {loading ? <span className="text-muted-foreground">…</span> : s.value}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <QuickAction icon={ClipboardCheck} label="Mark Attendance" to="/teacher/attendance" />
        <QuickAction icon={Upload} label="Upload CSV" to="/teacher/import" />
        <QuickAction icon={FileText} label="Create Test" to="/teacher/tests" />
        <QuickAction icon={Sparkles} label="AI Assistant" to="/teacher/ai" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Assigned classes</div>
            <span className="text-[11px] text-muted-foreground">{stats?.classes.length ?? 0} total</span>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !stats?.classes.length ? (
            <div className="text-sm text-muted-foreground">No classes assigned yet. Ask your admin to assign you to a class.</div>
          ) : (
            <div className="flex flex-col divide-y divide-border/30">
              {stats.classes.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.class_name}{c.section ? `-${c.section}` : ""}
                      {c.subject && <span className="ml-2 text-xs text-muted-foreground">· {c.subject}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.student_count} students</div>
                  </div>
                  <span className="text-xs font-medium text-violet-glow shrink-0">{c.attendance_pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Upcoming tests</div>
            <CalendarDays size={14} className="text-muted-foreground" />
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !stats?.upcoming_tests.length ? (
            <div className="text-sm text-muted-foreground">No tests scheduled.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.upcoming_tests.map((t) => (
                <div key={t.id} className="flex items-start gap-2">
                  <BookOpen size={14} className="text-violet-glow mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.subject || "—"} · {new Date(t.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass rounded-xl p-5">
        <div className="text-sm font-semibold mb-3">Recent AI activity</div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !stats?.recent_ai.length ? (
          <div className="text-sm text-muted-foreground">No AI activity yet. Open the AI workspace to get started.</div>
        ) : (
          <div className="flex flex-col divide-y divide-border/30">
            {stats.recent_ai.map((a, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{a.mode || "chat"}</div>
                  <div className="text-sm truncate">{a.prompt || "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, to }: { icon: any; label: string; to: string }) {
  return (
    <Link href={to} className="glass rounded-xl p-4 flex items-center gap-3 hover:glow-violet transition-all">
      <div className="w-9 h-9 rounded-lg gradient-violet grid place-items-center">
        <Icon size={16} className="text-white" />
      </div>
      <div className="text-sm font-medium">{label}</div>
    </Link>
  );
}
