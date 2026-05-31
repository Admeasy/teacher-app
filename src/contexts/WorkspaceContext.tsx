import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateProactiveNotifications } from "@/lib/proactive";
import { setActiveWorkspaceId } from "@/lib/workspace";
import { installOfflineReplay } from "@/lib/voice-offline-queue";
import type { Session, User } from "@supabase/supabase-js";

interface WorkspaceCtx {
  session: Session | null;
  user: User | null;
  workspaceId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<WorkspaceCtx>({
  session: null, user: null, workspaceId: null, loading: true, signOut: async () => {},
});

function deriveWorkspaceId(user: User | null): string | null {
  const email = user?.email ?? "";
  // Format: {SchoolId}@admeasy.in
  const m = email.match(/^([^@]+)@admeasy\.in$/i);
  return m ? m[1] : null;
}

// Self-provision the workspace row + membership row on first login.
// RLS policies "users can create own derived workspace" and "users can create own derived membership"
// permit these inserts when the JWT email is *@admeasy.in and workspace_id == email-local-part.
async function ensureMembership(userId: string | undefined, wid: string | null, email?: string | null) {
  if (!userId || !wid) return;
  try {
    await supabase
      .from("workspaces")
      .upsert({ id: wid, name: email ?? wid }, { onConflict: "id", ignoreDuplicates: true });
    await supabase
      .from("workspace_members")
      .upsert({ user_id: userId, workspace_id: wid, role: "admin" }, { onConflict: "user_id,workspace_id", ignoreDuplicates: true });
  } catch { /* swallow — non-fatal */ }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    installOfflineReplay();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      const wid = deriveWorkspaceId(s?.user ?? null);
      setWorkspaceId(wid);
      setActiveWorkspaceId(wid);
      setLoading(false);
      if (wid && s?.user?.id) {
        ensureMembership(s.user.id, wid, s.user.email);
        setTimeout(() => generateProactiveNotifications(wid).catch(() => {}), 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const wid = deriveWorkspaceId(session?.user ?? null);
      setWorkspaceId(wid);
      setActiveWorkspaceId(wid);
      setLoading(false);
      if (wid && session?.user?.id) {
        ensureMembership(session.user.id, wid, session.user.email);
        generateProactiveNotifications(wid).catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setWorkspaceId(null);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, workspaceId, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useWorkspace = () => useContext(Ctx);
