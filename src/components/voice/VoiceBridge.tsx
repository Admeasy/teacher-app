import { useEffect } from "react";
import { setActiveWorkspaceId } from "@/lib/workspace";
import { useAITerminal } from "@/stores/aiTerminalStore";

type ChatFn = (prompt: string) => Promise<string>;

/**
 * Mounts the global voice pipeline for non-admin shells (Teacher / Student).
 *
 * - Mirrors the active workspace id so the voice orchestrator can call TTS / log events.
 * - Listens for `admeasy:terminal-submit` events dispatched by the voice orchestrator,
 *   runs the shell-specific chat() service, and pushes the reply into useAITerminal
 *   so the orchestrator's reply-watcher resolves and triggers TTS.
 */
export default function VoiceBridge({
  workspaceId,
  chat,
}: {
  workspaceId: string | null | undefined;
  chat: ChatFn;
}) {
  useEffect(() => {
    setActiveWorkspaceId(workspaceId ?? null);
    return () => setActiveWorkspaceId(null);
  }, [workspaceId]);

  useEffect(() => {
    function onSubmit(e: Event) {
      const detail = (e as CustomEvent).detail ?? {};
      const text: string = (detail.text ?? "").toString().trim();
      if (!text) return;
      const store = useAITerminal.getState();
      store.pushLog({ t: Date.now(), kind: "user", text });
      chat(text)
        .then((reply) => {
          useAITerminal.getState().pushLog({
            t: Date.now(),
            kind: "ai",
            text: reply || "(no response)",
          });
        })
        .catch((err: any) => {
          useAITerminal.getState().pushLog({
            t: Date.now(),
            kind: "ai",
            text: `Error: ${err?.message || "AI request failed"}`,
          });
        });
    }
    window.addEventListener("admeasy:terminal-submit", onSubmit);
    return () => window.removeEventListener("admeasy:terminal-submit", onSubmit);
  }, [chat]);

  return null;
}
