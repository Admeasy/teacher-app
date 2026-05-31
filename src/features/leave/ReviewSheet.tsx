import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { LeaveRequest } from "./types";
import { LeaveCard } from "./LeaveCard";

interface Props {
  leave: LeaveRequest | null;
  onClose: () => void;
  onReview: (action: "approve" | "reject", message: string | null) => Promise<void>;
}

export function ReviewSheet({ leave, onClose, onReview }: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    try {
      await onReview(action, message.trim() ? message.trim() : null);
      toast({ title: action === "approve" ? "Leave approved" : "Leave rejected" });
      setMessage("");
      onClose();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={!!leave} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Request</DialogTitle>
          <DialogDescription>Approve or reject. Optionally add a short message.</DialogDescription>
        </DialogHeader>
        {leave && (
          <div className="space-y-4">
            <LeaveCard leave={leave} showRequester />
            <div className="space-y-1.5">
              <Label>Message (optional)</Label>
              <Textarea
                rows={3} maxLength={1000} placeholder="e.g. Take care and recover soon."
                value={message} onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline" className="flex-1" disabled={!!busy}
                onClick={() => act("reject")}
              >
                <X className="h-4 w-4 mr-1" /> {busy === "reject" ? "Rejecting…" : "Reject"}
              </Button>
              <Button
                className="flex-1" disabled={!!busy}
                onClick={() => act("approve")}
              >
                <Check className="h-4 w-4 mr-1" /> {busy === "approve" ? "Approving…" : "Approve"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
