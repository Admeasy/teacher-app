"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, ThemeMode } from "@/contexts/ThemeContext";
import { motion } from "framer-motion";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolved, setTheme } = useTheme();

  if (compact) {
    return (
      <button
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
className="h-11 w-11 rounded-full border border-border/60 glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
        title={`Switch to ${resolved === "dark" ? "light" : "dark"} mode`}
        aria-label="Toggle theme"
      >
        <motion.span
          key={resolved}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex"
        >
          {resolved === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </motion.span>
      </button>
    );
  }

  const opts: { v: ThemeMode; icon: any; label: string }[] = [
    { v: "light", icon: Sun, label: "Light" },
    { v: "system", icon: Monitor, label: "Auto" },
    { v: "dark", icon: Moon, label: "Dark" },
  ];

  return (
    <div className="glass rounded-full p-1 flex items-center gap-0.5">
      {opts.map(({ v, icon: Icon, label }) => {
        const active = theme === v;
        return (
          <button
            key={v}
            onClick={() => setTheme(v)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              active ? "text-violet-glow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="theme-pill"
                className="absolute inset-0 rounded-full bg-violet/15 border border-violet/30"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon size={13} className="relative z-10" />
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
