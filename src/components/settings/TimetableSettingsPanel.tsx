import { useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Plus, Save, Trash2, Star, BookOpen, Trophy } from "lucide-react";
import { DEFAULT_SETTINGS, buildSchedule, listSettings, type TimetableSettings, type ActivityConfig, type SportsConfig } from "@/lib/timetableSettings";

const DAY_OPTIONS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ALL_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function TimetableSettingsPanel() {
  const { workspaceId } = useWorkspace();
  const [profiles, setProfiles] = useState<TimetableSettings[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<TimetableSettings, "id" | "workspace_id">>({ ...DEFAULT_SETTINGS });
  const [saving, setSaving] = useState(false);
  const [customDuration, setCustomDuration] = useState(false);
  const [ptTeachers, setPtTeachers] = useState<Array<{ id: string; name: string; subject?: string | null }>>([]);

  async function reload() {
    if (!workspaceId) return;
    const rows = await listSettings(workspaceId);
    setProfiles(rows);
    if (rows.length && !activeId) {
      const active = rows.find(r => r.is_active) ?? rows[0];
      pick(active);
    }
  }
  useEffect(() => { reload(); }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    supabase.from("teachers").select("id, name, subject").eq("workspace_id", workspaceId).order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as any[];
        rows.sort((a, b) => {
          const isPe = (s: string) => /\b(pe|p\.e|physical|sport|pt)\b/i.test(s || "");
          return (isPe(b.subject) ? 1 : 0) - (isPe(a.subject) ? 1 : 0);
        });
        setPtTeachers(rows as any);
      });
  }, [workspaceId]);

  function pick(p: TimetableSettings) {
    setActiveId(p.id);
    setDraft({
      name: p.name, is_active: p.is_active, school_level: p.school_level ?? "All", start_time: p.start_time, period_duration: p.period_duration,
      periods_per_day: p.periods_per_day, short_break_after: p.short_break_after, short_break_duration: p.short_break_duration,
      lunch_break_after: p.lunch_break_after, lunch_break_duration: p.lunch_break_duration, working_days: p.working_days,
      library_config: p.library_config ?? DEFAULT_SETTINGS.library_config,
      sports_config: p.sports_config ?? DEFAULT_SETTINGS.sports_config,
    });
    setCustomDuration(![40, 45, 50].includes(p.period_duration));
  }

  function newProfile() {
    setActiveId(null);
    setDraft({ ...DEFAULT_SETTINGS, name: `Schedule ${profiles.length + 1}`, is_active: profiles.length === 0 });
    setCustomDuration(false);
  }

  async function save() {
    if (!workspaceId) return;
    setSaving(true);
    const payload = { ...draft, workspace_id: workspaceId };
    const { school_level: _sl, library_config: _lc, sports_config: _sc, ...basePayload } = payload as any;
    const isSchemaCacheMiss = (error: any) => /school_level|library_config|sports_config|schema cache|column/i.test(error?.message ?? "");
    if (draft.is_active) {
      await supabase.from("timetable_settings").update({ is_active: false }).eq("workspace_id", workspaceId);
    }
    if (activeId) {
      let { error } = await supabase.from("timetable_settings").update(payload as any).eq("id", activeId);
      if (error && isSchemaCacheMiss(error)) {
        const retry = await supabase.from("timetable_settings").update(basePayload as any).eq("id", activeId);
        error = retry.error;
        if (!error) await saveProfileMeta(activeId, draft);
      }
      if (error) toast.error(error.message); else toast.success("Schedule saved");
    } else {
      let { data, error } = await supabase.from("timetable_settings").insert(payload as any).select("id").maybeSingle();
      if (error && isSchemaCacheMiss(error)) {
        const retry = await supabase.from("timetable_settings").insert(basePayload as any).select("id").maybeSingle();
        data = retry.data; error = retry.error;
        if (!error && data?.id) await saveProfileMeta(data.id, draft);
      }
      if (error) toast.error(error.message); else { toast.success("Schedule created"); setActiveId(data?.id ?? null); }
    }
    setSaving(false);
    reload();
  }

  async function remove() {
    if (!activeId) return;
    if (!confirm("Delete this schedule?")) return;
    const { error } = await supabase.from("timetable_settings").delete().eq("id", activeId);
    if (error) toast.error(error.message); else { toast.success("Deleted"); setActiveId(null); reload(); newProfile(); }
  }

  async function activate() {
    if (!workspaceId || !activeId) return;
    await supabase.from("timetable_settings").update({ is_active: false }).eq("workspace_id", workspaceId);
    await supabase.from("timetable_settings").update({ is_active: true }).eq("id", activeId);
    toast.success("Activated"); reload();
  }

  async function saveProfileMeta(profileId: string, next: Omit<TimetableSettings, "id" | "workspace_id">) {
    if (!workspaceId) return;
    const { data } = await supabase.from("workspaces").select("settings").eq("id", workspaceId).maybeSingle();
    const settings = ((data?.settings as any) ?? {}) as any;
    const timetable_profile_meta = {
      ...(settings.timetable_profile_meta ?? {}),
      [profileId]: {
        school_level: next.school_level ?? "All",
        library_config: next.library_config ?? DEFAULT_SETTINGS.library_config,
        sports_config: next.sports_config ?? DEFAULT_SETTINGS.sports_config,
      },
    };
    await supabase.from("workspaces").update({ settings: { ...settings, timetable_profile_meta } }).eq("id", workspaceId);
  }

  const schedule = buildSchedule(draft);

  return (
    <section className="border border-border bg-card rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-display text-lg text-foreground">Timetable Settings</div>
        <div className="flex gap-2 flex-wrap">
          {profiles.map(p => (
            <button key={p.id} onClick={() => pick(p)}
              className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border flex items-center gap-1.5 ${activeId === p.id ? "bg-violet text-white border-violet" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {p.is_active && <Star size={10} className="fill-current" />}
              {p.name}
            </button>
          ))}
          <button onClick={newProfile} className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border border-dashed border-border text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus size={12} /> New</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Profile name">
          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="School start time">
          <input type="time" value={draft.start_time} onChange={e => setDraft({ ...draft, start_time: e.target.value })} className={inputCls} />
        </Field>

        <Field label="Period duration">
          <div className="flex gap-2 flex-wrap">
            {[40, 45, 50].map(n => (
              <button key={n} onClick={() => { setCustomDuration(false); setDraft({ ...draft, period_duration: n }); }}
                className={`px-3 py-1.5 text-[11px] font-mono uppercase rounded border ${!customDuration && draft.period_duration === n ? "bg-violet text-white border-violet" : "border-border text-muted-foreground hover:text-foreground"}`}>{n} min</button>
            ))}
            <button onClick={() => setCustomDuration(true)}
              className={`px-3 py-1.5 text-[11px] font-mono uppercase rounded border ${customDuration ? "bg-violet text-white border-violet" : "border-border text-muted-foreground hover:text-foreground"}`}>Custom</button>
            {customDuration && (
              <input type="number" min={20} max={120} value={draft.period_duration} onChange={e => setDraft({ ...draft, period_duration: +e.target.value || 45 })}
                className={`${inputCls} w-24`} />
            )}
          </div>
        </Field>

        <Field label="Periods per day">
          <input type="number" min={1} max={12} value={draft.periods_per_day} onChange={e => setDraft({ ...draft, periods_per_day: +e.target.value || 8 })} className={inputCls} />
        </Field>

        <Field label="Short break after period">
          <div className="flex gap-2">
            <input type="number" min={0} max={12} value={draft.short_break_after} onChange={e => setDraft({ ...draft, short_break_after: +e.target.value || 0 })} className={`${inputCls} w-24`} />
            <input type="number" min={5} max={60} value={draft.short_break_duration} onChange={e => setDraft({ ...draft, short_break_duration: +e.target.value || 15 })} className={`${inputCls} w-24`} />
            <span className="self-center text-[11px] text-muted-foreground">min</span>
          </div>
        </Field>
        <Field label="Lunch break after period">
          <div className="flex gap-2">
            <input type="number" min={0} max={12} value={draft.lunch_break_after} onChange={e => setDraft({ ...draft, lunch_break_after: +e.target.value || 0 })} className={`${inputCls} w-24`} />
            <input type="number" min={10} max={90} value={draft.lunch_break_duration} onChange={e => setDraft({ ...draft, lunch_break_duration: +e.target.value || 30 })} className={`${inputCls} w-24`} />
            <span className="self-center text-[11px] text-muted-foreground">min</span>
          </div>
        </Field>

        <Field label="Working days">
          <div className="flex gap-2 flex-wrap">
            {DAY_OPTIONS.map(d => {
              const on = draft.working_days.includes(d);
              return (
                <button key={d} onClick={() => setDraft({ ...draft, working_days: on ? draft.working_days.filter(x => x !== d) : [...draft.working_days, d] })}
                  className={`w-12 h-9 font-mono text-xs rounded border ${on ? "bg-violet text-white border-violet" : "border-border text-muted-foreground hover:text-foreground"}`}>{d}</button>
              );
            })}
          </div>
        </Field>

        <Field label="Applies to (school level)">
          <div className="flex gap-2 flex-wrap">
            {(["All", "Montessori", "Primary", "Middle", "Secondary", "Senior Secondary"] as const).map(lvl => {
              const on = (draft.school_level ?? "All") === lvl;
              return (
                <button key={lvl} onClick={() => setDraft({ ...draft, school_level: lvl })}
                  className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border ${on ? "bg-violet text-white border-violet" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {lvl === "Montessori" ? "🧸" : lvl === "Primary" ? "🎒" : lvl === "Middle" ? "📚" : lvl === "Secondary" ? "🎓" : lvl === "Senior Secondary" ? "🏫" : "🌐"} {lvl}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Active schedule">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />
            Use this profile for matching classes
          </label>
        </Field>
      </div>

      <ActivitySection
        title="Library Periods"
        icon={<BookOpen size={14} />}
        config={draft.library_config ?? DEFAULT_SETTINGS.library_config!}
        onChange={cfg => setDraft({ ...draft, library_config: cfg })}
        frequencyOptions={[
          { value: "weekly", label: "Once a week" },
          { value: "fortnightly", label: "Fortnightly" },
        ]}
        periodsPerDay={draft.periods_per_day}
      />

      <ActivitySection
        title="Sports / PT Periods"
        icon={<Trophy size={14} />}
        config={(draft.sports_config ?? DEFAULT_SETTINGS.sports_config!) as ActivityConfig}
        onChange={cfg => setDraft({ ...draft, sports_config: { ...(draft.sports_config ?? DEFAULT_SETTINGS.sports_config!), ...cfg } as SportsConfig })}
        frequencyOptions={[
          { value: "weekly", label: "Once a week" },
          { value: "twice_weekly", label: "Twice a week" },
          { value: "thrice_weekly", label: "Three times a week" },
        ]}
        periodsPerDay={draft.periods_per_day}
        extra={
          <Field label="PT Teacher">
            <select
              value={draft.sports_config?.teacher_id ?? ""}
              onChange={e => setDraft({ ...draft, sports_config: { ...(draft.sports_config ?? DEFAULT_SETTINGS.sports_config!), teacher_id: e.target.value || null } as SportsConfig })}
              className={inputCls}
            >
              <option value="">— None —</option>
              {ptTeachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.subject ? ` · ${t.subject}` : ""}</option>
              ))}
            </select>
          </Field>
        }
      />


      {/* Preview */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Live Preview</div>
        <div className="flex flex-wrap gap-1.5">
          {schedule.map((s, i) => (
            <div key={i} className={`px-2 py-1.5 rounded text-[10px] font-mono border ${
              s.kind === "period" ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200"
              : s.kind === "lunch" ? "bg-orange-100 dark:bg-orange-950/40 border-orange-300 text-orange-800 dark:text-orange-200"
              : "bg-amber-100 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-200"
            }`}>
              {s.kind === "period" ? `P${s.period}: ${s.start}–${s.end}` : `${s.kind === "lunch" ? "🍽" : "☕"} ${s.label}`}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 gradient-violet text-white font-mono text-[10px] uppercase tracking-widest font-semibold rounded-lg hover:glow-violet-strong transition-all disabled:opacity-50 flex items-center gap-1.5">
          <Save size={12} /> {saving ? "Saving…" : activeId ? "Save changes" : "Create schedule"}
        </button>
        {activeId && !draft.is_active && (
          <button onClick={activate}
            className="px-4 py-2 border border-border text-foreground font-mono text-[10px] uppercase tracking-widest rounded-lg hover:bg-surface-2 flex items-center gap-1.5">
            <Star size={12} /> Make active
          </button>
        )}
        {activeId && (
          <button onClick={remove}
            className="px-4 py-2 border border-destructive/40 text-destructive font-mono text-[10px] uppercase tracking-widest rounded-lg hover:bg-destructive/10 flex items-center gap-1.5">
            <Trash2 size={12} /> Delete
          </button>
        )}
      </div>
    </section>
  );
}

const inputCls = "bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-violet/50 transition-all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ActivitySection({
  title, icon, config, onChange, frequencyOptions, periodsPerDay, extra,
}: {
  title: string;
  icon: React.ReactNode;
  config: ActivityConfig;
  onChange: (cfg: ActivityConfig) => void;
  frequencyOptions: Array<{ value: ActivityConfig["frequency"]; label: string }>;
  periodsPerDay: number;
  extra?: React.ReactNode;
}) {
  const toggleClass = (n: number) => {
    const has = config.applies_to_classes.includes(n);
    onChange({
      ...config,
      applies_to_classes: has ? config.applies_to_classes.filter(x => x !== n) : [...config.applies_to_classes, n].sort((a, b) => a - b),
    });
  };
  return (
    <div className="border border-border/60 rounded-xl p-4 bg-surface-2/40 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-foreground font-mono text-[11px] uppercase tracking-widest">
          {icon} {title}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={config.enabled} onChange={e => onChange({ ...config, enabled: e.target.checked })} />
          Enabled
        </label>
      </div>
      {config.enabled && (
        <>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Applies to classes</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CLASSES.map(n => {
                const on = config.applies_to_classes.includes(n);
                return (
                  <button key={n} type="button" onClick={() => toggleClass(n)}
                    className={`w-9 h-8 font-mono text-[11px] rounded border ${on ? "bg-violet text-white border-violet" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Frequency">
              <select value={config.frequency} onChange={e => onChange({ ...config, frequency: e.target.value as any })} className={inputCls}>
                {frequencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Preferred day">
              <select value={config.preferred_day ?? ""} onChange={e => onChange({ ...config, preferred_day: e.target.value || null })} className={inputCls}>
                <option value="">Any</option>
                {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Preferred period">
              <select value={config.preferred_period ?? ""} onChange={e => onChange({ ...config, preferred_period: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
                <option value="">Any</option>
                {Array.from({ length: periodsPerDay }, (_, i) => i + 1).map(p => <option key={p} value={p}>Period {p}</option>)}
              </select>
            </Field>
          </div>
          {extra}
        </>
      )}
    </div>
  );
}
