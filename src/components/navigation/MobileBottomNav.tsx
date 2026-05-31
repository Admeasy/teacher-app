"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./types";
import { cn } from "@/lib/utils";

export default function MobileBottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-border/40 grid pb-[env(safe-area-inset-bottom)]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = it.to
          ? it.exact
            ? pathname === it.to
            : pathname === it.to || (pathname?.startsWith(`${it.to}/`) ?? false)
          : false;
        return (
          <Link
            key={it.label}
            href={it.to ?? "#"}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors",
              isActive ? "text-violet-glow" : "text-muted-foreground"
            )}
          >
            {Icon && <Icon size={18} />}
            <span className="truncate">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
