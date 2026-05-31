import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, School, Settings as SettingsIcon, LogOut, Menu, X, ShieldCheck, BookOpen, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ThemeToggle from "@/components/ui/ThemeToggle";

const navItems = [
  { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/schools",   icon: School,          label: "Manage Schools" },
  { to: "/admin/knowledge", icon: BookOpen,        label: "Knowledge Base" },
  { to: "/admin/ai-logs",   icon: Sparkles,        label: "AI Observability" },
  { to: "/admin/settings",  icon: SettingsIcon,    label: "Settings" },
];

export default function AdminShell({ children, title }: { children: ReactNode; title?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/admin/login");
  }

  const SidebarBody = (
    <div className="h-full flex flex-col">
      <div className="px-5 py-5 border-b border-border/40">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-violet-glow" />
          <span>Super <span className="gradient-text">Admin</span></span>
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] mt-1 ml-6">
          Admeasy Console
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navItems.map((it) => (
          <Link
            key={it.to}
            href={it.to}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              pathname === it.to || (pathname?.startsWith(`${it.to}/`) ?? false)
                ? "bg-violet/15 text-foreground border border-violet/30"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-border/40">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full bg-background text-foreground flex overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 glass-strong border-r border-border/40 flex-col">
        {SidebarBody}
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.25 }}
              className="fixed top-0 left-0 bottom-0 w-64 z-50 glass-strong border-r border-border/40 md:hidden"
            >
              {SidebarBody}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-4 md:px-6 flex items-center justify-between border-b border-border/40 glass">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-lg hover:bg-muted/40"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-medium text-foreground">{title ?? ""}</h1>
          </div>
          <ThemeToggle compact />
        </header>

        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
