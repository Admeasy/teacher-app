import { create } from "zustand";
import { persist } from "zustand/middleware";
import { validateTeacherSession } from "@/lib/teacherSession";
import type { TeacherSession, TeacherChatMessage, TeacherAiMode } from "../types";

interface TeacherState {
  session: TeacherSession | null;
  setSession: (s: TeacherSession | null) => void;
  messages: TeacherChatMessage[];
  mode: TeacherAiMode;
  setMode: (m: TeacherAiMode) => void;
  pushMessage: (m: TeacherChatMessage) => void;
  appendToLast: (chunk: string) => void;
  clearChat: () => void;
}

export const useTeacherStore = create<TeacherState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      messages: [],
      mode: "lesson",
      setMode: (mode) => set({ mode }),
      pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      appendToLast: (chunk) =>
        set((s) => {
          const arr = [...s.messages];
          const last = arr[arr.length - 1];
          if (last) arr[arr.length - 1] = { ...last, content: last.content + chunk };
          return { messages: arr };
        }),
      clearChat: () => set({ messages: [] }),
    }),
    {
      name: "admeasy.teacher.session",
      partialize: (s) => ({ session: s.session, mode: s.mode, messages: s.messages.slice(-50) }),
      onRehydrateStorage: () => (state) => {
        if (state?.session && !validateTeacherSession(state.session)) {
          state.setSession(null);
        }
      },
    }
  )
);
