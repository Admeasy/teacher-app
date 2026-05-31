import { useEffect, useRef, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSkeleton } from "@/components/skeletons";

type State = "checking" | "ok" | "denied";

async function checkSuperAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) return false;
  return data === true;
}

export default function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const checkIdRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    let cancel = false;

    const evaluate = async (userId: string | undefined, checkId: number) => {
      if (!userId) { if (!cancel && checkId === checkIdRef.current) setState("denied"); return; }
      const ok = await checkSuperAdmin(userId);
      if (!cancel && checkId === checkIdRef.current) setState(ok ? "ok" : "denied");
    };

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const checkId = ++checkIdRef.current;
      evaluate(session?.user?.id, checkId);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setState("checking");
      const checkId = ++checkIdRef.current;
      setTimeout(() => evaluate(s?.user?.id, checkId), 0);
    });

    return () => { cancel = true; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (state === "denied") router.replace("/admin/login");
  }, [router, state]);

  if (state === "checking") {
    // Non-blocking: render a skeleton shell so the page never looks blank.
    return (
      <div className="min-h-screen bg-background">
        <DashboardSkeleton />
      </div>
    );
  }
  if (state === "denied") return null;
  return <>{children}</>;
}
