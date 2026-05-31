import { useState } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { LEAVE_TYPE_LABELS, type LeaveType, type LeaveRequest } from "./types";

export interface AutoFill {
  name?: string | null;
  roll?: string | null;
  klass?: string | null;
  approverName?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  autoFill: AutoFill;
  approverLabel: string;
  submitting?: boolean;
  onSubmit: (payload: {
    leave_type: LeaveType; from_date: string; to_date: string; reason: string;
    name: string; roll?: string; klass?: string;
  }) => Promise<LeaveRequest | void>;
}

const today = () => new Date().toISOString().slice(0, 10);

export function CreateLeaveModal({ open, onOpenChange, autoFill, approverLabel, submitting, onSubmit }: Props) {
  const [name, setName] = useState(autoFill.name ?? "");
  const [roll, setRoll] = useState(autoFill.roll ?? "");
  const [klass, setKlass] = useState(autoFill.klass ?? "");
  const [leaveType, setLeaveType] = useState<LeaveType>("sick");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed auto-fill values when modal opens (in case profile loaded after first mount)
  function onOpenChangeWrapped(v: boolean) {
    if (v) {
      setName((cur) => cur || autoFill.name || "");
      setRoll((cur) => cur || autoFill.roll || "");
      setKlass((cur) => cur || autoFill.klass || "");
    }
    onOpenChange(v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast({ title: "Name required", variant: "destructive" });
    if (!reason.trim() || reason.trim().length < 3) return toast({ title: "Add a reason (min 3 chars)", variant: "destructive" });
    if (to < from) return toast({ title: "End date must be after start date", variant: "destructive" });
    setBusy(true);
    try {
      await onSubmit({
        leave_type: leaveType, from_date: from, to_date: to, reason: reason.trim(),
        name: name.trim(), roll: roll.trim() || undefined, klass: klass.trim() || undefined,
      });
      toast({ title: "Leave request submitted", description: `Awaiting approval from ${approverLabel}.` });
      setReason(""); setLeaveType("sick"); setFrom(today()); setTo(today());
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Could not submit", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeWrapped}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>New Leave Request</DialogTitle>
          <DialogDescription>Goes to {approverLabel} for approval.</DialogDescription>
        </DialogHeader>

        <motion.form
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit} className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            {("roll" in autoFill) && (
              <div className="space-y-1.5">
                <Label>Roll Number</Label>
                <Input value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="Optional" />
              </div>
            )}
            {("klass" in autoFill) && (
              <div className="space-y-1.5">
                <Label>Class</Label>
                <Input value={klass} onChange={(e) => setKlass(e.target.value)} placeholder="e.g. 10-A" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              rows={3} maxLength={1000}
              placeholder="Briefly describe the reason for leave…"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy || submitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || submitting}>
              {busy || submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </motion.form>
      </DialogContent>
    </Dialog>
  );
}
