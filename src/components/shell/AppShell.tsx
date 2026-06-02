import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LeftSidebar, { MobileMenuButton } from "./LeftSidebar";
import AIPanel from "./AIPanel";
import VoiceDock from "@/components/voice/VoiceDock";
import { Terminal } from "lucide-react";
import { useAITerminal } from "@/stores/aiTerminalStore";
import CommandPalette from "@/components/ai/CommandPalette";
import { useAIRealtime } from "@/lib/ai/realtime";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface Props {
  children: ReactNode;
  contextLabel?: string;
}

export default function AppShell({ children, contextLabel }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const terminalExpanded = useAITerminal(s => s.expanded);
  const setTerminalExpanded = (v: boolean) => useAITerminal.getState().set("expanded", v);
  const { workspaceId } = useWorkspace();
  useAIRealtime(workspaceId);

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex overflow-hidden">
      <LeftSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main content */}
      <AnimatePresence mode="wait">
        {!terminalExpanded && (
          <motion.main
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col min-w-0"
          >
            {/* Mobile header */}
            <div className="h-12 flex items-center justify-between px-4 glass border-b border-border/40 md:hidden">
              <div className="flex items-center">
                <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
                <span className="ml-3 text-sm font-medium text-foreground">Admeasy AI</span>
              </div>
              <button
                onClick={() => setTerminalExpanded(true)}
                className="p-2 rounded-lg text-violet-glow hover:bg-violet/10 transition-colors"
                title="Open AI Terminal"
              >
                <Terminal size={18} />
              </button>
            </div>
            {children}
          </motion.main>
        )}
      </AnimatePresence>

      {/* AI Panel — reads expanded state from global store so it persists across routes */}
      <AIPanel contextLabel={contextLabel} />

      {/* Hands-free voice runtime */}
      <VoiceDock />

      {/* Global AI command palette (⌘K) */}
      <CommandPalette />
    </div>
  );
}
