// Student attendance: percentage, history, monthly stats, streaks, insights.
// Reads from attendance_records (single source of truth — same table teachers write to).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const student_id: string = String(body.student_id ?? "").trim();
    const workspace_id: string = String(body.workspace_id ?? "").trim();
    const monthStart: string | null = body.month_start ?? null; // YYYY-MM-01, optional
    const limit = Math.min(Math.max(Number(body.limit ?? 90), 1), 366);

    if (!student_id || !workspace_id) {
      return new Response(JSON.stringify({ error: "Missing student_id or workspace_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify student belongs to workspace (defence in depth)
    const { data: studentRow, error: stuErr } = await sb
      .from("students")
      .select("id, workspace_id, name, class, section")
      .eq("id", student_id)
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    if (stuErr) throw stuErr;
    if (!studentRow) {
      return new Response(JSON.stringify({ error: "Student not found in workspace" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All-time aggregate (cheap thanks to (workspace_id, student_id, date) index)
    const { data: allRows, error: aggErr } = await sb
      .from("attendance_records")
      .select("date,status")
      .eq("workspace_id", workspace_id)
      .eq("student_id", student_id);
    if (aggErr) throw aggErr;

    const all = (allRows ?? []) as Array<{ date: string; status: string }>;
    let present = 0, absent = 0, late = 0, leave = 0;
    for (const r of all) {
      const s = (r.status || "").toLowerCase();
      if (s === "present") present++;
      else if (s === "absent") absent++;
      else if (s === "late") late++;
      else if (s === "leave") leave++;
    }
    const total = present + absent + late + leave;
    // Approved leave + present count fully; late counts half. Leave never hurts %.
    const effective_present = present + leave + late * 0.5;
    const percentage = total > 0 ? Math.round((effective_present / total) * 1000) / 10 : 0;

    // Monthly stats — last 6 months
    const monthly: Record<string, { present: number; absent: number; late: number; leave: number; total: number }> = {};
    for (const r of all) {
      const m = r.date.slice(0, 7); // YYYY-MM
      if (!monthly[m]) monthly[m] = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
      const s = (r.status || "").toLowerCase();
      if (s === "present") monthly[m].present++;
      else if (s === "absent") monthly[m].absent++;
      else if (s === "late") monthly[m].late++;
      else if (s === "leave") monthly[m].leave++;
      monthly[m].total++;
    }
    const monthly_stats = Object.entries(monthly)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 12)
      .map(([month, v]) => ({
        month,
        ...v,
        percentage: v.total > 0
          ? Math.round(((v.present + v.leave + v.late * 0.5) / v.total) * 1000) / 10
          : 0,
      }));

    const best_month = monthly_stats.length
      ? [...monthly_stats].sort((a, b) => b.percentage - a.percentage)[0]
      : null;

    // History — sorted desc, optionally scoped to month_start
    let q = sb
      .from("attendance_records")
      .select("date,status,reporting_teacher_name_snapshot")
      .eq("workspace_id", workspace_id)
      .eq("student_id", student_id)
      .order("date", { ascending: false })
      .limit(limit);
    if (monthStart && /^\d{4}-\d{2}-\d{2}$/.test(monthStart)) {
      const d = new Date(monthStart + "T00:00:00Z");
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      q = q.gte("date", monthStart).lt("date", isoDate(next));
    }
    const { data: history, error: histErr } = await q;
    if (histErr) throw histErr;

    // Current present streak (consecutive most-recent present days)
    const sortedDesc = [...all].sort((a, b) => (a.date < b.date ? 1 : -1));
    let streak = 0;
    for (const r of sortedDesc) {
      const s = (r.status || "").toLowerCase();
      if (s === "present" || s === "late" || s === "leave") streak++;
      else break;
    }

    // Trend — compare last 30 vs previous 30
    const today = new Date();
    const ms = 24 * 60 * 60 * 1000;
    const last30Cut = isoDate(new Date(today.getTime() - 30 * ms));
    const prev30Cut = isoDate(new Date(today.getTime() - 60 * ms));
    const inRange = (d: string, from: string, to: string) => d >= from && d < to;
    const todayISO = isoDate(today);
    let last30P = 0, last30T = 0, prev30P = 0, prev30T = 0;
    for (const r of all) {
      const s = (r.status || "").toLowerCase();
      const w = s === "present" || s === "leave" ? 1 : s === "late" ? 0.5 : 0;
      if (inRange(r.date, last30Cut, todayISO)) { last30T++; last30P += w; }
      else if (inRange(r.date, prev30Cut, last30Cut)) { prev30T++; prev30P += w; }
    }
    const last30Pct = last30T ? (last30P / last30T) * 100 : 0;
    const prev30Pct = prev30T ? (prev30P / prev30T) * 100 : 0;
    const trend_delta = Math.round((last30Pct - prev30Pct) * 10) / 10;
    const trend = trend_delta > 1 ? "up" : trend_delta < -1 ? "down" : "flat";

    const insights: { level: "info" | "warn" | "danger" | "success"; message: string }[] = [];
    if (percentage < 60) insights.push({ level: "danger", message: `Critical: attendance ${percentage}% — well below required 75%.` });
    else if (percentage < 75) insights.push({ level: "warn", message: `Attendance ${percentage}% is below the 75% threshold.` });
    else if (percentage >= 90) insights.push({ level: "success", message: `Excellent — ${percentage}% attendance this year.` });
    if (streak >= 7) insights.push({ level: "success", message: `🔥 ${streak}-day present streak. Keep it up.` });
    if (trend === "up") insights.push({ level: "success", message: `Trending up — +${trend_delta}% vs previous month.` });
    if (trend === "down") insights.push({ level: "warn", message: `Trending down — ${trend_delta}% vs previous month.` });
    if (best_month && best_month.percentage >= 95) insights.push({ level: "info", message: `Best month: ${best_month.month} at ${best_month.percentage}%.` });

    return new Response(JSON.stringify({
      ok: true,
      student: { id: studentRow.id, name: studentRow.name, class: studentRow.class, section: studentRow.section },
      percentage,
      present_days: present,
      absent_days: absent,
      late_days: late,
      leave_days: leave,
      total_days: total,
      streak,
      trend,
      trend_delta,
      best_month,
      monthly_stats,
      records: history ?? [],
      insights,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
