import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, CalendarDays } from "lucide-react";

interface Holiday {
  id: string;
  date: string | null;
  recurring_weekday: number | null;
  label: string;
  kind: string;
  note: string | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HolidaysPanel({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("school_holiday");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("holidays")
      .select("*").eq("workspace_id", workspaceId)
      .order("recurring_weekday", { ascending: true, nullsFirst: false })
      .order("date", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as any[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { if (workspaceId) load(); /* eslint-disable-next-line */ }, [workspaceId]);

  async function add() {
    if (!label.trim()) return toast.error("Add a label");
    if (!date) return toast.error("Pick a date");
    setBusy(true);
    const { error } = await supabase.from("holidays").insert({
      workspace_id: workspaceId, label: label.trim(), date, kind,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    setLabel(""); setDate(""); setKind("school_holiday");
    toast.success("Holiday added");
    load();
  }

  async function addWeekly(weekday: number) {
    const { error } = await supabase.from("holidays").insert({
      workspace_id: workspaceId, recurring_weekday: weekday,
      label: WEEKDAYS[weekday], kind: "weekly_off",
    } as any);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  const weeklyOffs = rows.filter(r => r.recurring_weekday !== null);
  const dated = rows.filter(r => r.date !== null);

  return (
    <section className="glass rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={16} className="text-primary" />
        <h2 className="text-base font-semibold">Holidays & Vacations</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Days listed here are hidden from teacher attendance and shown as holidays on student & teacher apps.
      </p>

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Weekly off</div>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => {
            const active = weeklyOffs.some(w => w.recurring_weekday === i);
            const row = weeklyOffs.find(w => w.recurring_weekday === i);
            return (
              <button
                key={i}
                onClick={() => active && row ? remove(row.id) : addWeekly(i)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >{d}</button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Add specific holiday / vacation</div>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="bg-surface-2 rounded-lg px-3 py-2 text-sm flex-1 outline-none"
          />
          <input
            value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Diwali)"
            className="bg-surface-2 rounded-lg px-3 py-2 text-sm flex-1 outline-none"
          />
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="bg-surface-2 rounded-lg px-3 py-2 text-sm outline-none">
            <option value="school_holiday">Holiday</option>
            <option value="vacation">Vacation</option>
          </select>
          <button onClick={add} disabled={busy}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
          Scheduled ({dated.length})
        </div>
        {loading ? (
          <div className="text-xs text-muted-foreground py-3">Loading…</div>
        ) : !dated.length ? (
          <div className="text-xs text-muted-foreground py-3">No scheduled holidays yet.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {dated.map(h => (
              <li key={h.id} className="flex items-center justify-between bg-surface-2/40 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{h.label}</span>
                  <span className="text-muted-foreground text-xs ml-2">
                    {h.date} · {h.kind === "vacation" ? "Vacation" : "Holiday"}
                  </span>
                </div>
                <button onClick={() => remove(h.id)} className="text-muted-foreground hover:text-rose-500">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
