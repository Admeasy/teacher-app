import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { invokeExternal } from "@/lib/extFn";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Trash2,
  Mic,
  MicOff,
  Phone,
  Pencil,
  X,
  Bug,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sparkles,
  Plus,
  History,
  MessageSquare,
  UserPlus,
  FileDown,
  FileText,
  HelpCircle,
  Check,
  Brain,
  Terminal,
} from "lucide-react";
import AdmeasyLogo from "@/components/ui/AdmeasyLogo";
import ThemeToggle from "@/components/ui/ThemeToggle";
import jsPDF from "jspdf";

import ExecutionCard from "@/components/ui/ExecutionCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConversation, useConversations } from "@/hooks/useConversation";
import { sliceContext } from "@/lib/intentSlice";
import { detectEmailIntent, detectCallIntent, detectOperationalStudentIntent } from "@/lib/aiIntent";
import { useAITerminal, Mode, LogLine, CallQueueItem, CallStatus, DebugEntry } from "@/stores/aiTerminalStore";
import {
  parseTimetableCommand, isTimetableGenerateIntent,
  generateTimetable, saveTimetable, exportTimetableCsv, WeekTimetable,
} from "@/lib/timetableAi";
import InlineTimetablePreviewCard from "@/components/ai/InlineTimetablePreviewCard";
import AgenticSummary from "@/components/AgenticSummary";
import { streamForClass, listSettings, getSettingsForClass, type TimetableSettings } from "@/lib/timetableSettings";
import { parseCallQueue as parseCallQueueSentinel, parseEmailDraftsFromText as parseEmailDraftsFromTextSentinel } from "@/lib/aiSentinels";
import {
  isConnectGoogleIntent, isDisconnectGoogleIntent, isDeleteStudentIntent,
  parseDeleteTeacher, parseDeleteMentor, parseDeleteTimetable,
  executeDeleteTimetable, executeDeleteEntity, blockDeleteStudent,
} from "@/lib/quickIntents";


function stripBrTags(text: string): string {
  if (!text) return text;
  return text.replace(/<br\s*\/?>/gi, "\n");
}

// Always-on suggestions (shown in every mode, before random pool)
const ALWAYS_SUGGESTIONS: string[] = [
  "Call parents of fee defaulters",
  "Email parents with unpaid fees",
];

const MODE_SUGGESTION_POOL: Record<Mode, string[]> = {
  Agent: [
    "Send fee reminders to unpaid parents",
    "Call parents of attendance defaulters",
    "Email all teachers tomorrow's meeting at 9am",
    "Show students below 75% attendance",
    "View unpaid fees summary",
    "Notify class 10 parents about exam schedule",
    "Generate this week's attendance report",
    "Send birthday wishes to today's students",
  ],
  Ask: [
    "Which class has the lowest attendance this month?",
    "How many students have unpaid fees and total outstanding?",
    "Who are my top 5 mentors by expertise?",
    "What is the average fee due per class?",
    "List students with attendance below 60%",
    "Which teacher handles the most subjects?",
    "How many parents haven't paid this term?",
    "Which section has the best academic record?",
    "Who are my newest mentors this month?",
    "What's the gender ratio across class 12?",
  ],
  Plan: [
    "Plan a parent-teacher meeting for class 12",
    "Plan a fee recovery campaign for unpaid parents",
    "Plan an attendance improvement program for class 10",
    "Plan exam revision schedule for board students",
    "Plan a mentor onboarding workflow for next quarter",
    "Plan a 30-day digital marketing push for admissions",
    "Plan a teacher training week on AI tools",
    "Plan a counselling drive for class 11 stream selection",
  ],
  Research: [
    "Research best practices to improve attendance in Indian schools",
    "Research fee collection strategies that work for CBSE schools",
    "Research career counselling models for class 11-12 students",
    "Research effective parent engagement frameworks",
    "Research benchmarks for teacher-student ratio in India",
    "Research how top schools use AI in operations",
    "Research dropout prevention models in tier-2 cities",
    "Research scholarship eligibility frameworks for STEM students",
  ],
};

function pickRandom<T>(arr: T[], n: number, seed: number): T[] {
  const a = [...arr];
  // simple seeded shuffle
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const BROWSER_SHORTCUTS: Record<string, string> = {
  "google calendar": "/calendar",
  gmail: "/inbox",
  youtube: "https://youtube.com",
  fedena: "https://fedena.com",
  edunext: "https://edunext.in",
};

const MODE_STYLES: Record<Mode, string> = {
  Agent: "data-[active=true]:bg-violet/20 data-[active=true]:text-violet-glow data-[active=true]:border-violet/40",
  Ask: "data-[active=true]:bg-blue-500/20 data-[active=true]:text-blue-400 data-[active=true]:border-blue-500/40",
  Plan: "data-[active=true]:bg-amber-500/20 data-[active=true]:text-amber-400 data-[active=true]:border-amber-500/40",
  Research:
    "data-[active=true]:bg-emerald-500/20 data-[active=true]:text-emerald-400 data-[active=true]:border-emerald-500/40",
};

const STATUS_STYLES: Record<string, string> = {
  ANSWERED: "bg-success/20 text-success",
  RINGING: "bg-warning/20 text-warning",
  "NO ANSWER": "bg-danger/20 text-danger",
  FAILED: "bg-danger/20 text-danger",
  QUEUED: "bg-surface-2 text-muted-foreground",
};

const MARKDOWN_COMPONENTS = {
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-border/50">
      <table className="w-full min-w-[520px] text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-surface-2">{children}</thead>,
  th: ({ children }: any) => (
    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/50 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-3 py-2 text-foreground/90 border-b border-border/30 whitespace-nowrap">{children}</td>
  ),
  tr: ({ children }: any) => <tr className="hover:bg-surface-2/50 transition-colors">{children}</tr>,
};

function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {stripBrTags(text)}
    </ReactMarkdown>
  );
}

function parseCallQueue(response: string): { callType: string; script: string; recipients: CallQueueItem[] } | null {
  return parseCallQueueSentinel(response) as any;
}

function normalizeEmailDraft(raw: any): any {
  const firstTo = Array.isArray(raw?.to) ? raw.to[0] : raw?.to;
  return {
    ...raw,
    to: firstTo ?? raw?.email ?? raw?.parent_email ?? raw?.recipient ?? raw?.recipient_email ?? "",
    subject: raw?.subject ?? raw?.title ?? raw?.headline ?? "",
    body: raw?.body ?? raw?.message ?? raw?.content ?? raw?.text ?? "",
    recipient_name: raw?.recipient_name ?? raw?.parent_name ?? raw?.name ?? "",
    student_name: raw?.student_name ?? "",
  };
}

function normalizeEmailDrafts(drafts: any[]): any[] {
  return (Array.isArray(drafts) ? drafts : [])
    .map(normalizeEmailDraft)
    .filter((d) => d.to || d.subject || d.body);
}

function buildCallQueueFromContext(rows: any[], callType: string): CallQueueItem[] {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      student_id: r.student_id ?? r.id,
      student_name: r.name ?? r.student_name ?? "",
      parent_name: r.parent_name ?? r.name ?? r.teacher_name ?? r.mentor_name ?? "",
      phone: String(r.parent_phone ?? r.phone ?? r.mobile ?? "").replace(/[\s-]/g, ""),
      amount_due: r.due != null ? String(r.due) : undefined,
      attendance_pct: r.attendance_pct != null ? String(r.attendance_pct) : undefined,
      call_type: callType,
    }))
    .filter((r) => r.phone);
}

function buildEmailDraftsFromContext(rows: any[], prompt: string): any[] {
  const lower = prompt.toLowerCase();
  const fee = /fee|unpaid|due|pending|defaulter/.test(lower);
  const attendance = /attendance|absent|risk/.test(lower);
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const to = r.parent_email ?? r.email ?? r.teacher_email ?? r.mentor_email ?? "";
      const name = r.parent_name ?? r.name ?? "Parent";
      const student = r.name ?? r.student_name ?? "your ward";
      const subject = fee
        ? `Fee Reminder — ${student}`
        : attendance
          ? `Attendance Reminder — ${student}`
          : `School Notice — ${student}`;
      const body = fee
        ? `Dear ${name},\n\nThis is a reminder that fees are pending for ${student}${r.due ? ` with an outstanding amount of ₹${Number(r.due).toLocaleString("en-IN")}` : ""}. Please complete the payment at the earliest.\n\nRegards,\nSchool Office`
        : attendance
          ? `Dear ${name},\n\nThis is to inform you that ${student}'s attendance needs attention${r.attendance_pct ? ` (${r.attendance_pct}%)` : ""}. Please connect with the school office for support.\n\nRegards,\nSchool Office`
          : `Dear ${name},\n\n${prompt}\n\nRegards,\nSchool Office`;
      return { to, recipient_name: name, student_name: student, subject, body };
    })
    .filter((d) => d.to);
}

/** Strip generic filler responses the model should never emit. */
const FORBIDDEN_FILLER =
  /^\s*(workflow\s+complete\.?|workflow\s+completed\.?|task\s+completed\.?|done\.?|noted\.?|understood\.?)\s*$/i;
function stripFiller(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .filter((l) => !FORBIDDEN_FILLER.test(l))
    .join("\n")
    .trim();
}

function parseCallPlan(response: string): { callType: string; script: string; recipients: CallQueueItem[] } | null {
  if (!response.includes("CALL PLAN:")) return null;
  const entries: CallQueueItem[] = [];
  const lines = response.split("\n");
  let inPlan = false;
  let script = "";
  let type = "fee_reminder";
  for (const line of lines) {
    if (line.includes("CALL PLAN:")) {
      inPlan = true;
      continue;
    }
    if (line.includes("CALL SCRIPT:")) {
      script = line.replace("CALL SCRIPT:", "").trim();
      continue;
    }
    if (inPlan && line.trim().startsWith("-")) {
      const match = line.match(/- (.+?) \((\+?\d[\d\s-]+)\)\s*[—–-]\s*(.+)/);
      if (match) {
        const parts = match[3].split("—").map((s) => s.trim());
        entries.push({
          parent_name: match[1].trim(),
          phone: match[2].replace(/[\s-]/g, ""),
          student_name: parts[0] || "",
          amount_due: line.match(/Rs\.?\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ?? undefined,
          attendance_pct: line.match(/(\d+)%/)?.[1] ?? undefined,
          call_type: type,
        });
      }
    }
    if (line.toLowerCase().includes("attendance")) type = "attendance_alert";
  }
  return entries.length > 0 ? { callType: type, script, recipients: entries } : null;
}

function parseCallDataFallback(response: string): CallQueueItem[] {
  const items: CallQueueItem[] = [];
  const lineRegex = /student_name:\s*([^|]+)\|[^|]*parent_name:\s*([^|]+)\|[^|]*phone:\s*(\+?\d[\d\s-]{7,})/gi;
  let m;
  while ((m = lineRegex.exec(response)) !== null) {
    const amountMatch = m[0].match(/amount_due:\s*([\d,]+)/);
    const attMatch = m[0].match(/attendance_pct:\s*([\d.]+)/);
    items.push({
      student_name: m[1].trim(),
      parent_name: m[2].trim(),
      phone: m[3].replace(/[\s-]/g, ""),
      amount_due: amountMatch?.[1]?.replace(/,/g, ""),
      attendance_pct: attMatch?.[1],
      call_type: attMatch ? "attendance_alert" : "fee_reminder",
    });
  }
  return items;
}

/** Parse email drafts from raw AI text. Supports several shapes:
 *   1. %%EMAIL_DRAFTS%% [...] %%END_EMAIL_DRAFTS%%
 *   2. ```json [...] ```  (when the array contains email-like objects)
 *   3. A plain "Subject: ... \n\n body" letter — wrapped into a single draft.
 */
function parseEmailDraftsFromText(text: string): { drafts: any[]; cleanText: string } {
  return parseEmailDraftsFromTextSentinel(text);
}

/** Last-resort: build a single editable draft from a free-form letter
 *  the model returned, so the preview opens when the user asked for an email.  */
function buildDraftFromProse(text: string): any | null {
  if (!text) return null;
  const subjectMatch = text.match(/^\s*Subject\s*:\s*(.+)$/im);
  if (!subjectMatch) return null;
  const subject = subjectMatch[1].trim();
  const body = text.replace(subjectMatch[0], "").trim();
  if (body.length < 20) return null;
  return { to: "", subject, body, recipient_name: "" };
}

/** Typing animation hook */
function useTypingEffect(text: string, speed: number = 12) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!text) {
      setDone(true);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      // Show chunks of ~3 chars for speed
      const chunk = Math.min(i * 3, text.length);
      setDisplayed(text.slice(0, chunk));
      if (chunk >= text.length) {
        setDone(true);
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return { displayed, done };
}

function TypingMessage({ text, animate, onDone }: { text: string; animate: boolean; onDone: () => void }) {
  const { displayed, done } = useTypingEffect(animate ? text : "", 8);
  useEffect(() => {
    if (done && animate) onDone();
  }, [done, animate, onDone]);
  if (!animate) return <MarkdownMessage text={text} />;
  return (
    <div className={`${!done ? "typing-cursor" : ""}`}>
      <MarkdownMessage text={displayed} />
    </div>
  );
}

function InlineCallQueueCard({
  recipients,
  script,
  onStart,
}: {
  recipients: CallQueueItem[];
  script?: string;
  onStart: () => void;
}) {
  return (
    <ExecutionCard
      title={`Call Queue — ${recipients.length} Contacts`}
      subtitle={recipients[0]?.call_type === "attendance_alert" ? "Attendance Alert" : "Ready to call"}
      icon={<Phone size={14} />}
      accentColor="success"
      className="w-full"
    >
      <div className="flex flex-col divide-y divide-border/30">
        {recipients.slice(0, 6).map((item, i) => (
          <div key={`${item.phone}-${i}`} className="flex justify-between items-start py-2.5 gap-3">
            <div className="min-w-0">
              <div className="text-sm text-foreground font-medium truncate">
                {item.parent_name || item.student_name || `Contact ${i + 1}`}
              </div>
              {item.student_name && item.parent_name && (
                <div className="text-[11px] text-muted-foreground truncate">{item.student_name}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-muted-foreground font-mono">{item.phone}</div>
              {item.amount_due && <div className="text-[10px] text-warning font-medium">₹{Number(item.amount_due).toLocaleString("en-IN")}</div>}
            </div>
          </div>
        ))}
        {recipients.length > 6 && <div className="text-[11px] text-muted-foreground py-2">+{recipients.length - 6} more</div>}
      </div>
      {script && <div className="mt-3 text-[11px] text-muted-foreground rounded-lg bg-surface-2 p-3 italic">“{script}”</div>}
      <button
        onClick={onStart}
        className="mt-3 w-full py-2.5 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-all active:scale-[0.97] hover:glow-violet-strong flex items-center justify-center gap-2"
      >
        <Phone size={12} /> Start Calls
      </button>
    </ExecutionCard>
  );
}

function InlineEmailPreviewCard({
  drafts,
  onSend,
  onReview,
}: {
  drafts: any[];
  onSend: () => void;
  onReview: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = drafts.length;
  const safeIdx = Math.min(Math.max(idx, 0), Math.max(total - 1, 0));
  const cur = drafts[safeIdx] ?? {};
  const body = String(cur.body ?? "");
  const go = (delta: number) => setIdx((i) => Math.min(Math.max(i + delta, 0), total - 1));
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    touchRef.current = null;
  };
  return (
    <ExecutionCard
      title={`Email Preview — ${total} Recipient${total === 1 ? "" : "s"}`}
      subtitle={cur.to ? `To: ${cur.to}` : "Drafts ready"}
      icon={<span>📧</span>}
      accentColor="violet"
      className="w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {cur.recipient_name || cur.student_name || cur.to || "Recipient"}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => go(-1)}
            disabled={safeIdx === 0}
            className="h-7 w-7 rounded-md border border-border/50 text-foreground/80 disabled:opacity-30 hover:bg-surface-2 transition-colors text-sm"
            aria-label="Previous"
          >‹</button>
          <span className="text-[11px] font-mono text-foreground/80 px-2 tabular-nums">{safeIdx + 1} / {total}</span>
          <button
            onClick={() => go(1)}
            disabled={safeIdx >= total - 1}
            className="h-7 w-7 rounded-md border border-border/50 text-foreground/80 disabled:opacity-30 hover:bg-surface-2 transition-colors text-sm"
            aria-label="Next"
          >›</button>
        </div>
      </div>
      <div className="space-y-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">To</div>
          <div className="text-xs text-foreground/90 bg-surface-0 border border-border rounded-lg px-3 py-2 font-mono truncate">
            {cur.to || "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Subject</div>
          <div className="text-sm text-foreground bg-surface-0 border border-border rounded-lg px-3 py-2">
            {cur.subject || "School notice"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Body</div>
          <div className="text-sm text-foreground/90 bg-surface-0 border border-border rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto">
            {body || "Email body ready for review."}
          </div>
        </div>
        {total > 1 && (
          <div className="flex flex-wrap gap-1 justify-center pt-1">
            {drafts.slice(0, 50).map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === safeIdx ? "w-4 bg-violet-glow" : "w-1.5 bg-border hover:bg-foreground/30"}`}
                aria-label={`Go to email ${i + 1}`}
              />
            ))}
            {total > 50 && <span className="text-[10px] text-muted-foreground ml-1">+{total - 50}</span>}
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onSend}
          className="flex-1 py-2.5 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-all active:scale-[0.97] hover:glow-violet-strong"
        >
          Send All ({total})
        </button>
        <button
          onClick={onReview}
          className="px-4 py-2.5 text-muted-foreground border border-border/50 text-[11px] rounded-lg hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          Review
        </button>
      </div>
    </ExecutionCard>
  );
}

interface ClarifyQ {
  question: string;
  type: "single" | "multi" | "text";
  options?: string[];
}
interface ClarifyState {
  pending: string;
  questions: ClarifyQ[];
  answers: string[][];
}

export default function AIPanel({ contextLabel }: { contextLabel?: string }) {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();
  const urlConvId = params?.conversationId;

  // Global persisted UI state — survives route changes & remounts
  const expanded = useAITerminal((s) => s.expanded);
  const setExpanded = (v: boolean) => useAITerminal.getState().set("expanded", v);
  const onToggleExpand = () => setExpanded(!useAITerminal.getState().expanded);
  const collapsed = useAITerminal((s) => s.collapsed);
  const setCollapsed = (v: boolean) => useAITerminal.getState().set("collapsed", v);
  const onToggleCollapse = () => setCollapsed(!useAITerminal.getState().collapsed);
  const mode = useAITerminal((s) => s.mode);
  const setMode = (v: Mode) => useAITerminal.getState().set("mode", v);
  const input = useAITerminal((s) => s.input);
  const setInput = (v: string) => useAITerminal.getState().set("input", v);
  const log = useAITerminal((s) => s.log);
  const setLog = (v: LogLine[] | ((p: LogLine[]) => LogLine[])) => {
    const cur = useAITerminal.getState().log;
    useAITerminal.getState().set("log", typeof v === "function" ? (v as any)(cur) : v);
  };
  const historyOpen = useAITerminal((s) => s.historyOpen);
  const setHistoryOpen = (v: boolean) => useAITerminal.getState().set("historyOpen", v);
  const pendingPrompt = useAITerminal((s) => s.pendingPrompt);
  const callQueue = useAITerminal((s) => s.callQueue);
  const setCallQueue = (v: CallQueueItem[]) => useAITerminal.getState().set("callQueue", v);
  const callScript = useAITerminal((s) => s.callScript);
  const setCallScript = (v: string) => useAITerminal.getState().set("callScript", v);
  const showCallCard = useAITerminal((s) => s.showCallCard);
  const setShowCallCard = (v: boolean) => useAITerminal.getState().set("showCallCard", v);
  const callInProgress = useAITerminal((s) => s.callInProgress);
  const setCallInProgress = (v: boolean) => useAITerminal.getState().set("callInProgress", v);
  const callStatuses = useAITerminal((s) => s.callStatuses);
  const setCallStatuses = (v: CallStatus[] | ((p: CallStatus[]) => CallStatus[])) => {
    const cur = useAITerminal.getState().callStatuses;
    useAITerminal.getState().set("callStatuses", typeof v === "function" ? (v as any)(cur) : v);
  };
  const callsComplete = useAITerminal((s) => s.callsComplete);
  const setCallsComplete = (v: number) => useAITerminal.getState().set("callsComplete", v);
  const callSessionSummary = useAITerminal((s) => s.callSessionSummary);
  const setCallSessionSummary = (v: any) => useAITerminal.getState().set("callSessionSummary", v);
  const emailDrafts = useAITerminal((s) => s.emailDrafts);
  const setEmailDrafts = (v: any[]) => useAITerminal.getState().set("emailDrafts", v);
  const currentDraftIndex = useAITerminal((s) => s.currentDraftIndex);
  const setCurrentDraftIndex = (v: number | ((p: number) => number)) => {
    const cur = useAITerminal.getState().currentDraftIndex;
    useAITerminal.getState().set("currentDraftIndex", typeof v === "function" ? (v as any)(cur) : v);
  };
  const previewOpen = useAITerminal((s) => s.previewOpen);
  const setPreviewOpen = (v: boolean) => useAITerminal.getState().set("previewOpen", v);
  const debugLog = useAITerminal((s) => s.debugLog);
  const setDebugLog = (v: DebugEntry[]) => useAITerminal.getState().set("debugLog", v);
  const debugOpen = useAITerminal((s) => s.debugOpen);
  const setDebugOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const cur = useAITerminal.getState().debugOpen;
    useAITerminal.getState().set("debugOpen", typeof v === "function" ? (v as any)(cur) : v);
  };

  // Transient (in-flight only — fine to reset on remount)
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string>("");
  useEffect(() => { if (!busy) setBusyLabel(""); }, [busy]);
  const [currentCallIndex, setCurrentCallIndex] = useState(0);
  const [callResults, setCallResults] = useState<any[]>([]);
  const [editingScript, setEditingScript] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Clarifying-questions flow (Ask/Plan/Research) — MCQ-style
  const [clarifyState, setClarifyState] = useState<ClarifyState | null>(null);
  const [loadingClarify, setLoadingClarify] = useState(false);

  // Context reference panel — what AI receives as memory
  const [contextOpen, setContextOpen] = useState(false);

  // Ad-hoc contact (call/email anyone not in DB)
  const [adhocOpen, setAdhocOpen] = useState<null | "call" | "email">(null);
  const [adhocForm, setAdhocForm] = useState({ name: "", phone: "", email: "", subject: "", body: "", reason: "" });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistent conversation — driven by URL when present, otherwise stored last.
  const storedActiveId = useAITerminal((s) => s.activeConversationId);
  const effectiveConvId = urlConvId ?? storedActiveId ?? null;
  const {
    conversationId,
    messages: persistedMessages,
    appendUser,
    appendAssistant,
    newConversation,
    clearMessages,
    recentForAI,
  } = useConversation(workspaceId, effectiveConvId);

  // Conversation list for the history sidebar
  const { conversations, remove: removeConv } = useConversations(workspaceId);

  // Sync resolved conversation id back into the store
  useEffect(() => {
    if (conversationId && conversationId !== storedActiveId) {
      useAITerminal.getState().set("activeConversationId", conversationId);
    }
  }, [conversationId, storedActiveId]);

  // Hydrate log when conversation id changes — but only if the persisted store log
  // is empty for this conversation. Prevents wiping the in-memory terminal on every
  // route change (AppShell remounts AIPanel per page).
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    if (hydratedRef.current === conversationId) return;
    hydratedRef.current = conversationId;
    const currentLog = useAITerminal.getState().log;
    const sameConv = useAITerminal.getState().activeConversationId === conversationId;
    if (sameConv && currentLog.length > 0) return; // already populated — keep it

    // Re-hydrate cards from the most recent message that produced one,
    // and strip raw CALL QUEUE / EMAIL_DRAFTS blocks from displayed text.
    let restoredQueue: CallQueueItem[] | null = null;
    let restoredDrafts: any[] | null = null;
    let restoredScript = "";
    for (const m of persistedMessages) {
      const meta: any = (m as any).metadata ?? {};
      if (meta.kind === "call_queue" && Array.isArray(meta.recipients) && meta.recipients.length) {
        restoredQueue = meta.recipients;
        restoredScript = meta.script ?? "";
      } else if (meta.kind === "email_drafts" && Array.isArray(meta.drafts) && meta.drafts.length) {
        restoredDrafts = meta.drafts;
      } else if (m.role === "assistant") {
        // Legacy messages: try to parse blocks from the raw content
        const q = parseCallQueue(m.content) || parseCallPlan(m.content);
        if (q?.recipients?.length) {
          restoredQueue = q.recipients;
          restoredScript = q.script ?? "";
        }
        const { drafts } = parseEmailDraftsFromText(m.content);
        if (drafts.length) restoredDrafts = drafts;
      }
    }

    const lines: LogLine[] = persistedMessages.map((m) => {
      let text = m.content;
      // Strip embedded action blocks so users don't see raw markup.
      text = text
        .replace(/%%EMAIL_DRAFTS%%[\s\S]*?%%END_EMAIL_DRAFTS%%/g, "")
        .replace(/%%CALL_QUEUE%%[\s\S]*?%%END_CALL_QUEUE%%/g, "")
        .replace(/CALL\s*(?:QUEUE|PLAN)\s*:[\s\S]*?(END_CALL_QUEUE|$)/gi, "")
        .trim();
      return {
        t: new Date(m.created_at).getTime(),
        kind: m.role === "user" ? "user" : "ai",
        text: text || (m.role === "assistant" ? "…" : ""),
        typing: false,
      };
    });
    setLog(lines);

    if (restoredQueue) {
      setCallQueue(restoredQueue);
      setCallScript(restoredScript);
      setShowCallCard(true);
    }
    if (restoredDrafts) {
      setEmailDrafts(restoredDrafts);
      setCurrentDraftIndex(0);
      setPreviewOpen(true);
    }
  }, [conversationId, persistedMessages]);

  function addDebug(label: string, payload: any) {
    useAITerminal.getState().pushDebug({ t: Date.now(), label, payload });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [log, previewOpen, showCallCard, callStatuses, callQueue.length, emailDrafts.length]);

  // Cmd/Ctrl + \ toggles the collapsed (rail) state
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        onToggleCollapse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function push(kind: string, text: string, typing = false, msgMode?: Mode, payload?: any) {
    useAITerminal.getState().pushLog({ t: Date.now(), kind, text, typing, mode: msgMode, payload });
  }

  function tryBrowserShortcut(command: string): boolean {
    const lower = command.toLowerCase();
    for (const [keyword, url] of Object.entries(BROWSER_SHORTCUTS)) {
      if (lower.includes(keyword) || lower.includes("open " + keyword)) {
        if (url.startsWith("/")) {
          push("ok", "📂 Opening " + keyword);
          router.push(url);
        } else {
          push("ok", "🌐 Opening " + url);
          router.push("/browser?url=" + encodeURIComponent(url));
        }
        return true;
      }
    }
    const urlMatch = command.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      push("ok", "🌐 Opening " + urlMatch[0]);
      router.push("/browser?url=" + encodeURIComponent(urlMatch[0]));
      return true;
    }
    return false;
  }

  async function callAI(command: string) {
    const trimmedInput = command?.trim();
    if (!trimmedInput) return;
    if (!workspaceId) {
      push("err", "Not logged in");
      return;
    }
    setBusy(true);

    try {
      const [studentsRes, teachersRes] = await Promise.all([
        supabase
          .from("students")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("teachers")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      const allStudents = studentsRes.data ?? [];
      const allTeachers = teachersRes.data ?? [];
      const allMentors: any[] = [];
      const sliced = sliceContext(trimmedInput, allStudents, allTeachers, allMentors);

      // CRITICAL FIX: For counting/class queries, always send full data
      // The sliceContext now handles this correctly but we also pass
      // a summary to the edge function:
      const studentSummary = {
        total: allStudents.length,
        by_class: allStudents.reduce((acc: Record<string, number>, s: any) => {
          const key = `${s.class}-${s.section}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
        fee_summary: {
          unpaid: allStudents.filter((s: any) => s.fee_status === "unpaid").length,
          partial: allStudents.filter((s: any) => s.fee_status === "partial").length,
          paid: allStudents.filter((s: any) => s.fee_status === "paid").length,
          total_due: allStudents.reduce((sum: number, s: any) => sum + Number(s.due || 0), 0),
        },
        att_below_75: allStudents.filter((s: any) => Number(s.attendance_pct) < 75).length,
      };

      const history = recentForAI(10);

      // Route email/call intents to `command` edge fn (returns email_drafts + CALL QUEUE blocks)
      const lastSent = useAITerminal.getState().lastEmailSentAt ?? 0;
      const justSentEmail = Date.now() - lastSent < 5000; // 5 second cooldown
      const isEmailIntent = !justSentEmail && detectEmailIntent(trimmedInput);
      const isCallIntent = detectCallIntent(trimmedInput);
      const isOperationalStudentIntent = detectOperationalStudentIntent(trimmedInput);
      // Always route through `command` (uses OpenRouter on bhjtsmveghanbojpbswk).
      // Lovable AI / runtime-orchestrator path is disabled — kept only as last-resort fallback.
      const targetFn = "command";


      addDebug("Request", {
        fn: targetFn,
        workspace_id: workspaceId,
        input: trimmedInput,
        mode,
        intent: sliced.intent,
        operationalStudentIntent: isOperationalStudentIntent,
        students: sliced.students.length,
        teachers: sliced.teachers.length,
        mentors: sliced.mentors.length,
        history: history.length,
      });

      const { data, error } = await invokeExternal(targetFn, {
        body: {
          workspace_id: workspaceId,
          conversation_id: conversationId,
          command: trimmedInput,
          input: trimmedInput,
          mode: mode ?? "agent",
          client_source: "main_terminal",
          conversation_history: history ?? [],
          intent: sliced.intent,
          history,
          student_data: sliced.students,
          teacher_data: sliced.teachers,
          mentor_data: sliced.mentors,
          student_summary: studentSummary,
        },
      });

      addDebug("Response", {
        fn: targetFn,
        error: error?.message,
        phase: data?.phase,
        len: data?.response?.length,
        emails: data?.email_drafts?.length,
        hasCallQueue: data?.response?.includes?.("CALL QUEUE:"),
        hasEmailDrafts: (data?.email_drafts?.length ?? 0) > 0,
        isEmailIntent,
        isCallIntent,
      });
      // Also log to console so you can see in edge fn logs
      console.log("[AIPanel]", {
        fn: targetFn,
        phase: data?.phase,
        emails: data?.email_drafts?.length,
        hasCallQ: data?.response?.includes?.("CALL QUEUE:"),
      });

      if (error) {
        push("err", `Failed: ${error.message}`);
        return;
      }
      if (data?.error) {
        push("err", `Error: ${data.error}`);
        return;
      }

      const responseText = (data?.response as string) ?? (data?.message as string) ?? "";
      const summaryText = (data?.summary as string) ?? "";

      // ---- Workflow actions normalization ----------------------------------
      // The orchestrator may return an `actions` array (or `workflow_actions` /
      // `action_payload`) carrying email + call payloads. We surface those as
      // proper preview cards BEFORE any "Workflow completed" summary so the
      // assistant's actual output is never overwritten.
      const rawActions: any[] = Array.isArray(data?.actions)
        ? data.actions
        : Array.isArray(data?.workflow_actions)
          ? data.workflow_actions
          : Array.isArray(data?.action_payload)
            ? data.action_payload
            : [];

      const emailActions = rawActions
        .filter((a) => {
          const t = String(a?.type ?? a?.action ?? "").toLowerCase();
          return t === "email" || t === "send_email" || t === "email_draft";
        })
        .map((a) => {
          const p = a.payload ?? a.data ?? a;
          return normalizeEmailDraft(p);
        })
        .filter((d) => d.to || d.subject || d.body);

      const callActions = rawActions
        .filter((a) => {
          const t = String(a?.type ?? a?.action ?? "").toLowerCase();
          return t === "call" || t === "voice_call" || t === "phone_call";
        })
        .map((a) => {
          const p = a.payload ?? a.data ?? a;
          const phone = p.phone ?? p.parent_phone ?? p.number ?? p.to ?? "";
          return {
            student_id: p.student_id,
            student_name: p.student_name ?? p.name ?? "",
            parent_name: p.parent_name ?? p.mentor_name ?? p.contact_name ?? p.name ?? "",
            phone: String(phone).replace(/[\s-]/g, ""),
            amount_due: p.amount_due,
            attendance_pct: p.attendance_pct,
            call_type: p.call_type ?? a.call_type ?? "fee_reminder",
          } as CallQueueItem;
        })
        .filter((c) => c.phone);

      // 1) Render assistant response FIRST (preserve it before status msgs)
      const preActionText = responseText
        .replace(/%%EMAIL_DRAFTS%%[\s\S]*?%%END_EMAIL_DRAFTS%%/, "")
        .replace(/%%CALL_QUEUE%%[\s\S]*?%%END_CALL_QUEUE%%/, "")
        .replace(/CALL (?:QUEUE|PLAN):[\s\S]*?(END_CALL_QUEUE|$)/, "")
        .trim();

      if (emailActions.length > 0 || callActions.length > 0) {
        if (preActionText) {
          push("ai", preActionText, true, mode);
        }
        if (callActions.length > 0) {
          setCallQueue(callActions);
          setCallScript("");
          setShowCallCard(false);
          push("card", "", false, mode, { type: "call_queue", recipients: callActions, script: "" });
        }
        if (emailActions.length > 0) {
          setEmailDrafts(emailActions);
          setCurrentDraftIndex(0);
          setPreviewOpen(false);
          push("card", "", false, mode, { type: "email_drafts", drafts: emailActions });
        }
        // Summary AFTER the cards
        if (summaryText) push("sys", summaryText);
        appendAssistant(responseText || summaryText || "Workflow ready", {
          kind: "workflow_actions",
          emails: emailActions.length,
          calls: callActions.length,
        });
        setBusy(false);
        return;
      }

      // Call queue check — accept structured payload from backend OR sentinel OR legacy text
      const hasCallSentinel = /%%CALL_QUEUE%%/.test(responseText);
      const hasCallQueue = responseText.includes("CALL QUEUE:") || hasCallSentinel || !!data?.call_queue;
      const hasCallPlan = responseText.includes("CALL PLAN:");
      if (data?.call_queue && Array.isArray(data.call_queue?.recipients) && data.call_queue.recipients.length > 0) {
        const recs: CallQueueItem[] = data.call_queue.recipients.map((r: any) => ({
          student_id: r.student_id,
          student_name: r.student_name ?? "",
          parent_name: r.parent_name ?? r.name ?? "",
          phone: String(r.phone ?? r.parent_phone ?? r.mobile ?? "").replace(/[\s-]/g, ""),
          amount_due: r.amount_due != null ? String(r.amount_due) : undefined,
          attendance_pct: r.attendance_pct != null ? String(r.attendance_pct) : undefined,
          call_type: data.call_queue.call_type ?? "general",
        } as CallQueueItem)).filter((r: CallQueueItem) => r.phone);
        if (recs.length > 0) {
          setCallQueue(recs);
          setCallScript(data.call_queue.script ?? data.call_queue.purpose ?? "");
          setShowCallCard(false);
          const preText = responseText.trim();
          if (preText) push("ai", preText, false, mode);
          push("card", "", false, mode, { type: "call_queue", recipients: recs, script: data.call_queue.script ?? "" });
          appendAssistant(preText || `Call queue ready — ${recs.length} contacts.`, {
            kind: "call_queue", count: recs.length, recipients: recs, callType: data.call_queue.call_type, script: data.call_queue.script ?? "",
          });
          setBusy(false);
          return;
        }
      }
      if (hasCallQueue || hasCallPlan) {
        let queue = parseCallQueue(responseText) || parseCallPlan(responseText);
        if (!queue || queue.recipients.length === 0) {
          const fallbackItems = parseCallDataFallback(responseText);
          if (fallbackItems.length > 0)
            queue = { callType: fallbackItems[0].call_type, script: "", recipients: fallbackItems };
        }
        if (queue?.recipients?.length) {
          setCallQueue(queue.recipients);
          setCallScript(queue.script ?? "");
          setShowCallCard(false);
          const preText = responseText.split(/CALL (?:QUEUE|PLAN):/)[0].trim();
          if (preText)
            preText
              .split("\n")
              .filter((l: string) => l.trim())
              .forEach((l: string) => push("ai", l, false, mode));
          push("card", "", false, mode, { type: "call_queue", recipients: queue.recipients, script: queue.script ?? "" });
          // Persist clean text + structured queue so the card re-hydrates on reload.
          const cleanForDb = (preText || `Call queue ready — ${queue.recipients.length} contacts.`).trim();
          appendAssistant(cleanForDb, {
            kind: "call_queue",
            count: queue.recipients.length,
            recipients: queue.recipients,
            callType: queue.callType,
            script: queue.script ?? "",
          });
          setBusy(false);
          return;
        }
      }

      if (!hasCallQueue && !hasCallPlan) {
        const fallbackItems = parseCallDataFallback(responseText);
        if (fallbackItems.length > 0) {
          setCallQueue(fallbackItems);
          setCallScript("");
          setShowCallCard(false);
          push("card", "", false, mode, { type: "call_queue", recipients: fallbackItems, script: "" });
          appendAssistant(`Call queue ready — ${fallbackItems.length} contacts.`, {
            kind: "call_queue",
            count: fallbackItems.length,
            recipients: fallbackItems,
            callType: fallbackItems[0].call_type,
            script: "",
          });
          setBusy(false);
          return;
        }
      }

      // Email drafts
      if (data?.phase === "preview" && data?.email_drafts?.length > 0) {
        const drafts = normalizeEmailDrafts(data.email_drafts);
        setEmailDrafts(drafts);
        setCurrentDraftIndex(0);
        setPreviewOpen(false);
        const cleanResp = responseText.replace(/%%EMAIL_DRAFTS%%[\s\S]*?%%END_EMAIL_DRAFTS%%/, "").trim();
        if (cleanResp) push("ai", cleanResp, true);
        push("card", "", false, mode, { type: "email_drafts", drafts });
        appendAssistant(cleanResp || `Email drafts ready — ${data.email_drafts.length} recipients.`, {
          kind: "email_drafts",
          count: drafts.length,
          drafts,
        });
        setBusy(false);
        return;
      }

      const { drafts: clientDrafts, cleanText } = parseEmailDraftsFromText(responseText);
      const normalizedClientDrafts = normalizeEmailDrafts(clientDrafts);
      if (normalizedClientDrafts.length > 0) {
        setEmailDrafts(normalizedClientDrafts);
        setCurrentDraftIndex(0);
        setPreviewOpen(false);
        if (cleanText) push("ai", cleanText, true);
        push("card", "", false, mode, { type: "email_drafts", drafts: normalizedClientDrafts });
        appendAssistant(cleanText || `Email drafts ready — ${normalizedClientDrafts.length} recipients.`, {
          kind: "email_drafts",
          count: normalizedClientDrafts.length,
          drafts: normalizedClientDrafts,
        });
        setBusy(false);
        return;
      }

      // ── AGGRESSIVE EMAIL FALLBACK ──────────────────────────────
      // If we expected email but got nothing, check if AI wrote
      // something email-like in plain text and wrap it as a draft
      if (isEmailIntent && emailDrafts.length === 0 && clientDrafts.length === 0) {
        // Look for "To:" / "Subject:" / "Dear" patterns in plain response
        const toMatch = responseText.match(/To:\s*([^\n]+)/i);
        const subjectMatch = responseText.match(/Subject:\s*([^\n]+)/i);
        const bodyStart = responseText.search(/Dear|Hi\s+|Hello\s+/i);
        if ((toMatch || subjectMatch) && bodyStart !== -1) {
          const synthesized = [
            {
              to: toMatch?.[1]?.trim() || "parent@admeasy.in",
              subject: subjectMatch?.[1]?.trim() || "School Notice",
              body: responseText.slice(bodyStart).trim(),
              recipient_name: "",
            },
          ];
          setEmailDrafts(synthesized);
          setCurrentDraftIndex(0);
          setPreviewOpen(false);
          push("card", "", false, mode, { type: "email_drafts", drafts: synthesized });
          appendAssistant(responseText, { kind: "email_drafts", count: 1, drafts: synthesized });
          setBusy(false);
          return;
        }
      }

      // Email-intent prose fallback — model returned a single letter ("Subject: ...") with no markers
      if (isEmailIntent) {
        const draft = buildDraftFromProse(responseText);
        if (draft) {
          setEmailDrafts([draft]);
          setCurrentDraftIndex(0);
          setPreviewOpen(false);
          push("card", "", false, mode, { type: "email_drafts", drafts: [draft] });
          appendAssistant(responseText, { kind: "email_drafts", count: 1, drafts: [draft] });
          setBusy(false);
          return;
        }
      }

      if (isCallIntent) {
        const source = sliced.intent === "teachers" ? sliced.teachers : sliced.intent === "mentors" ? sliced.mentors : sliced.students;
        const synthesizedQueue = buildCallQueueFromContext(source, /attendance|absent|risk/i.test(trimmedInput) ? "attendance_alert" : "fee_reminder");
        if (synthesizedQueue.length > 0) {
          setCallQueue(synthesizedQueue);
          setCallScript("");
          setShowCallCard(false);
          push("card", "", false, mode, { type: "call_queue", recipients: synthesizedQueue, script: "" });
          appendAssistant(`Call queue ready — ${synthesizedQueue.length} contacts.`, {
            kind: "call_queue",
            count: synthesizedQueue.length,
            recipients: synthesizedQueue,
            script: "",
          });
          setBusy(false);
          return;
        }
      }

      if (isEmailIntent) {
        const synthesizedDrafts = buildEmailDraftsFromContext(sliced.students.length ? sliced.students : allStudents, trimmedInput);
        if (synthesizedDrafts.length > 0) {
          setEmailDrafts(synthesizedDrafts);
          setCurrentDraftIndex(0);
          setPreviewOpen(false);
          push("card", "", false, mode, { type: "email_drafts", drafts: synthesizedDrafts });
          appendAssistant(`Email drafts ready — ${synthesizedDrafts.length} recipients.`, {
            kind: "email_drafts",
            count: synthesizedDrafts.length,
            drafts: synthesizedDrafts,
          });
          setBusy(false);
          return;
        }
      }

      // Normal response — fall back to summary so we never silently swallow output
      const finalText = stripFiller(responseText || summaryText);
      if (finalText) {
        push("ai", finalText, true, mode);
        appendAssistant(finalText, { mode });
      } else {
        // No structured action — fall back to a conversational AI answer
        // (Ask/Plan/Research style questions deserve an explanation, not a dead-end warning).
        try {
          const history = recentForAI(10);
          const { data: convo } = await invokeExternal("command", {
            body: {
              workspace_id: workspaceId,
              command,
              input: command,
              mode: (mode ?? "Ask").toLowerCase(),
              client_source: "main_terminal_fallback",
              conversation_history: history ?? [],
              history,
              clarify: false,
              force_answer: true,
            },
          });
          const convoText = stripFiller(
            convo?.response || convo?.answer || convo?.message || convo?.summary || ""
          );
          if (convoText) {
            push("ai", convoText, true, mode);
            appendAssistant(convoText, { mode });
          } else {
            const msg = "I'm having a moment — please try again in a few seconds.";
            push("ai", msg, true, mode);
            appendAssistant(msg, { mode });
          }
        } catch {
          const msg = "I'm having a moment — please try again in a few seconds.";
          push("ai", msg, true, mode);
          appendAssistant(msg, { mode });
        }
      }
    } catch (e: any) {
      push("err", e?.message ?? "Command failed");
    } finally {
      setBusy(false);
    }
  }

  async function executeCallQueue(queueOverride?: CallQueueItem[], scriptOverride?: string) {
    const activeQueue = queueOverride?.length ? queueOverride : callQueue;
    const activeScript = scriptOverride ?? callScript;
    if (activeQueue.length === 0) return;
    setShowCallCard(false);
    setCallInProgress(true);
    setBusy(true);
    setCallQueue(activeQueue);
    setCallScript(activeScript);
    const statuses: CallStatus[] = activeQueue.map((p) => ({ parent_name: p.parent_name, status: "QUEUED" }));
    setCallStatuses(statuses);
    setCallsComplete(0);
    const results: any[] = [];

    for (let i = 0; i < activeQueue.length; i++) {
      const item = activeQueue[i];
      setCurrentCallIndex(i);
      setCallStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "RINGING" } : s)));
      push("sys", `📞 Calling ${item.parent_name} (${item.phone})... [${i + 1}/${activeQueue.length}]`);

      let callStatus: "initiated" | "failed" = "failed";
      let exotelId: string | null = null;
      try {
        const { data, error } = await invokeExternal("call-agent", {
          body: {
            workspace_id: workspaceId,
            call_type: item.call_type,
            student_id: item.student_id,
            parent_phone: item.phone,
            parent_name: item.parent_name,
            student_name: item.student_name,
            amount_due: item.amount_due,
            attendance_pct: item.attendance_pct,
             custom_script: activeScript,
          },
        });
        // call-agent returns { phase, response } — treat any non-error response as initiated
        const ok = !error && data && !data.error;
        if (!ok) {
          push("err", `❌ Failed: ${item.parent_name}`);
          setCallStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "FAILED" } : s)));
          results.push({ ...item, status: "failed" });
        } else {
          callStatus = "initiated";
          exotelId = data?.call_id ?? data?.exotel_call_id ?? null;
          push("ok", `✅ Call initiated: ${item.parent_name}`);
          setCallStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "ANSWERED" } : s)));
          results.push({ ...item, status: "initiated", call_id: exotelId });
        }
        if (i < activeQueue.length - 1) await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (err: any) {
        push("err", `❌ Error: ${item.parent_name}`);
        setCallStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "FAILED" } : s)));
        results.push({ ...item, status: "error" });
      }
      // Persist call log row regardless of outcome — Logs page reads from here
      try {
        if (!workspaceId) throw new Error("no workspace");
        await supabase.from("call_logs").insert({
          workspace_id: workspaceId,
          student_name: item.student_name,
          parent_name: item.parent_name,
          parent_phone: item.phone,
          call_type: item.call_type,
          status: callStatus,
          script: activeScript || null,
          exotel_call_id: exotelId,
        });
      } catch (e) {
        /* non-fatal */
      }
      setCallsComplete(i + 1);
    }

    setCallResults(results);
    setCallInProgress(false);
    setBusy(false);
    const succeeded = results.filter((r) => r.status === "initiated").length;
    const failed = results.filter((r) => r.status !== "initiated").length;
    setCallSessionSummary({ total: results.length, answered: succeeded, noAnswer: 0, failed });
    setCallStatuses([]);
    push("ok", `📞 Complete: ${succeeded} initiated · ${failed} failed`);
    try {
      await supabase.from("notifications").insert({
        workspace_id: workspaceId,
        message: `Call campaign: ${succeeded}/${results.length} initiated`,
        type: "system",
        status: "unread",
      });
    } catch {}
    setCallQueue([]);
  }

  async function fetchClarifyQuestions(text: string): Promise<ClarifyQ[]> {
    const trimmedInput = text?.trim();
    if (!trimmedInput) return [];
    setLoadingClarify(true);
    try {
      const history = recentForAI(10);
      const { data } = await invokeExternal("command", {
        body: {
          workspace_id: workspaceId,
          command: trimmedInput,
          input: trimmedInput,
          mode: mode ?? "agent",
          client_source: "main_terminal",
          conversation_history: history ?? [],
          clarify: true,
          history,
        },
      });
      const raw = Array.isArray(data?.questions) ? data.questions : [];
      // Normalize — backend may return strings (legacy) or {question, type, options}
      return raw
        .map((q: any): ClarifyQ => {
          if (typeof q === "string") return { question: q, type: "text" };
          return {
            question: String(q.question ?? ""),
            type:
              q.type === "multi"
                ? "multi"
                : q.type === "single"
                  ? "single"
                  : Array.isArray(q.options) && q.options.length > 0
                    ? "single"
                    : "text",
            options: Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === "string") : undefined,
          };
        })
        .filter((q: ClarifyQ) => q.question.length > 2);
    } catch {
      return [];
    } finally {
      setLoadingClarify(false);
    }
  }

  async function runTimetableGenerate(classNum: string, section: string) {
    if (!workspaceId) return;
    push("sys", `✦ Fetching teachers for Class ${classNum}-${section}...`);
    push("sys", `✦ Running conflict detection and optimizing schedule...`);
    try {
      const stream = streamForClass(classNum);
      // Resolve the school-level-specific schedule for this class.
      const profiles = await listSettings(workspaceId);
      const resolvedSettings = getSettingsForClass(classNum, profiles);
      const data = await generateTimetable({ workspace_id: workspaceId, class: classNum, section, stream });
      if (!data?.ok || !data?.timetable) {
        push("err", data?.error || "AI generation failed. Check if teachers are added.");
        return;
      }
      // Find sibling sections of the same class for "Apply to All".
      const { data: sectionRows } = await supabase
        .from("timetable")
        .select("section")
        .eq("workspace_id", workspaceId)
        .eq("class", classNum);
      const { data: studentSecRows } = await supabase
        .from("students")
        .select("section")
        .eq("workspace_id", workspaceId)
        .eq("class", classNum);
      const sectionsSet = new Set<string>([section]);
      (sectionRows ?? []).forEach((r: any) => r.section && sectionsSet.add(String(r.section)));
      (studentSecRows ?? []).forEach((r: any) => r.section && sectionsSet.add(String(r.section)));
      const availableSections = Array.from(sectionsSet).sort();
      push("card", "", false, mode, {
        type: "timetable_preview",
        classNum,
        section,
        timetable: data.timetable as WeekTimetable,
        summary: data.summary || "",
        availableSections,
        stream,
        settings: resolvedSettings,
      });
    } catch (e: any) {
      push("err", e?.message || "AI generation failed.");
    }
  }

  /** Detect teacher double-booking across existing timetable rows.
   *  Returns conflicts where the same teacher is already assigned at the same day+period
   *  to a class/section that is NOT one of the target sections being overwritten.
   */
  async function detectTimetableCollisions(
    classNum: string,
    timetable: WeekTimetable,
    targetSections: string[],
    onlyDay?: string,
  ): Promise<Array<{ day: string; period: number; teacher: string; conflict_class: string; conflict_section: string }>> {
    if (!workspaceId) return [];
    const teacherSet = new Set<string>();
    const dayPeriodSet = new Set<string>();
    for (const [day, slots] of Object.entries(timetable ?? {})) {
      const dayCode = (day ?? "").toUpperCase().slice(0, 3);
      if (onlyDay && dayCode !== onlyDay) continue;
      for (const s of (slots ?? [])) {
        if (s?.teacher && s.period) {
          teacherSet.add(s.teacher.trim());
          dayPeriodSet.add(`${dayCode}|${s.period}`);
        }
      }
    }
    if (teacherSet.size === 0) return [];
    const { data, error } = await supabase
      .from("timetable")
      .select("class, section, day, period_number, teacher_name")
      .eq("workspace_id", workspaceId)
      .in("teacher_name", Array.from(teacherSet));
    if (error || !data) return [];
    const conflicts: Array<{ day: string; period: number; teacher: string; conflict_class: string; conflict_section: string }> = [];
    for (const row of data as any[]) {
      const dayCode = (row.day ?? "").toUpperCase().slice(0, 3);
      const key = `${dayCode}|${row.period_number}`;
      if (!dayPeriodSet.has(key)) continue;
      // Self-overwrite is fine — the upsert will replace it.
      const isSelf = String(row.class) === String(classNum) && targetSections.includes(String(row.section));
      if (isSelf) continue;
      // Verify the new payload at this slot uses this teacher.
      const dayKey = dayCode;
      const newSlots = (timetable as any)[dayKey] ?? (timetable as any)[dayKey.toLowerCase()] ?? [];
      const match = newSlots.find((x: any) => x.period === row.period_number && (x.teacher ?? "").trim() === row.teacher_name);
      if (!match) continue;
      conflicts.push({
        day: dayCode,
        period: row.period_number,
        teacher: row.teacher_name,
        conflict_class: String(row.class),
        conflict_section: String(row.section),
      });
    }
    return conflicts;
  }

  async function applyTimetable(
    classNum: string,
    section: string,
    timetable: WeekTimetable,
    sections: string[],
    opts?: { override?: boolean; onlyDay?: string },
  ): Promise<{ ok: boolean; collisions?: Array<{ day: string; period: number; teacher: string; conflict_class: string; conflict_section: string }> }> {
    if (!workspaceId) return { ok: false };
    const targetSections = sections.length ? sections : [section];
    const onlyDay = opts?.onlyDay ? opts.onlyDay.toUpperCase().slice(0, 3) : null;

    // Collision check — unless explicitly overridden.
    if (!opts?.override) {
      const collisions = await detectTimetableCollisions(classNum, timetable, targetSections, onlyDay ?? undefined);
      if (collisions.length > 0) {
        push("err", `⚠ ${collisions.length} teacher collision${collisions.length !== 1 ? "s" : ""} detected — review and choose "Override Anyway" to apply.`);
        return { ok: false, collisions };
      }
    } else {
      push("sys", `⚠ Override Anyway — saving despite teacher collisions.`);
    }

    push("sys", `💾 Saving ${onlyDay ? `${onlyDay} ` : ""}timetable to ${targetSections.length} section${targetSections.length !== 1 ? "s" : ""}...`);
    try {
      const rows: any[] = [];
      for (const sec of targetSections) {
        for (const [day, slots] of Object.entries(timetable ?? {})) {
          const dayCode = (day ?? "").toUpperCase().slice(0, 3);
          if (!["MON","TUE","WED","THU","FRI","SAT","SUN"].includes(dayCode)) continue;
          if (onlyDay && dayCode !== onlyDay) continue;
          for (const s of (slots ?? [])) {
            if (!s || !s.period) continue;
            const subject = (s.subject ?? "").trim();
            const teacher = (s.teacher ?? "").trim();
            if (!subject && !teacher) continue;
            rows.push({
              workspace_id: workspaceId,
              class: classNum,
              section: sec,
              day: dayCode,
              period_number: s.period,
              subject: subject || null,
              teacher_name: teacher || null,
            });
          }
        }
      }
      if (rows.length === 0) { push("err", "Nothing to save — empty timetable"); return { ok: false }; }
      for (const sec of targetSections) {
        let del = supabase.from("timetable").delete()
          .eq("workspace_id", workspaceId).eq("class", classNum).eq("section", sec);
        if (onlyDay) del = del.eq("day", onlyDay);
        const { error: deleteError } = await del;
        if (deleteError) { push("err", deleteError.message); return { ok: false }; }
      }
      const { error } = await supabase.from("timetable").upsert(rows, {
        onConflict: "workspace_id,class,section,day,period_number",
      });
      if (error) { push("err", error.message); return { ok: false }; }
      push("ok", `✅ Saved ${rows.length} periods across ${targetSections.length} section${targetSections.length !== 1 ? "s" : ""}`);
      window.dispatchEvent(new CustomEvent("admeasy:timetable-updated", { detail: { classNum, sections: targetSections, day: onlyDay } }));
      return { ok: true };
    } catch (e: any) {
      push("err", e?.message || "Save failed");
      return { ok: false };
    }
  }

  const run = useCallback(
    async (cmd?: string, opts?: { skipClarify?: boolean; augmented?: string }) => {
      const command = (cmd ?? useAITerminal.getState().input).trim();
      if (!command || !workspaceId || busy) return;
      setInput("");
      // Clarify for Ask/Plan/Research always; for Agent only on long/complex commands
      const isEmailIntent = detectEmailIntent(command);
      const isCallIntent = detectCallIntent(command);
      const isTimetableIntent = isTimetableGenerateIntent(command) && !!parseTimetableCommand(command);
      // NEVER clarify for email/call/timetable — these must execute immediately
      const isActionIntent = isEmailIntent || isCallIntent || isTimetableIntent;
      const isComplexAgent = mode === "Agent" && (command.length > 80 || command.split(/\s+/).length > 14);
      const needsClarify =
        !isActionIntent &&
        !opts?.skipClarify &&
        !opts?.augmented &&
        (mode === "Ask" || mode === "Plan" || mode === "Research" || isComplexAgent);
      if (needsClarify) {
        const qs = await fetchClarifyQuestions(command);
        if (qs.length > 0) {
          setClarifyState({ pending: command, questions: qs, answers: qs.map(() => []) });
          return;
        }
      }
      setPreviewOpen(false);
      setShowCallCard(false);
      setCallStatuses([]);
      setCallSessionSummary(null);
      setCallQueue([]);
      setEmailDrafts([]);
      const userText = opts?.augmented ?? command;
      // Intent pill for busy state
      const lower = userText.toLowerCase();
      let pill = "";
      if (mode === "Research" || /\b(research|deep dive|explain|what is|how does|why)\b/.test(lower)) pill = "🔍 Researching…";
      else if (/\b(open|browse|navigate to|go to)\s+\w+/.test(lower) || /https?:\/\//.test(lower)) pill = "🌐 Opening browser…";
      else if (isTimetableIntent) pill = "🗓 Building timetable…";
      else pill = "📊 Checking school data…";
      setBusyLabel(pill);
      push("user", userText);
      appendUser(userText);
      if (tryBrowserShortcut(userText)) { setBusyLabel(""); return; }

      // ── Quick intents (workspace mutations / connectors) ──
      if (isConnectGoogleIntent(userText)) {
        push("sys", "🔗 Opening Google connection…");
        setBusyLabel("");
        router.push("/integrations?connect=google");
        return;
      }
      if (isDisconnectGoogleIntent(userText)) {
        push("sys", "🔗 Manage Google connection on the Integrations page.");
        setBusyLabel("");
        router.push("/integrations");
        return;
      }
      if (isDeleteStudentIntent(userText)) {
        const r = blockDeleteStudent();
        if (r.log) push(r.log.kind, r.log.text);
        setBusyLabel("");
        return;
      }
      const dttgt = parseDeleteTimetable(userText);
      if (dttgt && workspaceId) {
        const r = await executeDeleteTimetable(workspaceId, dttgt, (m) => window.confirm(m));
        if (r.log) push(r.log.kind, r.log.text);
        setBusyLabel("");
        return;
      }
      const delT = parseDeleteTeacher(userText);
      if (delT && workspaceId) {
        const r = await executeDeleteEntity(workspaceId, "teachers", delT, (m) => window.confirm(m));
        if (r.log) push(r.log.kind, r.log.text);
        setBusyLabel("");
        return;
      }
      // mentors module removed

      if (isTimetableIntent) {
        const target = parseTimetableCommand(userText);
        if (target) {
          await runTimetableGenerate(target.class, target.section);
          return;
        }
        push("err", "Tell me the class — e.g. \"generate timetable for class 12 B\".");
        setBusyLabel("");
        return;
      }
      await callAI(userText);

    },
    [workspaceId, busy, appendUser, mode],
  );

  function submitClarifyAnswers() {
    if (!clarifyState) return;
    const qa = clarifyState.questions
      .map((q, i) => {
        const ans = clarifyState.answers[i] ?? [];
        const a = ans.filter(Boolean).join(", ") || "(no preference)";
        return `Q: ${q.question}\nA: ${a}`;
      })
      .join("\n\n");
    const augmented = `${clarifyState.pending}\n\n[Additional context provided by user]\n${qa}`;
    const original = clarifyState.pending;
    setClarifyState(null);
    run(original, { augmented });
  }

  function skipClarify() {
    if (!clarifyState) return;
    const original = clarifyState.pending;
    setClarifyState(null);
    run(original, { skipClarify: true });
  }

  function toggleClarifyOption(qi: number, option: string) {
    if (!clarifyState) return;
    const q = clarifyState.questions[qi];
    const next = [...clarifyState.answers];
    const cur = next[qi] ?? [];
    if (q.type === "single") {
      next[qi] = cur.includes(option) ? [] : [option];
    } else {
      next[qi] = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
    }
    setClarifyState({ ...clarifyState, answers: next });
  }

  function setClarifyText(qi: number, text: string) {
    if (!clarifyState) return;
    const next = [...clarifyState.answers];
    next[qi] = [text];
    setClarifyState({ ...clarifyState, answers: next });
  }

  // Run any pending prompt (set by quick actions on Home page)
  useEffect(() => {
    if (!pendingPrompt || !workspaceId || !conversationId || busy) return;
    const p = pendingPrompt;
    useAITerminal.getState().set("pendingPrompt", null);
    setExpanded(true);
    run(p);
  }, [pendingPrompt, workspaceId, conversationId, busy, run]);

  // Voice acts as a virtual keyboard — same submit pipeline as typed commands.
  useEffect(() => {
    const handler = (e: Event) => {
      const text = ((e as CustomEvent).detail?.text ?? "").toString().trim();
      if (!text) return;
      // Voice should NOT auto-fullscreen the terminal — keep current expand state.
      setInput(text);
      run(text);
    };
    window.addEventListener("admeasy:terminal-submit", handler);
    return () => window.removeEventListener("admeasy:terminal-submit", handler);
  }, [run]);

  function resetCardsForConversationSwitch() {
    setShowCallCard(false);
    setPreviewOpen(false);
    setCallStatuses([]);
    setCallSessionSummary(null);
    setCallQueue([]);
    useAITerminal.getState().patch({
      callScript: "",
      callInProgress: false,
      callsComplete: 0,
      emailDrafts: [],
      currentDraftIndex: 0,
    });
  }

  async function handleNewConversation() {
    const id = await newConversation();
    setLog([]);
    resetCardsForConversationSwitch();
    if (id) router.push(`/ai/chat/${id}`);
  }

  function handleSelectConversation(id: string) {
    if (id === conversationId) {
      setHistoryOpen(false);
      return;
    }
    setLog([]);
    resetCardsForConversationSwitch();
    setHistoryOpen(false);
    router.push(`/ai/chat/${id}`);
  }

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      push("err", "Speech recognition not supported");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const r = new SR();
    r.lang = "en-IN";
    r.interimResults = false;
    r.onresult = (e: any) => {
      setInput(e.results[0][0].transcript);
      setListening(false);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    r.start();
    setListening(true);
  }

  function downloadAsPdf(text: string, title: string) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 56;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const ts = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });

    // Cover header band
    doc.setFillColor(124, 58, 237); // violet
    doc.rect(0, 0, pageWidth, 6, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 40);
    doc.text(title.replace(/_/g, " "), margin, margin);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`${mode.toUpperCase()} · Generated by Admeasy AI · ${ts}`, margin, margin + 16);
    doc.setDrawColor(220);
    doc.line(margin, margin + 22, pageWidth - margin, margin + 22);

    let y = margin + 42;
    doc.setTextColor(35, 35, 45);

    const blocks = text.split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split("\n");
      for (const rawLine of lines) {
        const line = rawLine.replace(/\*\*/g, "").replace(/[`~]/g, "");
        if (!line.trim()) {
          y += 6;
          continue;
        }

        let prefix = "";
        let body = line;
        let bold = false;
        let size = 11;
        let indent = 0;
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
        const numMatch = line.match(/^(\d+)\.\s+(.+)/);
        const bulletMatch = line.match(/^[\-\*•]\s+(.+)/);

        if (headingMatch) {
          bold = true;
          size = headingMatch[1].length === 1 ? 15 : 13;
          body = headingMatch[2];
        } else if (numMatch) {
          prefix = `${numMatch[1]}.`;
          body = numMatch[2];
          bold = false;
          indent = 18;
        } else if (bulletMatch) {
          prefix = "•";
          body = bulletMatch[1];
          indent = 14;
        }

        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        const wrapped = doc.splitTextToSize(body, maxWidth - indent);
        for (let wi = 0; wi < wrapped.length; wi++) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          if (wi === 0 && prefix) {
            doc.setFont("helvetica", "bold");
            doc.text(prefix, margin, y);
            doc.setFont("helvetica", bold ? "bold" : "normal");
          }
          doc.text(wrapped[wi], margin + indent, y);
          y += size + 4;
        }
        y += 2;
      }
      y += 4;
    }

    // Footer with page numbers
    const pages = (doc as any).internal.pages.length - 1;
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(`Admeasy AI · ${mode}`, margin, pageHeight - 24);
      doc.text(`Page ${p} of ${pages}`, pageWidth - margin, pageHeight - 24, { align: "right" });
    }
    doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
  }

  function downloadAsDocx(text: string, title: string) {
    const ts = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });
    // Convert markdown-ish text to simple HTML
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = text.split("\n");
    let html = "";
    let inOl = false;
    let inUl = false;
    const closeLists = () => {
      if (inOl) {
        html += "</ol>";
        inOl = false;
      }
      if (inUl) {
        html += "</ul>";
        inUl = false;
      }
    };
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) {
        closeLists();
        html += "";
        continue;
      }
      const h = l.match(/^(#{1,3})\s+(.+)/);
      const num = l.match(/^\d+\.\s+(.+)/);
      const bul = l.match(/^[\-\*•]\s+(.+)/);
      if (h) {
        closeLists();
        const tag = `h${Math.min(3, h[1].length + 1)}`;
        html += `<${tag}>${escape(h[2])}</${tag}>`;
      } else if (num) {
        if (!inOl) {
          closeLists();
          html += "<ol>";
          inOl = true;
        }
        html += `<li>${escape(num[1])}</li>`;
      } else if (bul) {
        if (!inUl) {
          closeLists();
          html += "<ul>";
          inUl = true;
        }
        html += `<li>${escape(bul[1])}</li>`;
      } else {
        closeLists();
        html += `<p>${escape(l).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
      }
    }
    closeLists();

    const doc = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.55;color:#222;max-width:780px;margin:24px auto;padding:0 24px}
h1{font-size:22pt;color:#5b21b6;margin-bottom:4pt}
h2{font-size:14pt;color:#4c1d95;margin-top:18pt}
h3{font-size:12pt;color:#6d28d9}
.meta{color:#888;font-size:9pt;border-bottom:1px solid #e5e5e5;padding-bottom:8pt;margin-bottom:14pt;text-transform:uppercase;letter-spacing:1px}
ol,ul{margin:6pt 0 6pt 22pt}
li{margin-bottom:4pt}
strong{color:#1f1f2e}
.footer{color:#888;font-size:9pt;margin-top:28pt;border-top:1px solid #e5e5e5;padding-top:8pt}
</style></head>
<body>
<h1>${escape(title.replace(/_/g, " "))}</h1>
<div class="meta">${escape(mode)} · Generated by Admeasy AI · ${escape(ts)}</div>
${html}
<div class="footer">Generated by Admeasy AI · admeasy.in</div>
</body></html>`;
    const blob = new Blob(["\ufeff", doc], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.doc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function submitAdhoc() {
    if (adhocOpen === "call") {
      if (!adhocForm.name || !adhocForm.phone) return;
      setCallQueue([
        {
          student_name: "",
          parent_name: adhocForm.name,
          phone: adhocForm.phone.replace(/\s/g, ""),
          call_type: adhocForm.reason || "general",
        },
      ]);
      setCallScript(adhocForm.body || `Hello ${adhocForm.name}, calling from Admeasy. ${adhocForm.reason || ""}`);
      setShowCallCard(true);
      push("sys", `📞 Ad-hoc call ready: ${adhocForm.name} (${adhocForm.phone})`);
    } else if (adhocOpen === "email") {
      if (!adhocForm.name || !adhocForm.email) return;
      setEmailDrafts([
        {
          to: adhocForm.email,
          recipient_name: adhocForm.name,
          subject: adhocForm.subject || `Message from Admeasy`,
          body: adhocForm.body || `Dear ${adhocForm.name},\n\n`,
        },
      ]);
      setCurrentDraftIndex(0);
      setPreviewOpen(true);
      push("sys", `📧 Ad-hoc email draft ready: ${adhocForm.name} <${adhocForm.email}>`);
    }
    setAdhocOpen(null);
    setAdhocForm({ name: "", phone: "", email: "", subject: "", body: "", reason: "" });
  }

  const kindStyle = (k: string) => {
    switch (k) {
      case "user":
        return "text-foreground font-medium";
      case "ai":
        return "text-foreground/90";
      case "ok":
        return "text-success";
      case "err":
        return "text-danger";
      case "warn":
        return "text-warning";
      case "suggest":
        return "text-violet-glow";
      default:
        return "text-muted-foreground";
    }
  };

  async function sendEmailDraftBatch(drafts: any[]) {
    if (!drafts.length) return;
    setBusy(true);
    push("sys", `Sending ${drafts.length} emails...`);
    const { data, error } = await invokeExternal("command", {
      body: { workspace_id: workspaceId, confirmed_emails: drafts, mode },
    });
    useAITerminal.getState().set("lastEmailSentAt", Date.now());
    if (error) push("err", `Send failed: ${error.message}`);
    else {
      String(data?.response ?? "")
        .split("\n")
        .filter((line: string) => line.trim())
        .forEach((line: string) => push(line.startsWith("✅") ? "ok" : line.startsWith("❌") ? "err" : "sys", line));
    }
    setBusy(false);
  }

  // Collapsed (rail) mode — show a thin strip with just the toggle so the user
  // can re-open the terminal from any page. Cmd/Ctrl + \ also toggles it.
  if (collapsed && !expanded) {
    return (
      <aside className="hidden md:flex shrink-0 w-10 border-l border-border/40 bg-background/60 backdrop-blur-md flex-col items-center py-3 gap-3">
        <button
          onClick={onToggleCollapse}
          title="Expand AI Terminal (⌘\\)"
          className="p-1.5 rounded-md text-muted-foreground hover:text-violet-glow hover:bg-violet/10 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={onToggleCollapse}
          title="Open AI Terminal"
          className="p-1.5 rounded-md text-violet-glow hover:bg-violet/10 transition-colors"
        >
          <Terminal size={16} />
        </button>
      </aside>
    );
  }

  return (
    <motion.aside
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`relative shrink-0 border-l border-border/40 glass flex flex-col h-full ${
        expanded ? "fixed inset-0 z-30 w-full" : "hidden md:flex w-[340px] lg:w-[420px]"
      }`}
      style={
        expanded
          ? { paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }
          : undefined
      }
    >
      {/* Collapse to rail (only when not in fullscreen) */}
      {!expanded && (
        <button
          onClick={onToggleCollapse}
          title="Collapse terminal (⌘\\)"
          className="hidden md:flex absolute -left-3 top-4 z-30 w-6 h-6 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:text-violet-glow hover:border-violet/40 shadow-sm"
        >
          <ChevronRight size={12} />
        </button>
      )}
      {/* Header */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-2 sm:px-3 py-2.5 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-hidden">
          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              title="Minimize terminal (back to sidebar)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-violet-glow hover:bg-violet/10 transition-colors shrink-0"
            >
              <Minimize2 size={14} />
            </button>
          )}
          <AdmeasyLogo state={busy ? "thinking" : "idle"} size={26} className="shrink-0" />
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar">
            {(["Agent", "Ask", "Plan", "Research"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                data-active={mode === m}
                className={`px-1.5 sm:px-2 py-1 text-[9px] sm:text-[10px] font-medium uppercase tracking-wider rounded-md border border-transparent
                  transition-all duration-200 text-muted-foreground hover:text-foreground whitespace-nowrap
                  ${MODE_STYLES[m]}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {(callStatuses.length > 0 || callInProgress) && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-success font-mono mr-1">
              <span className="w-2 h-2 rounded-full bg-success pulse-glow" /> LIVE
            </div>
          )}
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            title="Conversation history"
            className={`p-1.5 rounded-lg transition-colors ${historyOpen ? "bg-violet/20 text-violet-glow" : "text-muted-foreground hover:text-foreground hover:bg-surface-2"}`}
          >
            <History size={14} />
          </button>
          <button
            onClick={handleNewConversation}
            title="New conversation"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-violet-glow hover:bg-violet/10 transition-colors"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setContextOpen((o) => !o)}
            title="Context AI is using"
            className={`p-1.5 rounded-lg transition-colors ${contextOpen ? "bg-violet/20 text-violet-glow" : "text-muted-foreground hover:text-foreground hover:bg-surface-2"}`}
          >
            <Brain size={14} />
          </button>
          <button
            onClick={() => setDebugOpen((o) => !o)}
            title="Debug"
            className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors ${debugOpen ? "bg-warning/20 text-warning" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Bug size={12} />
          </button>
          <ThemeToggle compact />
          <button
            onClick={onToggleExpand}
            title={expanded ? "Collapse terminal" : "Expand terminal"}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              title="Close fullscreen"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {contextLabel && (
        <div className="px-4 py-2 border-b border-border/30 text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-2 font-mono">
          <span className="w-1.5 h-1.5 rounded-full gradient-violet" />
          {mode} · Gemma 4 · {contextLabel}
        </div>
      )}

      {/* Conversation History */}
      <AnimatePresence>
        {historyOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-border/50 bg-surface-1 overflow-hidden"
          >
            <div className="max-h-[280px] overflow-y-auto">
              <div className="flex justify-between items-center px-3 py-2 border-b border-border/30 sticky top-0 bg-surface-1 z-10">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  History · {conversations.length}
                </span>
                <button
                  onClick={handleNewConversation}
                  className="text-[10px] text-violet-glow hover:underline font-mono flex items-center gap-1"
                >
                  <Plus size={10} /> New
                </button>
              </div>
              {conversations.length === 0 && (
                <div className="px-3 py-4 text-[11px] text-muted-foreground italic">No previous conversations.</div>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2 border-b border-border/20 cursor-pointer transition-colors ${
                    c.id === conversationId ? "bg-violet/10" : "hover:bg-surface-2"
                  }`}
                  onClick={() => handleSelectConversation(c.id)}
                >
                  <MessageSquare
                    size={12}
                    className={c.id === conversationId ? "text-violet-glow" : "text-muted-foreground"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-foreground truncate">{c.title || "Untitled"}</div>
                    <div className="text-[9px] text-muted-foreground font-mono">
                      {new Date(c.updated_at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete conversation?")) removeConv(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger transition-opacity"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {debugOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-warning/20 bg-warning/5 overflow-hidden"
          >
            <div className="max-h-[180px] overflow-y-auto">
              <div className="flex justify-between items-center px-3 py-1.5 border-b border-warning/10">
                <span className="text-[9px] font-mono text-warning uppercase tracking-wider font-bold">
                  Debug · {debugLog.length}
                </span>
                <button
                  onClick={() => setDebugLog([])}
                  className="text-[9px] text-warning/70 hover:text-warning font-mono"
                >
                  Clear
                </button>
              </div>
              {debugLog.length === 0 && (
                <div className="px-3 py-2 text-[10px] text-warning/60 font-mono italic">No entries</div>
              )}
              {debugLog.map((d, i) => (
                <DebugEntryRow key={i} entry={d} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context reference panel */}
      <AnimatePresence>
        {contextOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-violet/20 bg-violet/5 overflow-hidden"
          >
            <div className="max-h-[220px] overflow-y-auto">
              <div className="flex justify-between items-center px-3 py-1.5 border-b border-violet/10 sticky top-0 bg-violet/10 backdrop-blur z-10">
                <span className="text-[9px] font-mono text-violet-glow uppercase tracking-wider font-bold">
                  Context · last {recentForAI(10).length} messages sent to AI
                </span>
              </div>
              {recentForAI(10).length === 0 && (
                <div className="px-3 py-3 text-[10px] text-muted-foreground font-mono italic">
                  No prior context — fresh conversation.
                </div>
              )}
              {recentForAI(10).map((m, i) => (
                <div key={i} className="px-3 py-2 border-b border-violet/10 last:border-0">
                  <div className="text-[9px] font-mono uppercase tracking-wider mb-1">
                    <span className={m.role === "user" ? "text-violet-glow" : "text-muted-foreground"}>{m.role}</span>
                  </div>
                  <div className="text-[11px] text-foreground/80 whitespace-pre-wrap line-clamp-4">{m.content}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col gap-3 relative scroll-smooth w-full ${expanded ? "max-w-3xl mx-auto" : ""}`}
      >
        {log.length > 0 && (
          <button
            onClick={() => {
              clearMessages();
              setLog([]);
              setShowCallCard(false);
              setPreviewOpen(false);
              setCallStatuses([]);
              setCallSessionSummary(null);
              setCallQueue([]);
              useAITerminal.getState().patch({
                callScript: "",
                callInProgress: false,
                callsComplete: 0,
                emailDrafts: [],
                currentDraftIndex: 0,
              });
            }}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 transition-colors z-10"
            title="Clear conversation"
          >
            <Trash2 size={12} />
          </button>
        )}

        {/* Empty state */}
        {log.length === 0 && !previewOpen && !showCallCard && !clarifyState && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center flex-1 gap-6 py-8"
          >
            <AdmeasyLogo state="idle" size={64} />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-1">What can I help with?</h3>
              <p className="text-sm text-muted-foreground">
                {mode === "Agent" && "Run your school with natural language"}
                {mode === "Ask" && "Ask anything about your school data"}
                {mode === "Plan" && "Build operational plans step-by-step"}
                {mode === "Research" && "Deep research with sources & recommendations"}
              </p>
            </div>
            <ModeSuggestions mode={mode} onPick={(s) => run(s)} />

            {mode !== "Research" && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setAdhocOpen("call")}
                  className="text-[11px] glass rounded-lg px-3 py-2 flex items-center gap-1.5 text-muted-foreground hover:text-violet-glow hover:border-violet/40 transition-all"
                >
                  <Phone size={11} /> Call anyone
                </button>
                <button
                  onClick={() => setAdhocOpen("email")}
                  className="text-[11px] glass rounded-lg px-3 py-2 flex items-center gap-1.5 text-muted-foreground hover:text-violet-glow hover:border-violet/40 transition-all"
                >
                  <UserPlus size={11} /> Email anyone
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Clarifying questions card — MCQ style */}
        {clarifyState && (
          <ExecutionCard
            title={`Refine your ${mode.toLowerCase()}`}
            subtitle="Pick options to sharpen the AI's answer"
            icon={<HelpCircle size={14} />}
            accentColor="violet"
          >
            <div className="text-[11px] text-muted-foreground mb-3 italic line-clamp-2">"{clarifyState.pending}"</div>
            <div className="flex flex-col gap-4">
              {clarifyState.questions.map((q, i) => (
                <div key={i}>
                  <div className="text-[12px] text-foreground mb-2 font-medium">
                    {i + 1}. {q.question}
                    {q.type === "multi" && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider text-violet-glow/70">Multi-select</span>
                    )}
                    {q.type === "single" && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider text-violet-glow/70">Pick one</span>
                    )}
                  </div>
                  {q.type === "text" || !q.options || q.options.length === 0 ? (
                    <input
                      value={clarifyState.answers[i]?.[0] ?? ""}
                      onChange={(e) => setClarifyText(i, e.target.value)}
                      placeholder="Your answer (optional)..."
                      className="w-full bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((opt) => {
                        const selected = (clarifyState.answers[i] ?? []).includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleClarifyOption(i, opt)}
                            className={`text-[11px] px-3 py-1.5 rounded-full border transition-all ${
                              selected
                                ? "bg-violet/20 text-violet-glow border-violet/50"
                                : "bg-surface-0 text-muted-foreground border-border hover:border-violet/30 hover:text-foreground"
                            }`}
                          >
                            {selected && <Check size={10} className="inline mr-1" />}
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={submitClarifyAnswers}
                className="flex-1 py-2.5 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg active:scale-[0.97] flex items-center justify-center gap-2"
              >
                <Check size={12} /> Submit & Run
              </button>
              <button
                onClick={skipClarify}
                className="px-4 py-2.5 text-muted-foreground border border-border/50 text-[11px] rounded-lg hover:text-foreground hover:bg-surface-2 transition-colors"
              >
                Skip
              </button>
            </div>
          </ExecutionCard>
        )}

        {loadingClarify && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground italic">
            <AdmeasyLogo state="thinking" size={18} /> Thinking of clarifying questions...
          </div>
        )}

        {/* Log lines */}
        {log.length > 0 && workspaceId && (
          <AgenticSummary workspaceId={workspaceId} compact />
        )}
        {log.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 }}
            className="flex gap-3"
          >
            {l.kind === "user" ? (
              <div className="ml-auto max-w-[85%]">
                <div className="gradient-violet text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{l.text}</div>
              </div>
            ) : l.kind === "card" && l.payload?.type === "call_queue" ? (
              <div className="w-full max-w-[95%] sm:max-w-[90%]">
                <InlineCallQueueCard
                  recipients={l.payload.recipients ?? []}
                  script={l.payload.script ?? ""}
                  onStart={() => executeCallQueue(l.payload.recipients ?? [], l.payload.script ?? "")}
                />
              </div>
            ) : l.kind === "card" && l.payload?.type === "email_drafts" ? (
              <div className="w-full max-w-[95%] sm:max-w-[90%]">
                <InlineEmailPreviewCard
                  drafts={l.payload.drafts ?? []}
                  onSend={() => sendEmailDraftBatch(l.payload.drafts ?? [])}
                  onReview={() => {
                    setEmailDrafts(l.payload.drafts ?? []);
                    setCurrentDraftIndex(0);
                    setPreviewOpen(true);
                  }}
                />
              </div>
            ) : l.kind === "card" && l.payload?.type === "timetable_preview" ? (
              <div className="w-full max-w-[95%] sm:max-w-[90%]">
                <InlineTimetablePreviewCard
                  classNum={l.payload.classNum}
                  section={l.payload.section}
                  timetable={l.payload.timetable}
                  summary={l.payload.summary}
                  availableSections={l.payload.availableSections ?? [l.payload.section]}
                  stream={l.payload.stream}
                  settings={l.payload.settings}
                  onApply={(sections, applyOpts) =>
                    applyTimetable(l.payload.classNum, l.payload.section, l.payload.timetable, sections, applyOpts)
                  }
                  onRegenerate={() => runTimetableGenerate(l.payload.classNum, l.payload.section)}
                  onExport={() =>
                    workspaceId &&
                    exportTimetableCsv({
                      workspace_id: workspaceId,
                      class: l.payload.classNum,
                      section: l.payload.section,
                    })
                  }
                />
              </div>
            ) : l.kind === "ai" ? (
              <div className="flex flex-col gap-1.5 max-w-[95%] sm:max-w-[90%]">
                <div
                  className="glass rounded-2xl rounded-bl-md px-3 sm:px-4 py-3 prose prose-sm prose-invert max-w-none
                  prose-p:text-foreground/90 prose-p:text-sm prose-p:leading-relaxed prose-p:my-1
                  prose-headings:text-foreground prose-strong:text-foreground
                  prose-li:text-foreground/90 prose-li:text-sm
                  prose-code:text-violet-glow prose-code:bg-violet/10 prose-code:px-1 prose-code:rounded
                  prose-table:text-sm overflow-x-auto"
                >
                  {l.typing ? (
                    <TypingMessage
                      text={l.text}
                      animate={true}
                      onDone={() => {
                        const cur = useAITerminal.getState().log;
                        const next = cur.map((x, idx) => (idx === i ? { ...x, typing: false } : x));
                        useAITerminal.getState().set("log", next);
                      }}
                    />
                  ) : (
                    <MarkdownMessage text={l.text} />
                  )}
                </div>
                {(l.mode === "Plan" || l.mode === "Research") && l.text.length > 200 && (
                  <div className="flex gap-1.5 ml-2">
                    <button
                      onClick={() => downloadAsPdf(l.text, `${l.mode}_${new Date(l.t).toISOString().slice(0, 10)}`)}
                      className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-violet-glow px-2 py-1 rounded-md hover:bg-violet/10 transition-colors"
                    >
                      <FileDown size={10} /> PDF
                    </button>
                    <button
                      onClick={() => downloadAsDocx(l.text, `${l.mode}_${new Date(l.t).toISOString().slice(0, 10)}`)}
                      className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-violet-glow px-2 py-1 rounded-md hover:bg-violet/10 transition-colors"
                    >
                      <FileText size={10} /> DOCX
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className={`text-sm ${kindStyle(l.kind)}`}>{l.text}</div>
            )}
          </motion.div>
        ))}

        {/* Call Queue Card */}
        {showCallCard && callQueue.length > 0 && (
          <ExecutionCard
            title={`Call Queue — ${callQueue.length} Contacts`}
            subtitle={callQueue[0]?.call_type === "attendance_alert" ? "Attendance Alert" : "Fee Reminder"}
            icon={<Phone size={14} />}
            accentColor="success"
          >
            <div className="flex flex-col divide-y divide-border/30">
              {callQueue.slice(0, 5).map((item, i) => {
                const primaryName = item.parent_name || item.student_name || `Contact ${i + 1}`;
                const secondaryName = item.parent_name && item.student_name ? item.student_name : "";
                return (
                  <div key={i} className="flex justify-between items-start py-2.5 gap-3">
                    <div className="flex gap-2 min-w-0 flex-1">
                      <span className="text-[10px] text-muted-foreground mt-0.5 font-mono shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="text-sm text-foreground font-medium truncate">{primaryName}</div>
                        {secondaryName && (
                          <div className="text-[11px] text-muted-foreground truncate">{secondaryName}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-muted-foreground font-mono">{item.phone || "—"}</div>
                      {item.amount_due && (
                        <div className="text-[10px] text-warning font-medium">
                          ₹{Number(item.amount_due).toLocaleString("en-IN")}
                        </div>
                      )}
                      {item.attendance_pct && (
                        <div className="text-[10px] text-danger font-medium">{item.attendance_pct}%</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {callQueue.length > 5 && (
                <div className="text-[11px] text-muted-foreground py-2">+{callQueue.length - 5} more</div>
              )}
            </div>

            {callScript && (
              <div className="mt-3 rounded-lg bg-surface-2 p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Script</span>
                  <button
                    onClick={() => setEditingScript(!editingScript)}
                    className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Pencil size={9} /> {editingScript ? "Done" : "Edit"}
                  </button>
                </div>
                {editingScript ? (
                  <textarea
                    value={callScript}
                    onChange={(e) => setCallScript(e.target.value)}
                    rows={3}
                    className="w-full bg-surface-0 border border-border text-sm text-foreground p-2 font-mono rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-violet/50"
                  />
                ) : (
                  <div className="text-[11px] text-muted-foreground leading-relaxed italic">"{callScript}"</div>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => executeCallQueue()}
                className="flex-1 py-2.5 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-all active:scale-[0.97] hover:glow-violet-strong flex items-center justify-center gap-2"
              >
                <Phone size={12} /> Start Calls
              </button>
              <button
                onClick={() => setEditingScript(!editingScript)}
                className="px-3 py-2.5 text-muted-foreground border border-border/50 text-[10px] rounded-lg hover:text-foreground hover:bg-surface-2 transition-colors flex items-center gap-1"
              >
                <Pencil size={10} /> Edit
              </button>
              <button
                onClick={() => {
                  setShowCallCard(false);
                  setCallQueue([]);
                  push("warn", "📞 Cancelled");
                }}
                className="px-3 py-2.5 text-muted-foreground border border-border/50 text-[10px] rounded-lg hover:text-foreground hover:bg-surface-2 transition-colors flex items-center gap-1"
              >
                <X size={10} />
              </button>
            </div>
          </ExecutionCard>
        )}

        {/* Live Call Statuses */}
        {callStatuses.length > 0 && (
          <ExecutionCard
            title="Calls in Progress"
            subtitle={`${callsComplete}/${callStatuses.length} complete`}
            icon={<Phone size={14} />}
            accentColor="success"
          >
            <div className="flex flex-col gap-1.5">
              {callStatuses.map((cs, i) => (
                <div key={i} className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-foreground">{cs.parent_name}</span>
                  <span
                    className={`text-[9px] tracking-wider px-2.5 py-1 rounded-full font-mono ${STATUS_STYLES[cs.status] || "text-muted-foreground"}`}
                  >
                    {cs.status}
                  </span>
                </div>
              ))}
            </div>
          </ExecutionCard>
        )}

        {/* Call Session Summary */}
        {callSessionSummary && (
          <ExecutionCard
            title={`Session Complete — ${callSessionSummary.total} Calls`}
            icon={<Phone size={14} />}
            accentColor="success"
          >
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center py-3 bg-success/10 rounded-lg">
                <span className="text-2xl font-bold text-success">{callSessionSummary.answered}</span>
                <span className="text-[9px] tracking-wider text-muted-foreground uppercase mt-1">Initiated</span>
              </div>
              <div className="flex flex-col items-center py-3 bg-warning/10 rounded-lg">
                <span className="text-2xl font-bold text-warning">{callSessionSummary.noAnswer}</span>
                <span className="text-[9px] tracking-wider text-muted-foreground uppercase mt-1">No Answer</span>
              </div>
              <div className="flex flex-col items-center py-3 bg-danger/10 rounded-lg">
                <span className="text-2xl font-bold text-danger">{callSessionSummary.failed}</span>
                <span className="text-[9px] tracking-wider text-muted-foreground uppercase mt-1">Failed</span>
              </div>
            </div>
          </ExecutionCard>
        )}

        {/* Email Preview */}
        {previewOpen && emailDrafts.length > 0 && (
          <ExecutionCard
            title={`Email Preview — ${emailDrafts.length} Recipients`}
            subtitle={`${currentDraftIndex + 1} of ${emailDrafts.length}`}
            icon={<span>📧</span>}
            accentColor="violet"
          >
            <div className="flex justify-between items-center gap-2 mb-3">
              <button
                onClick={() => setCurrentDraftIndex((i) => Math.max(0, i - 1))}
                disabled={currentDraftIndex === 0}
                className="px-2.5 py-1 bg-surface-2 text-muted-foreground text-[10px] rounded-md disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-sm text-foreground truncate flex-1 text-center">
                To: {emailDrafts[currentDraftIndex]?.to}
              </span>
              <button
                onClick={() => setCurrentDraftIndex((i) => Math.min(emailDrafts.length - 1, i + 1))}
                disabled={currentDraftIndex === emailDrafts.length - 1}
                className="px-2.5 py-1 bg-surface-2 text-muted-foreground text-[10px] rounded-md disabled:opacity-30"
              >
                Next →
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Subject</div>
                <input
                  value={emailDrafts[currentDraftIndex]?.subject ?? ""}
                  onChange={(e) => {
                    const updated = [...emailDrafts];
                    updated[currentDraftIndex] = { ...updated[currentDraftIndex], subject: e.target.value };
                    setEmailDrafts(updated);
                  }}
                  className="w-full bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50"
                />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Body</div>
                <textarea
                  value={emailDrafts[currentDraftIndex]?.body ?? ""}
                  onChange={(e) => {
                    const updated = [...emailDrafts];
                    updated[currentDraftIndex] = { ...updated[currentDraftIndex], body: e.target.value };
                    setEmailDrafts(updated);
                  }}
                  rows={5}
                  className="w-full bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-violet/50 leading-relaxed"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={async () => {
                  setBusy(true);
                  push("sys", `Sending ${emailDrafts.length} emails...`);
                  const { data, error } = await invokeExternal("command", {
                    body: { workspace_id: workspaceId, confirmed_emails: emailDrafts, mode },
                  });
                  setPreviewOpen(false);
                  setEmailDrafts([]);
                  if (error) push("err", `Send failed: ${error.message}`);
                  else {
                    (data.response as string)
                      .split("\n")
                      .filter((l: string) => l.trim())
                      .forEach((l: string) => push(l.startsWith("✅") ? "ok" : l.startsWith("❌") ? "err" : "sys", l));
                  }
                  setBusy(false);
                }}
                className="flex-1 py-2.5 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-all active:scale-[0.97] hover:glow-violet-strong"
              >
                Confirm & Send All
              </button>
              <button
                onClick={() => {
                  setPreviewOpen(false);
                  setEmailDrafts([]);
                  push("warn", "📧 Cancelled");
                }}
                className="px-4 py-2.5 text-muted-foreground border border-border/50 text-[11px] rounded-lg hover:text-foreground hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </ExecutionCard>
        )}

        {/* Busy indicator */}
        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 py-2">
            <AdmeasyLogo state="thinking" size={20} />
            {busyLabel ? (
              <span className="text-[11px] font-mono text-violet-glow bg-violet/10 border border-violet/30 px-2.5 py-1 rounded-full">
                {busyLabel}
              </span>
            ) : null}
            <div className="flex-1 h-5 rounded-md shimmer" />
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div
        className={`p-3 sm:p-4 border-t border-border/50 bg-background/80 backdrop-blur-md ${expanded ? "pb-24" : ""}`}
      >
        <div className={`w-full ${expanded ? "max-w-3xl mx-auto" : ""}`}>
          <div className="relative flex items-center gap-2 glass rounded-xl px-3 sm:px-4 py-2.5">
            <Sparkles size={16} className="text-violet-glow shrink-0 opacity-60" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
              }}
              placeholder="Ask anything about your school..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-w-0"
            />
            <button
              onClick={toggleMic}
              className={`p-1.5 rounded-lg transition-all shrink-0 ${listening ? "bg-danger/20 text-danger" : "text-muted-foreground hover:text-foreground hover:bg-surface-2"}`}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              onClick={() => setAdhocOpen("call")}
              title="Call/email anyone"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-violet-glow hover:bg-violet/10 transition-all shrink-0"
            >
              <UserPlus size={14} />
            </button>
            <button
              onClick={() => run()}
              disabled={busy || !input.trim()}
              className="p-2 rounded-lg gradient-violet text-white disabled:opacity-30 transition-all hover:glow-violet-strong active:scale-95 shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
          <div className="flex justify-between mt-2 px-2">
            <span className="text-[10px] text-muted-foreground font-mono">Gemma 4 · {mode}</span>
            <span className="text-[10px] text-muted-foreground">Enter to run</span>
          </div>
        </div>
      </div>

      {/* Ad-hoc contact dialog */}
      <AnimatePresence>
        {adhocOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setAdhocOpen(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl p-5 w-full max-w-sm border border-violet/30"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {adhocOpen === "call" ? (
                    <Phone size={16} className="text-violet-glow" />
                  ) : (
                    <UserPlus size={16} className="text-violet-glow" />
                  )}
                  <h3 className="text-sm font-semibold text-foreground">
                    {adhocOpen === "call" ? "Call anyone" : "Email anyone"}
                  </h3>
                </div>
                <button onClick={() => setAdhocOpen(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setAdhocOpen("call")}
                  className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors ${adhocOpen === "call" ? "bg-violet/20 text-violet-glow" : "text-muted-foreground hover:bg-surface-2"}`}
                >
                  Call
                </button>
                <button
                  onClick={() => setAdhocOpen("email")}
                  className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors ${adhocOpen === "email" ? "bg-violet/20 text-violet-glow" : "text-muted-foreground hover:bg-surface-2"}`}
                >
                  Email
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                <input
                  placeholder="Recipient name"
                  value={adhocForm.name}
                  onChange={(e) => setAdhocForm({ ...adhocForm, name: e.target.value })}
                  className="bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50"
                />
                {adhocOpen === "call" ? (
                  <>
                    <input
                      placeholder="Phone (+91...)"
                      value={adhocForm.phone}
                      onChange={(e) => setAdhocForm({ ...adhocForm, phone: e.target.value })}
                      className="bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50"
                    />
                    <input
                      placeholder="Reason (e.g. fee_reminder, meeting)"
                      value={adhocForm.reason}
                      onChange={(e) => setAdhocForm({ ...adhocForm, reason: e.target.value })}
                      className="bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50"
                    />
                    <textarea
                      placeholder="Call script (optional)"
                      value={adhocForm.body}
                      onChange={(e) => setAdhocForm({ ...adhocForm, body: e.target.value })}
                      rows={3}
                      className="bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50 resize-y"
                    />
                  </>
                ) : (
                  <>
                    <input
                      placeholder="Email address"
                      type="email"
                      value={adhocForm.email}
                      onChange={(e) => setAdhocForm({ ...adhocForm, email: e.target.value })}
                      className="bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50"
                    />
                    <input
                      placeholder="Subject"
                      value={adhocForm.subject}
                      onChange={(e) => setAdhocForm({ ...adhocForm, subject: e.target.value })}
                      className="bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50"
                    />
                    <textarea
                      placeholder="Message body"
                      value={adhocForm.body}
                      onChange={(e) => setAdhocForm({ ...adhocForm, body: e.target.value })}
                      rows={5}
                      className="bg-surface-0 border border-border text-foreground px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-violet/50 resize-y"
                    />
                  </>
                )}
                <button
                  onClick={submitAdhoc}
                  disabled={!adhocForm.name || (adhocOpen === "call" ? !adhocForm.phone : !adhocForm.email)}
                  className="mt-1 py-2.5 gradient-violet text-white text-[11px] font-semibold uppercase tracking-wider rounded-lg disabled:opacity-30 active:scale-[0.97]"
                >
                  {adhocOpen === "call" ? "Add to call queue" : "Open email preview"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

function DebugEntryRow({ entry }: { entry: DebugEntry }) {
  const [open, setOpen] = useState(false);
  const d = new Date(entry.t);
  const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  return (
    <div className="border-b border-warning/10 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-warning/10 text-left"
      >
        {open ? (
          <ChevronUp size={10} className="text-warning/60" />
        ) : (
          <ChevronDown size={10} className="text-warning/60" />
        )}
        <span className="text-[9px] text-warning/50 font-mono">{ts}</span>
        <span className="text-[10px] text-warning font-mono font-medium truncate">{entry.label}</span>
      </button>
      {open && (
        <pre className="px-3 pb-2 text-[9px] text-warning/80 font-mono whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto">
          {typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ModeSuggestions({ mode, onPick }: { mode: Mode; onPick: (s: string) => void }) {
  // Random subset that refreshes per page-mount + per mode change
  const seed = useMemo(() => Math.floor(Math.random() * 1_000_000), [mode]);
  const items = useMemo(() => {
    const random = pickRandom(MODE_SUGGESTION_POOL[mode], 3, seed);
    // Research is about exploration, not action — skip call/email always-on suggestions there.
    const always = mode === "Research" ? [] : ALWAYS_SUGGESTIONS;
    return [...always, ...random.filter((r) => !always.includes(r))];
  }, [mode, seed]);
  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-sm">
      {items.map((s) => (
        <motion.button
          key={s}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onPick(s)}
          className="text-[11px] text-muted-foreground hover:text-foreground glass rounded-lg px-3 py-2 transition-all hover:border-violet/30 flex items-center gap-1.5"
        >
          <Sparkles size={10} className="text-violet-glow opacity-60" />
          {s}
        </motion.button>
      ))}
    </div>
  );
}
