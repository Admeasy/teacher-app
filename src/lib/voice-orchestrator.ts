/* eslint-disable @typescript-eslint/no-explicit-any */
// Singleton voice orchestrator — wake → listen → terminal pipeline → TTS → resume.
// Only one SpeechRecognition instance is ever created.

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "processing"
  | "executing"
  | "speaking"
  | "error";

export interface VoiceSnapshot {
  state: VoiceState;
  enabled: boolean;
  liveTranscript: string;
  lastTranscript: string;
  lastReply: string;
  error: string | null;
  supported: boolean;
}

type Listener = (snap: VoiceSnapshot) => void;

import { loadVoiceSettings } from "./voice-settings";
import { enqueueTranscript } from "./voice-offline-queue";
import { supabase } from "@/integrations/supabase/client";
import { getActiveWorkspaceId } from "./workspace";

// All recognized variants normalize to canonical "hey kyro".
const WAKE_WORDS = [
  "hey kyro", "hey kairo", "hey kaairo", "hey kairos", "hey kyros",
  "hey cairo", "hey kiro", "hey keiro", "hey kero", "hey kaaero", "hey kyrow",
  "ok kyro", "okay kyro", "ok kairo", "okay kairo", "ok kaairo", "okay kaairo",
  "ok kiro", "okay kiro", "ok cairo", "okay cairo",
  "hi kyro", "hi kairo", "hi kaairo", "yo kyro", "yo kairo",
  "kyro", "kairo", "kaairo", "kiro", "kaaero", "cairo",
];
const CANONICAL_WAKE = "hey kyro";
const COOLDOWN_MS = 800;
const MAX_COMMAND_CHARS = 1800; // ~250 words
const DOMAIN_GRAMMAR = [
  "Admeasy", "IIM", "UPSC", "IIT", "CUET", "SRCC", "Delhi University", "DU", "North Campus",
  "mentors", "fee defaulters", "attendance shortage", "call parents", "call teachers",
  "teacher records", "WhatsApp drafts", "fee reminders", "attendance alerts", "IIT JEE", "NEET", "CAT", "IPMAT",
  "student records", "call queue", "voice assistant", "AI terminal", "OpenRouter", "Exotel", "Resend",
];

async function logVoiceEvent(payload: {
  event_type: "wake" | "command" | "error" | "offline_queued" | "offline_replayed";
  transcript?: string;
  status?: string;
  latency_ms?: number;
  conversation_id?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const workspace_id = getActiveWorkspaceId();
    if (!workspace_id) return;
    await supabase.from("voice_events").insert({
      workspace_id,
      event_type: payload.event_type,
      transcript: payload.transcript ?? null,
      status: payload.status ?? null,
      latency_ms: payload.latency_ms ?? null,
      conversation_id: payload.conversation_id ?? null,
      page_context: typeof window !== "undefined" ? window.location.pathname : null,
      metadata: (payload.metadata ?? {}) as never,
    });
  } catch { /* best-effort */ }
}

class VoiceOrchestrator {
  private rec: any = null;
  private snap: VoiceSnapshot = {
    state: "idle",
    enabled: false,
    liveTranscript: "",
    lastTranscript: "",
    lastReply: "",
    error: null,
    supported: typeof window !== "undefined" &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
  private listeners = new Set<Listener>();
  private wakeMode = false;
  private cmdBuffer = "";        // accumulated text across recognition sessions
  private sessionText = "";      // text from the CURRENT recognition session only
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private followupTimer: ReturnType<typeof setTimeout> | null = null;
  private cooldownUntil = 0;
  private currentAudio: HTMLAudioElement | null = null;
  private wantListening = false;
  private finalizing = false;
  private resultBaseLen = 0; // index into event.results to start scanning from

  // — pub/sub —
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }
  getSnapshot(): VoiceSnapshot { return this.snap; }
  private patch(p: Partial<VoiceSnapshot>) {
    this.snap = { ...this.snap, ...p };
    for (const fn of this.listeners) fn(this.snap);
  }
  private setState(s: VoiceState) { this.patch({ state: s }); }

  // — recognition —
  private build() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-IN";
    try {
      const SpeechGrammarList = (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList;
      if (SpeechGrammarList) {
        const list = new SpeechGrammarList();
        list.addFromString(`#JSGF V1.0; grammar admeasy; public <term> = ${DOMAIN_GRAMMAR.join(" | ")} ;`, 1);
        r.grammars = list;
      }
    } catch { /* grammar hints are best-effort */ }

    r.onresult = (event: any) => {
      // Only scan results from resultBaseLen onward — prevents old transcripts
      // (already handled wake / already finalized commands) from re-firing.
      let full = "";
      let anyFinal = false;
      const start = Math.min(this.resultBaseLen, event.results.length);
      for (let i = start; i < event.results.length; i++) {
        const res = event.results[i];
        full += (res[0]?.transcript ?? "") + " ";
        if (res.isFinal) anyFinal = true;
      }
      const text = full.trim();
      const lower = text.toLowerCase();
      if (!lower) return;

      if (!this.wakeMode) {
        if (Date.now() < this.cooldownUntil) return;
        const wake = this.findWake(lower);
        if (wake.after >= 0) {
          this.wakeMode = true;
          this.cmdBuffer = "";
          this.sessionText = "";
          if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
          if (this.followupTimer) { clearTimeout(this.followupTimer); this.followupTimer = null; }
          this.interruptTTS();
          this.beep();
          this.setState("listening");
          logVoiceEvent({
            event_type: "wake",
            transcript: CANONICAL_WAKE,
            metadata: { matched_variant: wake.matched, raw: lower.slice(0, wake.after) },
          });
          const tail = lower.slice(wake.after).replace(/^[\s,.:!?-]+/, "").trim();
          if (tail) {
            this.sessionText = tail;
            this.patch({ liveTranscript: tail });
          } else {
            this.patch({ liveTranscript: "" });
          }
          this.armSilence();
          this.resultBaseLen = event.results.length;
        }
        return;
      }

      // In wake mode — strip wake phrase ONLY when at the very start of the segment.
      // Mid-utterance fuzzy hits (e.g. "the day") must not chop the user's prior words.
      const wm = this.findWake(lower);
      const cleaned = (wm.after >= 0 && wm.after <= 24 ? text.slice(wm.after) : text)
        .replace(/^[\s,.:!?-]+/, "")
        .trim();
      this.sessionText = cleaned;
      let combined = (this.cmdBuffer + " " + cleaned).trim();
      if (combined.length > MAX_COMMAND_CHARS) combined = combined.slice(-MAX_COMMAND_CHARS);
      this.patch({ liveTranscript: combined });
      this.armSilence();
    };

    r.onerror = (e: any) => {
      const err = e?.error || "speech-error";
      if (err === "no-speech" || err === "aborted") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        this.patch({ error: err, enabled: false });
        this.setState("error");
        this.wantListening = false;
      }
    };

    r.onstart = () => {
      // New recognition session: results array is empty again, so reset the index.
      this.resultBaseLen = 0;
      this.sessionText = "";
    };

    r.onend = () => {
      // Flush whatever this session captured into the persistent buffer so
      // multi-line dictation across auto-restarts is not lost.
      if (this.wakeMode && this.sessionText) {
        this.cmdBuffer = (this.cmdBuffer + " " + this.sessionText).trim();
        this.sessionText = "";
      }
      if (this.wantListening) {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          try { r.start(); } catch { /* already started */ }
        }, 200);
      }
    };

    return r;
  }
  private findWake(text: string): { after: number; matched: string | null } {
    const sens = loadVoiceSettings().wakeSensitivity;
    // Sort longer phrases first so "hey admeasy" wins over bare "admeasy".
    const sorted = [...WAKE_WORDS].sort((a, b) => b.length - a.length);
    for (const w of sorted) {
      const i = text.indexOf(w);
      if (i >= 0) return { after: i + w.length, matched: w };
    }
    if (sens === "strict") return { after: -1, matched: null };
    // Fuzzy: any "ad/ed/am-..." token preceded optionally by hey/hi/ok/yo
    const m = text.match(/(?:^|\s)(hey|hi|ok|okay|yo)?\s*(ad|ed|am|at)\w{1,8}/);
    if (m && /[mn]/.test(m[2] + m[0].slice(-3))) {
      return { after: (m.index ?? 0) + m[0].length, matched: m[0].trim() };
    }
    if (sens === "loose") {
      const m2 = text.match(/(?:^|\s)(ok|okay|hi|hey)\s+\w{2,12}/);
      if (m2) return { after: (m2.index ?? 0) + m2[0].length, matched: m2[0].trim() };
    }
    return { after: -1, matched: null };
  }

  private armSilence(ms?: number) {
    const fallback = loadVoiceSettings().silenceMs;
    // Floor at 4s so multi-sentence dictation isn't cut off on a breath.
    const wait = Math.max(ms ?? fallback, 4000);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.finalize(), wait);
  }

  private clearTranscriptBuffers() {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    this.cmdBuffer = "";
    this.sessionText = "";
    this.resultBaseLen = 0;
    this.patch({ liveTranscript: "" });
  }

  private restartRecognitionSession() {
    try { this.rec?.stop(); } catch { /* onend will restart if enabled */ }
  }

  /** Open a 10-second window where the user can speak follow-up without the wake word. */
  private openFollowupWindow() {
    if (this.followupTimer) clearTimeout(this.followupTimer);
    this.wakeMode = true;
    this.cmdBuffer = "";
    this.sessionText = "";
    // Clear stale lastTranscript so the dock doesn't show the previous command.
    this.patch({ liveTranscript: "", lastTranscript: "" });
    this.setState("listening");
    this.restartRecognitionSession();
    this.followupTimer = setTimeout(() => {
      this.wakeMode = false;
      this.followupTimer = null;
      if (this.snap.state === "listening") this.setState("idle");
    }, 10_000);
  }

  private async finalize() {
    if (this.finalizing) return;
    // Combine cross-session buffer with anything still in the current session.
    const combinedRaw = (this.cmdBuffer + " " + this.sessionText).trim();
    const cmd = this.normalizeTranscript(combinedRaw);
    this.wakeMode = false;
    this.cooldownUntil = Date.now() + COOLDOWN_MS;
    this.clearTranscriptBuffers();

    if (!cmd) { this.setState("idle"); return; }

    // Offline → queue and speak fallback
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      enqueueTranscript(cmd);
      logVoiceEvent({ event_type: "offline_queued", transcript: cmd });
      this.patch({ lastTranscript: cmd, lastReply: "Offline. Saved for replay." });
      try { await this.speak("You're offline. I'll run that as soon as you reconnect."); }
      catch { this.setState("idle"); }
      return;
    }

    this.finalizing = true;
    this.patch({ lastTranscript: cmd, lastReply: "" });
    this.setState("processing");
    const startedAt = Date.now();

    try {
      const reply = await this.executeViaTerminal(cmd);
      const latency_ms = Date.now() - startedAt;
      logVoiceEvent({
        event_type: "command",
        transcript: cmd,
        status: reply ? "success" : "no_reply",
        latency_ms,
      });
      // Persist to history table so the Voice Console history tab populates.
      try {
        const workspace_id = getActiveWorkspaceId();
        if (workspace_id) {
          await supabase.from("voice_command_history").insert({
            workspace_id,
            transcript: cmd,
            response: reply || null,
            page_context: typeof window !== "undefined" ? window.location.pathname : null,
          });
        }
      } catch { /* best-effort */ }
      if (reply && reply.trim() && loadVoiceSettings().ttsEnabled) {
        await this.speak(reply);
        this.openFollowupWindow();
      } else if (reply && reply.trim()) {
        this.patch({ lastReply: reply });
        this.openFollowupWindow();
      } else {
        this.openFollowupWindow();
      }
    } catch (e: any) {
      logVoiceEvent({
        event_type: "error",
        transcript: cmd,
        status: e?.message ?? "command-failed",
        latency_ms: Date.now() - startedAt,
      });
      this.patch({ error: e?.message ?? "command-failed" });
      this.setState("error");
      setTimeout(() => this.setState("idle"), 1200);
    } finally {
      this.finalizing = false;
    }
  }

  private normalizeTranscript(text: string) {
    return text
      .replace(/\badd\s*measy\b/gi, "Admeasy")
      .replace(/\bad\s*measy\b/gi, "Admeasy")
      .replace(/\badmeasi\b/gi, "Admeasy")
      .replace(/\badminzy\b/gi, "Admeasy")
      .replace(/\badmizy\b/gi, "Admeasy")
      .replace(/\badmize\b/gi, "Admeasy")
      .replace(/\bupsc\b/gi, "UPSC")
      .replace(/\biit\b/gi, "IIT")
      .replace(/\biim\b/gi, "IIM")
      .replace(/\bc u e t\b/gi, "CUET")
      .replace(/\bs r c c\b/gi, "SRCC")
      .replace(/\bcall\s+q\b/gi, "call queue")
      .replace(/\bwhat'?s\s*app\b/gi, "WhatsApp")
      .trim();
  }

  /**
   * Voice acts as a virtual keyboard:
   *  - dispatch `admeasy:terminal-submit` so AIPanel runs the SAME submit handler as typed input
   *  - watch the shared terminal log store for the next assistant reply
   *  - speak that reply via TTS
   */
  private executeViaTerminal(cmd: string): Promise<string> {
    return new Promise((resolve) => {
      import("@/stores/aiTerminalStore").then(({ useAITerminal }) => {
        const startLen = useAITerminal.getState().log.length;
        let done = false;
        const finish = (text: string) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          unsub();
          this.patch({ lastReply: text });
          resolve(text);
        };
        const unsub = useAITerminal.subscribe((s) => {
          if (done) return;
          const next = s.log.slice(startLen);
          const ai = [...next].reverse().find((l) => l.kind === "ai");
          if (ai && ai.text) finish(ai.text);
        });
        const timeout = setTimeout(() => finish(""), 60_000);

        window.dispatchEvent(new CustomEvent("admeasy:terminal-submit", {
          detail: { text: cmd, source: "voice" },
        }));
      });
    });
  }

  // — TTS —
  async speak(text: string) {
    this.interruptTTS();
    this.setState("speaking");
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL ??
        process.env.VITE_SUPABASE_URL ??
        "";
      const anon =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${baseUrl}/functions/v1/tts`;
      const workspace_id = getActiveWorkspaceId();
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token ?? anon;
      if (!workspace_id) throw new Error("tts-no-workspace");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ text: text.slice(0, 1500), workspace_id }),
      });
      if (!res.ok) throw new Error("tts");
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve(); };
        audio.play().catch(() => resolve());
      });
    } catch {
      try {
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(text);
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        });
      } catch { /* noop */ }
    } finally {
      this.currentAudio = null;
      this.setState("idle");
    }
  }

  interruptTTS() {
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch { /* noop */ }
      this.currentAudio = null;
    }
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  }

  /** Public: user-triggered stop while AI is speaking. */
  stopSpeaking() {
    this.interruptTTS();
    if (this.snap.state === "speaking") this.setState("idle");
  }

  beep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close().catch(() => {}), 400);
    } catch { /* noop */ }
  }

  // — public lifecycle —
  async enable() {
    if (!this.snap.supported) { this.patch({ error: "Not supported" }); return; }
    if (this.wantListening) return;
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { /* noop */ }
    this.wantListening = true;
    if (!this.rec) this.rec = this.build();
    try { this.rec.start(); } catch { /* already started */ }
    this.patch({ enabled: true, error: null });
    this.setState("idle");
  }

  disable() {
    this.wantListening = false;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.followupTimer) { clearTimeout(this.followupTimer); this.followupTimer = null; }
    this.interruptTTS();
    try { this.rec?.stop(); } catch { /* noop */ }
    this.patch({ enabled: false });
    this.setState("idle");
  }

  /** Called externally by AI terminal when an AI response is being typed (executing). */
  reportExecuting() { if (this.snap.state === "processing") this.setState("executing"); }
}

export const voiceOrchestrator = new VoiceOrchestrator();
