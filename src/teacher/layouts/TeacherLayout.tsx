"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { useTeacherSession } from "../hooks/useTeacherSession";

import ThemeToggle from "@/components/ui/ThemeToggle";
import AdmeasyLogo from "@/components/ui/AdmeasyLogo";

import SidebarShell, {
  MobileMenuTrigger,
} from "@/components/navigation/SidebarShell";

import MobileBottomNav from "@/components/navigation/MobileBottomNav";

import { teacherNavigation } from "@/config/navigation/teacherNavigation";

import type { NavConfig } from "@/components/navigation/types";

import VoiceDock from "@/components/voice/VoiceDock";
import VoiceBridge from "@/components/voice/VoiceBridge";
import { chat as teacherChat } from "@/teacher/services/ai";

interface TeacherLayoutProps {
  children: React.ReactNode;
  basePath?: string;
  navigation?: NavConfig;
}

export default function TeacherLayout({
  children,
  basePath = "/teacher",
  navigation = teacherNavigation,
}: TeacherLayoutProps) {
  const router = useRouter();

  const { teacher, logout } = useTeacherSession();

  const [mobileOpen, setMobileOpen] =
    useState(false);

  function handleLogout() {
    logout();

    router.replace("/login");
  }

  const logoSlot = (
    <>
      <AdmeasyLogo
        size={26}
        state="idle"
      />

      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground tracking-tight">
          Admeasy
        </div>

        <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-mono truncate">
          Teacher
        </div>
      </div>
    </>
  );

  const footerSlot = (
    <div className="flex flex-col min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Signed in
      </div>

      <div className="text-xs font-medium truncate">
        {teacher?.name ?? "—"}
      </div>

      {teacher?.subject && (
        <div className="text-[10px] text-muted-foreground truncate">
          {teacher.subject}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen h-[var(--app-height,100dvh)] bg-background text-foreground flex overflow-hidden">
      <SidebarShell
        config={navigation}
        logoSlot={logoSlot}
        footerSlot={footerSlot}
        onSignOut={handleLogout}
        mobileOpen={mobileOpen}
        onMobileClose={() =>
          setMobileOpen(false)
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between border-b border-border/40 px-3 md:px-6 gap-2">
          <div className="flex items-center gap-2">
            <MobileMenuTrigger
              onClick={() =>
                setMobileOpen(true)
              }
            />

            <div className="md:hidden flex items-center gap-2">
              <AdmeasyLogo
                size={22}
                state="idle"
              />

              <span className="text-sm font-semibold">
                Admeasy
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle compact />
          </div>
        </header>

        <motion.main
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.2,
          }}
          className="flex-1 overflow-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          {children}
        </motion.main>
      </div>

      {navigation.mobileBottom && (
        <MobileBottomNav
          items={navigation.mobileBottom}
        />
      )}

      <VoiceBridge
        workspaceId={teacher?.workspace_id}
        chat={(prompt) =>
          teacherChat(
            "chat",
            prompt,
            teacher
          )
        }
      />

      <VoiceDock />
    </div>
  );
}
