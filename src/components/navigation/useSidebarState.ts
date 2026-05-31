import { useCallback, useEffect, useState } from "react";

const COLLAPSED_KEY = (role: string) => `admeasy:sidebar:${role}:collapsed`;
const GROUP_KEY     = (role: string) => `admeasy:sidebar:${role}:groups`;

export function useSidebarCollapsed(role: string) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY(role)) === "1";
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY(role), collapsed ? "1" : "0"); } catch {}
  }, [collapsed, role]);
  const toggle = useCallback(() => setCollapsed(c => !c), []);
  return { collapsed, setCollapsed, toggle };
}

export function useSidebarGroups(role: string, defaults: Record<string, boolean>) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = localStorage.getItem(GROUP_KEY(role));
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch { return defaults; }
  });
  useEffect(() => {
    try { localStorage.setItem(GROUP_KEY(role), JSON.stringify(openMap)); } catch {}
  }, [openMap, role]);
  const setOpen = useCallback((id: string, open: boolean) => {
    setOpenMap(m => ({ ...m, [id]: open }));
  }, []);
  return { openMap, setOpen };
}
