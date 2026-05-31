"use client";

import { useCallback, useSyncExternalStore } from "react";

import { voiceOrchestrator, type VoiceSnapshot } from "@/lib/voice-orchestrator";

const serverSnapshot: VoiceSnapshot = {
  state: "idle",
  enabled: false,
  liveTranscript: "",
  lastTranscript: "",
  lastReply: "",
  error: null,
  supported: false,
};

export function useVoiceOrchestrator() {
  const snapshot = useSyncExternalStore(
    (listener) => voiceOrchestrator.subscribe(listener),
    () => voiceOrchestrator.getSnapshot(),
    () => serverSnapshot,
  );

  const enable = useCallback(() => voiceOrchestrator.enable(), []);
  const disable = useCallback(() => voiceOrchestrator.disable(), []);
  const toggle = useCallback(() => {
    if (voiceOrchestrator.getSnapshot().enabled) {
      voiceOrchestrator.disable();
    } else {
      void voiceOrchestrator.enable();
    }
  }, []);
  const stopSpeaking = useCallback(() => voiceOrchestrator.stopSpeaking(), []);

  return {
    ...snapshot,
    enable,
    disable,
    toggle,
    stopSpeaking,
  };
}
