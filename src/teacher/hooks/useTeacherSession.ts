import { validateTeacherSession } from "@/lib/teacherSession";
import { useTeacherStore } from "../store/teacherStore";

export function useTeacherSession() {
  const session = useTeacherStore((s) => s.session);
  const setSession = useTeacherStore((s) => s.setSession);
  return {
    session,
    teacher: session?.teacher ?? null,
    isAuthed: !!session && validateTeacherSession(session),
    login: setSession,
    logout: () => setSession(null),
  };
}
