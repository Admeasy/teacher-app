"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { useTeacherSession } from "../hooks/useTeacherSession";
import { useTeacherStore } from "../store/teacherStore";
import { updateProfile } from "../services/teacher";

export default function Profile() {
  const { teacher, session } = useTeacherSession();
  const setSession = useTeacherStore((s) => s.setSession);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(teacher?.name || "");
  const [subject, setSubject] = useState(teacher?.subject || "");
  const [phone, setPhone] = useState(teacher?.phone || "");

  useEffect(() => {
    setName(teacher?.name || "");
    setSubject(teacher?.subject || "");
    setPhone(teacher?.phone || "");
  }, [teacher?.id]);

  if (!teacher || !session) return null;

  const initials = (teacher.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const raw: unknown = teacher.assigned_classes;
  const classes: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === "string"
      ? (raw as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  async function save() {
    if (!teacher?.teacher_id) return;
    if (!name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      const updated = await updateProfile(teacher.teacher_id, {
        name: name.trim(),
        subject: subject.trim(),
        phone: phone.trim(),
      });
      if (updated) {
        setSession({ token: session.token, teacher: updated as any });
        toast.success("Profile updated");
        setEditing(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-2xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl gradient-violet grid place-items-center text-white text-xl font-semibold glow-violet">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold truncate">{teacher.name}</div>
          <div className="text-sm text-muted-foreground">{teacher.subject || "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">ID: {teacher.teacher_id}</div>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-1.5 hover:text-foreground text-muted-foreground">
            <Pencil size={12} /> Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="glass rounded-lg px-3 py-2 text-xs flex items-center gap-1.5 text-muted-foreground">
              <X size={12} /> Cancel
            </button>
            <button onClick={save} disabled={busy} className="gradient-violet text-white rounded-lg px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
            </button>
          </div>
        )}
      </motion.div>

      <Section title="Teacher info">
        {editing ? (
          <div className="flex flex-col gap-3 py-2">
            <Input label="Name" value={name} onChange={setName} />
            <Input label="Subject" value={subject} onChange={setSubject} />
            <Input label="Phone" value={phone} onChange={setPhone} />
            <Row label="Email" value={teacher.email} />
            <Row label="Teacher ID" value={teacher.teacher_id} />
          </div>
        ) : (
          <>
            <Row label="Name" value={teacher.name} />
            <Row label="Teacher ID" value={teacher.teacher_id} />
            <Row label="Subject" value={teacher.subject} />
            <Row label="Email" value={teacher.email} />
            <Row label="Phone" value={teacher.phone || "—"} />
          </>
        )}
      </Section>

      <Section title="Assigned classes">
        {classes.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">No classes assigned yet.</div>
        ) : (
          <div className="flex flex-wrap gap-2 py-1">
            {classes.map((c) => (
              <span key={c} className="glass rounded-md px-2.5 py-1 text-xs">{c}</span>
            ))}
          </div>
        )}
      </Section>

      <Section title="School">
        <Row label="Workspace" value={teacher.workspace_id} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{title}</div>
      <div className="flex flex-col divide-y divide-border/30">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate ml-4">{value}</span>
    </div>
  );
}
function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glass rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-violet/50"
      />
    </label>
  );
}
