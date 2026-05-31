import { supabase } from "@/lib/supabase";

const COOLDOWN_MS = 60 * 60 * 1000;

export async function generateProactiveNotifications(workspaceId: string) {
  const key = `admeasy:proactive:${workspaceId}`;
  const last = Number(localStorage.getItem(key) ?? 0);
  if (Date.now() - last < COOLDOWN_MS) return;

  const { data: students } = await supabase
    .from("students")
    .select("fee_status, attendance_pct, due")
    .eq("workspace_id", workspaceId);

  const rows = students ?? [];
  if (rows.length === 0) {
    localStorage.setItem(key, String(Date.now()));
    return;
  }

  const unpaid = rows.filter(s => s.fee_status === "unpaid" || s.fee_status === "partial");
  const totalDue = unpaid.reduce((sum, s) => sum + (Number(s.due) || 0), 0);
  const lowAtt = rows.filter(s => Number(s.attendance_pct) < 75);
  const critical = rows.filter(s => Number(s.attendance_pct) < 65 && (s.fee_status === "unpaid" || s.fee_status === "partial"));

  const inserts: any[] = [];
  if (unpaid.length > 0) {
    inserts.push({
      workspace_id: workspaceId,
      message: `${unpaid.length} students have pending fees — ₹${totalDue.toLocaleString("en-IN")} total due`,
      type: "fee", status: "unread",
    });
  }
  if (lowAtt.length > 0) {
    inserts.push({
      workspace_id: workspaceId,
      message: `${lowAtt.length} students below 75% attendance`,
      type: "attendance", status: "unread",
    });
  }
  if (critical.length > 0) {
    inserts.push({
      workspace_id: workspaceId,
      message: `⚠️ ${critical.length} students are both unpaid AND below 65% attendance — direct outreach recommended`,
      type: "system", status: "unread",
    });
  }

  if (inserts.length) await supabase.from("notifications").insert(inserts);
  localStorage.setItem(key, String(Date.now()));
}
