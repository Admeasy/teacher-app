import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Mode = "Agent" | "Ask" | "Plan" | "Research";

export interface LogLine { t: number; kind: string; text: string; typing?: boolean; mode?: Mode; payload?: any }
export interface CallQueueItem {
  student_id?: string;
  student_name: string;
  parent_name: string;
  phone: string;
  amount_due?: string;
  attendance_pct?: string;
  call_type: string;
}
export interface CallStatus {
  parent_name: string;
  status: "ANSWERED" | "RINGING" | "NO ANSWER" | "FAILED" | "QUEUED";
}
export interface DebugEntry { t: number; label: string; payload: any }

interface AITerminalState {
  // Visual
  expanded: boolean;
  collapsed: boolean;
  mode: Mode;
  input: string;
  log: LogLine[];
  scrollTop: number;
  // Conversation routing
  activeConversationId: string | null;
  pendingPrompt: string | null;
  historyOpen: boolean;
  // Cards
  callQueue: CallQueueItem[];
  callScript: string;
  showCallCard: boolean;
  callInProgress: boolean;
  callStatuses: CallStatus[];
  callsComplete: number;
  callSessionSummary: { total: number; answered: number; noAnswer: number; failed: number } | null;
  emailDrafts: any[];
  currentDraftIndex: number;
  previewOpen: boolean;
  lastEmailSentAt: number;
  // Debug
  debugLog: DebugEntry[];
  debugOpen: boolean;
  // Setters
  set: <K extends keyof AITerminalState>(k: K, v: AITerminalState[K]) => void;
  patch: (p: Partial<AITerminalState>) => void;
  pushLog: (line: LogLine) => void;
  resetVisual: () => void;
  pushDebug: (e: DebugEntry) => void;
}

const initial = {
  expanded: false,
  collapsed: false,
  mode: "Agent" as Mode,
  input: "",
  log: [] as LogLine[],
  scrollTop: 0,
  activeConversationId: null as string | null,
  pendingPrompt: null as string | null,
  historyOpen: false,
  callQueue: [] as CallQueueItem[],
  callScript: "",
  showCallCard: false,
  callInProgress: false,
  callStatuses: [] as CallStatus[],
  callsComplete: 0,
  callSessionSummary: null as { total: number; answered: number; noAnswer: number; failed: number } | null,
  emailDrafts: [] as any[],
  currentDraftIndex: 0,
  previewOpen: false,
  lastEmailSentAt: 0,
  debugLog: [] as DebugEntry[],
  debugOpen: false,
};

export const useAITerminal = create<AITerminalState>()(
  persist(
    (set) => ({
      ...initial,
      set: (k, v) => set({ [k]: v } as any),
      patch: (p) => set(p as any),
      pushLog: (line) => set((s) => ({ log: [...s.log, line] })),
      pushDebug: (e) => set((s) => ({ debugLog: [...s.debugLog, e] })),
      resetVisual: () => set({ ...initial }),
    }),
    {
      name: "ai-terminal-state",
      partialize: (s) => ({
        expanded: s.expanded,
        collapsed: s.collapsed,
        activeConversationId: s.activeConversationId,
        historyOpen: s.historyOpen,
        mode: s.mode,
        log: s.log.slice(-100),
        callQueue: s.callQueue,
        callScript: s.callScript,
        showCallCard: s.showCallCard,
        callInProgress: s.callInProgress,
        callStatuses: s.callStatuses,
        callsComplete: s.callsComplete,
        callSessionSummary: s.callSessionSummary,
        emailDrafts: s.emailDrafts,
        currentDraftIndex: s.currentDraftIndex,
        previewOpen: s.previewOpen,
      }),
    }
  )
);
