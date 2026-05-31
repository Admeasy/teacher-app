import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Square } from "lucide-react";
import { useVoiceOrchestrator } from "@/hooks/useVoiceOrchestrator";
import AdmeasyLogo, { LogoState } from "@/components/ui/AdmeasyLogo";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadVoiceSettings } from "@/lib/voice-settings";

const LABEL: Record<string, string> = {
  idle: 'Say "Hey Kyro"',
  listening: "Listening…",
  thinking: "Thinking…",
  processing: "Processing…",
  executing: "Executing…",
  speaking: "Speaking…",
  error: "Mic blocked",
};

export default function VoiceDock() {
  const v = useVoiceOrchestrator();
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState(loadVoiceSettings());
  const triedAutoRef = useRef(false);

  // Listen for setting changes
  useEffect(() => {
    const handler = (e: any) => setSettings(e.detail || loadVoiceSettings());
    window.addEventListener("admeasy:voice-settings-changed", handler);
    return () => window.removeEventListener("admeasy:voice-settings-changed", handler);
  }, []);

  // Auto-enable on first load (asks for permission once)
  useEffect(() => {
    if (triedAutoRef.current) return;
    if (!v.supported) return;
    if (!settings.autoListen) return;
    if (v.enabled) return;
    triedAutoRef.current = true;
    v.enable().catch(() => { /* user denied — silent */ });
  }, [v.supported, settings.autoListen, v.enabled]);

  if (!v.supported) return null;
  if (!settings.dockVisible) return null;
  if (isMobile && !settings.dockOnMobile) return null;

  const logoState: LogoState = v.enabled ? (v.state as LogoState) : "idle";
  // Only show overlay during active states — never reveal stale prior transcripts.
  const activeStates = ["listening", "thinking", "processing", "executing", "speaking"];
  const showOverlay = v.enabled && activeStates.includes(v.state) && (!!v.liveTranscript || v.state !== "listening" || !!v.lastReply);
  const isAnimating = ["listening", "thinking", "processing", "executing", "speaking"].includes(v.state);

  return (
    <>
      {/* Floating dock — bottom center, safe-area aware, never overlaps sidebar */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <motion.button
          onClick={v.toggle}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="pointer-events-auto group flex items-center gap-3 pl-2 pr-4 py-2 rounded-full
            backdrop-blur-2xl bg-black/40 border border-violet/30
            shadow-[0_8px_40px_-8px_hsl(263_80%_55%/0.55)]
            hover:border-violet/60 transition-all"
          title={v.enabled ? "Disable voice" : "Enable voice"}
        >
          <div className="relative">
            <AdmeasyLogo state={logoState} size={40} />
            {!v.enabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-full backdrop-blur-sm">
                <MicOff size={14} className="text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex flex-col items-start min-w-0">
            <span className="text-[10px] uppercase tracking-[0.18em] text-violet-glow/80 font-mono">
              {v.enabled ? v.state : "voice off"}
            </span>
            <span className="text-xs text-foreground/90 truncate max-w-[200px]">
              {v.enabled ? LABEL[v.state] : "Tap to enable"}
            </span>
          </div>
          {/* Waveform bars when speaking/listening */}
          {isAnimating && (
            <div className="flex items-end gap-[2px] h-5 ml-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-[2px] rounded-full bg-violet-glow"
                  animate={{ height: [4, 16, 6, 18, 4] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
                />
              ))}
            </div>
          )}
        </motion.button>

        {/* Stop-speaking button — only while AI is speaking */}
        <AnimatePresence>
          {v.state === "speaking" && (
            <motion.button
              key="stop-tts"
              initial={{ opacity: 0, scale: 0.8, x: -8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -8 }}
              onClick={(e) => { e.stopPropagation(); v.stopSpeaking(); }}
              title="Stop speaking"
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-full
                backdrop-blur-2xl bg-danger/80 hover:bg-danger text-white border border-danger
                shadow-[0_8px_40px_-8px_hsl(0_80%_55%/0.55)] transition-all"
            >
              <Square size={12} fill="currentColor" />
              <span className="text-[11px] font-mono uppercase tracking-wider">Stop</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Transcript / reply overlay (above dock) */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed left-1/2 -translate-x-1/2 z-50 w-[min(640px,92vw)] pointer-events-none"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)" }}
          >
            <div className="rounded-2xl border border-violet/30 bg-black/55 backdrop-blur-2xl
              shadow-[0_20px_60px_-20px_hsl(263_90%_60%/0.6)] p-4">
              <div className="flex items-center gap-2 text-[10px] text-violet-glow mb-2 uppercase tracking-[0.2em] font-mono">
                <Mic size={11} />
                <span>{v.state}</span>
              </div>
              {v.liveTranscript && (
                <p className="text-foreground text-base leading-relaxed">{v.liveTranscript}</p>
              )}
              {!v.liveTranscript && (v.state === "processing" || v.state === "executing" || v.state === "thinking") && v.lastTranscript && (
                <p className="text-foreground/80 text-sm">{v.lastTranscript}</p>
              )}
              {v.lastReply && v.state === "speaking" && (
                <p className="mt-2 text-sm text-violet-glow/90 italic line-clamp-3">{v.lastReply}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
