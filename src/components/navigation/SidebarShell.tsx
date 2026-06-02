"use client";

import { ReactNode, useMemo, memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { NavConfig, NavItem } from "./types";
import { useSidebarCollapsed, useSidebarGroups } from "./useSidebarState";
import { cn } from "@/lib/utils";

interface ShellProps {
  config: NavConfig;
  logoSlot?: ReactNode;
  footerSlot?: ReactNode;
  onSignOut?: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function isActivePath(pathname: string | null, item: NavItem): boolean {
  if (!item.to || !pathname) return false;
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

function groupHasActive(pathname: string | null, item: NavItem): boolean {
  if (isActivePath(pathname, item)) return true;
  return (item.children ?? []).some(c => groupHasActive(pathname, c));
}

const Leaf = memo(function Leaf({
  item, depth, collapsed, onNavigate,
}: { item: NavItem; depth: number; collapsed: boolean; onNavigate?: () => void; }) {
  const Icon = item.icon;
  const dim = item.comingSoon;
  const pathname = usePathname();
  const isActive = isActivePath(pathname, item);

  return (
    <Link
      href={item.to!}
      onClick={(e) => {
        if (dim) { e.preventDefault(); return; }
        onNavigate?.();
      }}
      aria-current={isActive && !dim ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg transition-all duration-150",
        collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
        depth > 0 && !collapsed && "ml-3 pl-4 border-l border-border/40",
        dim
          ? "text-muted-foreground/50 cursor-not-allowed"
          : isActive
            ? "bg-violet/10 text-violet-glow"
            : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
      )}
    >
      {isActive && !dim && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-violet-glow" />
      )}
      {Icon && <Icon size={depth > 0 ? 14 : 16} className="shrink-0" />}
      {!collapsed && <span className="flex-1 text-[13px] truncate">{item.label}</span>}
      {!collapsed && item.badge != null && (
        <span className="text-[10px] font-mono px-1.5 py-[1px] rounded-full bg-violet/20 text-violet-glow">{item.badge}</span>
      )}
      {!collapsed && dim && (
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60">soon</span>
      )}
      {collapsed && (
        <div className="pointer-events-none absolute left-full ml-2 px-2 py-1 bg-surface-2 text-foreground text-[11px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-lg">
          {item.label}
        </div>
      )}
    </Link>
  );
});

function GroupItem({
  item, roleId, collapsed, onNavigate, sectionId,
}: { item: NavItem; roleId: string; collapsed: boolean; onNavigate?: () => void; sectionId: string; }) {
  const pathname = usePathname();
  const groupId = `${sectionId}::${item.label}`;
  const hasActive = useMemo(() => groupHasActive(pathname, item), [pathname, item]);
  const { openMap, setOpen } = useSidebarGroups(roleId, {});
  const open = openMap[groupId] ?? hasActive;

  if (collapsed) {
    // collapsed: render children flat as icon-only leaves (skip group header)
    return (
      <div className="flex flex-col gap-0.5">
        {(item.children ?? []).map(c =>
          c.to ? <Leaf key={c.label} item={c} depth={0} collapsed onNavigate={onNavigate} /> : null
        )}
      </div>
    );
  }

  const Icon = item.icon;
  return (
    <Collapsible.Root open={open} onOpenChange={(o) => setOpen(groupId, o)}>
      <Collapsible.Trigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors",
            hasActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
          )}
        >
          {Icon && <Icon size={16} className="shrink-0" />}
          <span className="flex-1 text-left truncate">{item.label}</span>
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden">
        <div className="mt-0.5 flex flex-col gap-0.5">
          {(item.children ?? []).map(c =>
            c.children
              ? <GroupItem key={c.label} item={c} roleId={roleId} collapsed={false} onNavigate={onNavigate} sectionId={groupId} />
              : c.to
                ? <Leaf key={c.label} item={c} depth={1} collapsed={false} onNavigate={onNavigate} />
                : null
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function SidebarBody({ config, logoSlot, footerSlot, onSignOut, collapsed, onToggleCollapsed, onNavigate }: {
  config: NavConfig; logoSlot?: ReactNode; footerSlot?: ReactNode; onSignOut?: () => void;
  collapsed: boolean; onToggleCollapsed: () => void; onNavigate?: () => void;
}) {
  return (
    <div className="h-full flex-1 flex flex-col glass-strong border-r border-border/40 overflow-hidden">
      <div className={cn("p-3 flex items-center border-b border-border/40", collapsed ? "justify-center" : "gap-3")}>
        {logoSlot}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-3">
        {config.sections.filter(s => s.items.some(i => !i.hidden)).map((section) => (
          <div key={section.id} className="flex flex-col gap-0.5">
            {!collapsed && section.label && (
              <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {section.label}
              </div>
            )}
            {section.items.filter(i => !i.hidden).map((item) =>
              item.children
                ? <GroupItem key={item.label} item={item} roleId={config.roleId} collapsed={collapsed} onNavigate={onNavigate} sectionId={section.id} />
                : item.to
                  ? <Leaf key={item.label} item={item} depth={0} collapsed={collapsed} onNavigate={onNavigate} />
                  : null
            )}
          </div>
        ))}
      </nav>

      <div className={cn("p-2 border-t border-border/40 flex items-center", collapsed ? "justify-center flex-col gap-1" : "justify-between gap-2")}>
        {!collapsed && footerSlot}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapsed}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 hidden md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2"
              aria-label="Log out"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SidebarShell({ config, logoSlot, footerSlot, onSignOut, mobileOpen, onMobileClose }: ShellProps) {
  const { collapsed, toggle } = useSidebarCollapsed(config.roleId);

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 60 : 232 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="hidden md:flex shrink-0 h-full"
      >
        <SidebarBody
          config={config} logoSlot={logoSlot} footerSlot={footerSlot} onSignOut={onSignOut}
          collapsed={collapsed} onToggleCollapsed={toggle}
        />
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] z-50 md:hidden bg-background"
            >
              <div className="absolute top-[calc(1.25rem+env(safe-area-inset-top))] right-4 z-10">
                <button onClick={onMobileClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-2/80 backdrop-blur-md border border-border/40 shadow-xl active:scale-95 transition-transform">
                  <X size={18} />
                </button>
              </div>
              <div className="h-full flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <SidebarBody
                  config={config} logoSlot={logoSlot} footerSlot={footerSlot} onSignOut={onSignOut}
                  collapsed={false} onToggleCollapsed={() => { }}
                  onNavigate={onMobileClose}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export function MobileMenuTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 md:hidden" aria-label="Open menu">
      <Menu size={20} />
    </button>
  );
}
