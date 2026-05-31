import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Wand2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi, generatePassword, passwordStrength } from "@/lib/adminApi";
import { supabase } from "@/integrations/supabase/client";

const SCHOOL_TYPES = ["Private", "Government", "Semi-Government", "Other"];
const BOARDS       = ["CBSE", "ICSE", "State Board", "IB", "Other"];
const SIZES        = ["Small", "Medium", "Large"];

type Props = { open: boolean; onClose: () => void; onSaved: () => void; existing?: any };

const blankForm = () => ({
  school_id: "", password: "", confirm: "", account_status: "active",
  school_info: { name: "", type: "", board: "", size: "", year: "", email: "", phone: "", website: "" },
  location:    { state: "", city: "", address: "", pincode: "", landmark: "", maps_link: "" },
  principal:   { name: "", phone: "", email: "" },
  statistics:  { students: "", teachers: "", classrooms: "", hostel: false, transport: false },
  media:       { logo_url: "", building_images: "", notes: "" },
});

export default function AddSchoolModal({ open, onClose, onSaved, existing }: Props) {
  const isEdit = !!existing;
  const [form, setForm] = useState<any>(blankForm());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveCounts, setLiveCounts] = useState<{ students: number | null; teachers: number | null }>({ students: null, teachers: null });

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setForm({
        ...blankForm(),
        ...existing,
        password: "", confirm: "",
        school_info: { ...blankForm().school_info, ...(existing.school_info ?? {}) },
        location:    { ...blankForm().location,    ...(existing.location    ?? {}) },
        principal:   { ...blankForm().principal,   ...(existing.principal   ?? {}) },
        statistics:  { ...blankForm().statistics,  ...(existing.statistics  ?? {}) },
        media:       { ...blankForm().media,       ...(existing.media       ?? {}) },
      });
      // Pull live counts from the school's actual student/teacher tables
      (async () => {
        const ws = existing.school_id;
        const [s, t] = await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
          supabase.from("teachers").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
        ]);
        setLiveCounts({ students: s.count ?? 0, teachers: t.count ?? 0 });
      })();
    } else {
      setForm(blankForm());
      setLiveCounts({ students: null, teachers: null });
    }
  }, [open, existing]);

  function set(section: string, field: string, value: any) {
    setForm((f: any) => ({ ...f, [section]: { ...f[section], [field]: value } }));
  }

  const strength = passwordStrength(form.password);

  async function save() {
    if (!isEdit) {
      if (!form.school_id || form.school_id.length < 3) return toast.error("School ID required (min 3 chars)");
      if (!form.password || form.password.length < 8)   return toast.error("Password too short (min 8 chars)");
      if (form.password !== form.confirm)                return toast.error("Passwords don't match");
    }
    if (!form.school_info.name) return toast.error("School name is required");

    setBusy(true);
    try {
      const payload = {
        school_id: form.school_id,
        password: form.password,
        account_status: form.account_status,
        school_info: form.school_info,
        location: form.location,
        principal: form.principal,
        statistics: {
          ...form.statistics,
          // students & teachers are derived live from imported sheets — never store static counts
          classrooms: Number(form.statistics.classrooms) || 0,
        },
        media: form.media,
      };
      if (isEdit) {
        await adminApi.update(existing.id, payload);
        toast.success("School updated");
      } else {
        await adminApi.create(payload);
        toast.success("School added — login provisioned, welcome email queued");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setBusy(false); }
  }

  function copyId() {
    if (!form.school_id) return;
    navigator.clipboard.writeText(form.school_id);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-3xl max-h-[92vh] glass-strong rounded-2xl flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
                <div>
                  <h2 className="text-base font-semibold">{isEdit ? "Edit School" : "Add a New School"}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Onboard a school onto the Admeasy platform
                  </p>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/40">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-auto px-6 py-5 space-y-7">

                {/* SECTION 1 — ACCOUNT */}
                <Section title="Account Details" hint="School login credentials">
                  <Grid>
                    <Field label="School ID *">
                      <div className="flex gap-2">
                        <input
                          disabled={isEdit}
                          value={form.school_id}
                          onChange={(e) => setForm({ ...form, school_id: e.target.value.replace(/\s/g, "") })}
                          className={input}
                          placeholder="Schoolid0042"
                        />
                        <button type="button" onClick={copyId} className="px-3 rounded-lg border border-border/40 hover:bg-muted/40 text-xs">
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </Field>
                    <Field label="Account Status">
                      <select value={form.account_status} onChange={(e) => setForm({ ...form, account_status: e.target.value })} className={input}>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </Field>
                    {!isEdit && (
                      <>
                        <Field label="Password *">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={form.password}
                              onChange={(e) => setForm({ ...form, password: e.target.value })}
                              className={input}
                              placeholder="At least 8 characters"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const p = generatePassword();
                                setForm({ ...form, password: p, confirm: p });
                              }}
                              className="px-3 rounded-lg border border-border/40 hover:bg-muted/40 text-xs flex items-center gap-1"
                            >
                              <Wand2 className="h-3.5 w-3.5" /> Gen
                            </button>
                          </div>
                          {form.password && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    strength.score < 2 ? "bg-destructive" : strength.score < 3 ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${(strength.score + 1) * 20}%` }}
                                />
                              </div>
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{strength.label}</span>
                            </div>
                          )}
                        </Field>
                        <Field label="Confirm Password *">
                          <input
                            type="text"
                            value={form.confirm}
                            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                            className={input}
                          />
                        </Field>
                      </>
                    )}
                  </Grid>
                </Section>

                {/* SECTION 2 — SCHOOL INFO */}
                <Section title="School Information">
                  <Grid>
                    <Field label="School Name *"><input value={form.school_info.name} onChange={(e) => set("school_info", "name", e.target.value)} className={input} /></Field>
                    <Field label="School Type"><Select value={form.school_info.type} onChange={(v) => set("school_info", "type", v)} options={SCHOOL_TYPES} /></Field>
                    <Field label="Board Type"><Select value={form.school_info.board} onChange={(v) => set("school_info", "board", v)} options={BOARDS} /></Field>
                    <Field label="School Size"><Select value={form.school_info.size} onChange={(v) => set("school_info", "size", v)} options={SIZES} /></Field>
                    <Field label="Established Year"><input type="number" value={form.school_info.year} onChange={(e) => set("school_info", "year", e.target.value)} className={input} /></Field>
                    <Field label="School Email"><input type="email" value={form.school_info.email} onChange={(e) => set("school_info", "email", e.target.value)} className={input} /></Field>
                    <Field label="School Phone"><input value={form.school_info.phone} onChange={(e) => set("school_info", "phone", e.target.value)} className={input} /></Field>
                    <Field label="Website URL"><input value={form.school_info.website} onChange={(e) => set("school_info", "website", e.target.value)} className={input} /></Field>
                  </Grid>
                </Section>

                {/* SECTION 3 — LOCATION */}
                <Section title="Location">
                  <Grid>
                    <Field label="State"><input value={form.location.state} onChange={(e) => set("location", "state", e.target.value)} className={input} /></Field>
                    <Field label="City"><input value={form.location.city} onChange={(e) => set("location", "city", e.target.value)} className={input} /></Field>
                    <Field label="Pincode"><input value={form.location.pincode} onChange={(e) => set("location", "pincode", e.target.value)} className={input} /></Field>
                    <Field label="Landmark"><input value={form.location.landmark} onChange={(e) => set("location", "landmark", e.target.value)} className={input} /></Field>
                    <Field label="Full Address" full>
                      <textarea rows={2} value={form.location.address} onChange={(e) => set("location", "address", e.target.value)} className={input} />
                    </Field>
                    <Field label="Google Maps Link" full><input value={form.location.maps_link} onChange={(e) => set("location", "maps_link", e.target.value)} className={input} /></Field>
                  </Grid>
                </Section>

                {/* SECTION 4 — PRINCIPAL */}
                <Section title="Principal">
                  <Grid>
                    <Field label="Principal Name"><input value={form.principal.name} onChange={(e) => set("principal", "name", e.target.value)} className={input} /></Field>
                    <Field label="Principal Phone"><input value={form.principal.phone} onChange={(e) => set("principal", "phone", e.target.value)} className={input} /></Field>
                    <Field label="Principal Email" full><input type="email" value={form.principal.email} onChange={(e) => set("principal", "email", e.target.value)} className={input} /></Field>
                  </Grid>
                </Section>

                {/* SECTION 5 — STATISTICS (students/teachers derived live from sheets) */}
                <Section title="Statistics" hint="Student & teacher counts are derived live from imported sheets — not editable">
                  <Grid>
                    <Field label="Total Students (live)">
                      <div className={`${input} flex items-center justify-between text-foreground`}>
                        <span className="tabular-nums font-semibold">
                          {isEdit ? (liveCounts.students ?? "…") : "—"}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">auto</span>
                      </div>
                    </Field>
                    <Field label="Total Teachers (live)">
                      <div className={`${input} flex items-center justify-between text-foreground`}>
                        <span className="tabular-nums font-semibold">
                          {isEdit ? (liveCounts.teachers ?? "…") : "—"}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">auto</span>
                      </div>
                    </Field>
                    <Field label="Classrooms"><input type="number" value={form.statistics.classrooms} onChange={(e) => set("statistics", "classrooms", e.target.value)} className={input} /></Field>
                    <Field label="Facilities">
                      <div className="flex gap-4 pt-2">
                        <label className="flex items-center gap-2 text-xs text-foreground">
                          <input type="checkbox" checked={form.statistics.hostel} onChange={(e) => set("statistics", "hostel", e.target.checked)} />
                          Hostel
                        </label>
                        <label className="flex items-center gap-2 text-xs text-foreground">
                          <input type="checkbox" checked={form.statistics.transport} onChange={(e) => set("statistics", "transport", e.target.checked)} />
                          Transport
                        </label>
                      </div>
                    </Field>
                  </Grid>
                </Section>


                {/* SECTION 6 — MEDIA */}
                <Section title="Media & Notes" hint="Optional">
                  <Grid>
                    <Field label="Logo URL" full><input value={form.media.logo_url} onChange={(e) => set("media", "logo_url", e.target.value)} className={input} placeholder="https://..." /></Field>
                    <Field label="Building Images (comma-separated URLs)" full>
                      <textarea rows={2} value={form.media.building_images} onChange={(e) => set("media", "building_images", e.target.value)} className={input} />
                    </Field>
                    <Field label="Internal Remarks" full>
                      <textarea rows={3} value={form.media.notes} onChange={(e) => set("media", "notes", e.target.value)} className={input} />
                    </Field>
                  </Grid>
                </Section>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border/40 flex items-center justify-end gap-3 bg-background/50">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={busy}
                  className="px-5 py-2 rounded-lg text-sm font-semibold gradient-violet text-white disabled:opacity-50 flex items-center gap-2"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEdit ? "Save Changes" : "Add School"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const input = "w-full glass rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet/50 placeholder:text-muted-foreground/60";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">Select…</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
