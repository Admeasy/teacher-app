"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTeacherStore } from "../store/teacherStore";
import { leaveApi } from "@/features/leave/api";
import { useLeaveRealtime } from "@/features/leave/useLeaveRealtime";
import { CreateLeaveModal } from "@/features/leave/CreateLeaveModal";
import { LeaveCard } from "@/features/leave/LeaveCard";
import { ReviewSheet } from "@/features/leave/ReviewSheet";
import type { LeaveRequest } from "@/features/leave/types";

export default function TeacherLeave() {
  const session = useTeacherStore((s) => s.session);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [review, setReview] = useState<LeaveRequest | null>(null);

  const workspace_id = session?.teacher.workspace_id ?? null;
  const teacher_id = session?.teacher.id ?? null;

  const inboxKey = useMemo(() => ["leaves", "teacher-inbox", workspace_id, teacher_id] as const, [workspace_id, teacher_id]);
  const mineKey = useMemo(() => ["leaves", "teacher-mine", workspace_id, teacher_id] as const, [workspace_id, teacher_id]);

  const { data: inbox = [] } = useQuery({
    queryKey: inboxKey, enabled: !!workspace_id && !!teacher_id,
    queryFn: async () => (await leaveApi.history({ workspace_id: workspace_id!, scope: "teacher-inbox", actor_id: teacher_id! })).requests,
  });
  const { data: mine = [] } = useQuery({
    queryKey: mineKey, enabled: !!workspace_id && !!teacher_id,
    queryFn: async () => (await leaveApi.history({ workspace_id: workspace_id!, scope: "requester", actor_id: teacher_id! })).requests,
  });

  useLeaveRealtime(workspace_id, inboxKey);
  useLeaveRealtime(workspace_id, mineKey);

  async function handleReview(action: "approve" | "reject", message: string | null) {
    if (!review || !workspace_id || !teacher_id) return;
    const res = await leaveApi.review({
      workspace_id, leave_id: review.id, action,
      reviewer_type: "teacher", reviewer_id: teacher_id,
      reviewer_name: session?.teacher.name ?? null,
      response_message: message,
    });
    qc.setQueryData<LeaveRequest[]>(inboxKey, (prev = []) => prev.map((l) => (l.id === res.request.id ? res.request : l)));
    qc.invalidateQueries({ queryKey: ["leaves"] });
  }

  async function handleCreate(payload: any) {
    if (!workspace_id || !teacher_id) return;
    const res = await leaveApi.createTeacher({
      workspace_id, teacher_id,
      leave_type: payload.leave_type, from_date: payload.from_date, to_date: payload.to_date, reason: payload.reason,
    });
    qc.setQueryData<LeaveRequest[]>(mineKey, (prev = []) => [res.request, ...prev]);
  }

  if (!session) return <div className="p-6 text-sm text-muted-foreground">Sign in to manage leaves.</div>;

  const pending = inbox.filter((l) => l.status === "pending");
  const reviewed = inbox.filter((l) => l.status !== "pending");

  return (
    <div className="p-4 sm:p-6 space-y-5 pb-24">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold">Leaves</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Review your students' requests and submit your own.</p>
      </header>

      <Tabs defaultValue="students">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="students">Students {pending.length > 0 && <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] px-1.5">{pending.length}</span>}</TabsTrigger>
          <TabsTrigger value="me">Me</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4 mt-4">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending</h2>
            {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
            {pending.map((l) => (
              <LeaveCard key={l.id} leave={l} showRequester onClick={() => setReview(l)} />
            ))}
          </section>
          {reviewed.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
              {reviewed.map((l) => <LeaveCard key={l.id} leave={l} showRequester />)}
            </section>
          )}
        </TabsContent>

        <TabsContent value="me" className="space-y-3 mt-4">
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Leave</Button>
          {mine.length === 0 && <p className="text-sm text-muted-foreground">No leave requests yet.</p>}
          {mine.map((l) => <LeaveCard key={l.id} leave={l} />)}
        </TabsContent>
      </Tabs>

      <CreateLeaveModal
        open={createOpen} onOpenChange={setCreateOpen}
        approverLabel="the principal"
        autoFill={{ name: session.teacher.name }}
        onSubmit={handleCreate}
      />
      <ReviewSheet leave={review} onClose={() => setReview(null)} onReview={handleReview} />
    </div>
  );
}
