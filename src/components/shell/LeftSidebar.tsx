import { useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/lib/supabase";
import SidebarShell, { MobileMenuTrigger } from "@/components/navigation/SidebarShell";
import { adminNavigation } from "@/config/navigation/adminNavigation";
import logoOrb from "@/assets/admeasy-mark.png";

interface Props {
  collapsed: boolean;            // legacy props, ignored — SidebarShell manages its own state
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function LeftSidebar({ mobileOpen, onMobileClose }: Props) {
  const { workspaceId, signOut } = useWorkspace();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    async function loadUnread() {
      const { count } = await supabase
        .from("notifications").select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId!).eq("status", "unread");
      if (!cancelled) setUnread(count ?? 0);
    }
    loadUnread();
    const ch = supabase
      .channel("sidebar-" + workspaceId)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `workspace_id=eq.${workspaceId}` }, loadUnread)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [workspaceId]);

  // inject unread badge onto Notifications item
  const config = {
    ...adminNavigation,
    sections: adminNavigation.sections.map(s => ({
      ...s,
      items: s.items.map(it => it.children
        ? { ...it, children: it.children.map(c => c.to === "/notifications" ? { ...c, badge: unread || undefined } : c) }
        : it
      ),
    })),
  };

  const logoSlot = (
    <>
      <img src={logoOrb.src} alt="Admeasy" className="w-8 h-8 rounded-full shrink-0" style={{ filter: "drop-shadow(0 0 12px hsl(263 80% 65% / 0.45))" }} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground tracking-tight">Admeasy</div>
        <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-mono truncate">AI Operations</div>
      </div>
    </>
  );

  const footerSlot = (
    <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Admin</span>
  );

  return (
    <SidebarShell
      config={config}
      logoSlot={logoSlot}
      footerSlot={footerSlot}
      onSignOut={signOut}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
    />
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return <MobileMenuTrigger onClick={onClick} />;
}
