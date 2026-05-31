/* eslint-disable @typescript-eslint/no-explicit-any */
// Production voice runtime — wake-word, continuous listen, silence detect, TTS interrupt.
import { supabase } from "@/integrations/supabase/client";
import { getActiveWorkspaceId } from "./workspace";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export type VoiceState =
  | "idle"
  | "wake_detected"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface VoiceRuntimeOptions {
  wakeWords?: string[];
  silenceMs?: number;
  cooldownMs?: number;
  lang?: string;
  onState?: (s: VoiceState) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onCommand: (cmd: string) => Promise<string | void> | string | void;
  onError?: (err: string) => void;
}

const DEFAULT_WAKE = [
  "hey kyro",
  "hey kairo",
  "hey kaairo",
  "hey kiro",
  "hey cairo",
  "ok kyro",
  "okay kyro",
  "ok kairo",
  "okay kairo",
  "kyro",
  "kairo",
  "kaairo",
  "kiro",
  "kaaero",
];

export class VoiceRuntime {
  private rec: any = null;
  private opts: Required<Omit<VoiceRuntimeOptions, "onState" | "onTranscript" | "onError">> &
    Pick<VoiceRuntimeOptions, "onState" | "onTranscript" | "onError">;
  private wakeMode = false;
  private commandBuffer = "";
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private cooldownUntil = 0;
  private currentAudio: HTMLAudioElement | null = null;
  private state: VoiceState = "idle";
  private wantListening = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private finalizing = false;

  constructor(options: VoiceRuntimeOptions) {
    this.opts = {
      wakeWords: options.wakeWords ?? DEFAULT_WAKE,
      silenceMs: options.silenceMs ?? 1800,
      cooldownMs: options.cooldownMs ?? 1500,
      lang: options.lang ?? "en-US",
      onCommand: options.onCommand,
      onState: options.onState,
      onTranscript: options.onTranscript,
      onError: options.onError,
    };
  }

  static isSupported() {
    return typeof window !== "undefined" &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  private setState(s: VoiceState) {
    this.state = s;
    this.opts.onState?.(s);
  }

  private buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.opts.lang;

    rec.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const heard = (final + " " + interim).toLowerCase().trim();
      if (!heard) return;

      if (!this.wakeMode) {
        if (Date.now() < this.cooldownUntil) return;
        const matchedIdx = this.findWake(heard);
        if (matchedIdx >= 0) {
          this.wakeMode = true;
          this.commandBuffer = "";
          this.setState("wake_detected");
          this.interruptTTS();
          this.playBeep();
          // strip wake phrase + anything before
          const tail = this.stripWakePrefix(heard, matchedIdx);
          if (tail) {
            this.commandBuffer = tail;
            this.opts.onTranscript?.(tail, false);
          }
          this.setState("listening");
          this.armSilence();
        }
        return;
      }

      // In wake mode — accumulate
      this.commandBuffer = (final ? final : interim).trim();
      this.opts.onTranscript?.(this.commandBuffer, !!final);
      this.armSilence();
    };

    rec.onerror = (e: any) => {
      const err = e?.error || "speech-error";
      if (err === "no-speech" || err === "aborted") return;
      this.opts.onError?.(err);
      if (err === "not-allowed" || err === "service-not-allowed") {
        this.setState("error");
        this.wantListening = false;
      }
    };

    rec.onend = () => {
      if (this.wantListening) {
        // auto-restart with tiny debounce
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          try { rec.start(); } catch { /* already started */ }
        }, 250);
      }
    };

    return rec;
  }

  private findWake(text: string): number {
    for (const w of this.opts.wakeWords) {
      const idx = text.indexOf(w);
      if (idx >= 0) return idx + w.length;
    }
    // fuzzy: starts with "hey" + similar token
    const m = text.match(/hey\s+(ad|ed)\w*/);
    if (m) return (m.index ?? 0) + m[0].length;
    return -1;
  }

  private stripWakePrefix(text: string, after: number): string {
    return text.slice(after).replace(/^[\s,.:!?-]+/, "").trim();
  }

  private armSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.finalizeCommand(), this.opts.silenceMs);
  }

  private async finalizeCommand() {
    if (this.finalizing) return;
    const cmd = this.commandBuffer.trim();
    this.wakeMode = false;
    this.commandBuffer = "";
    this.cooldownUntil = Date.now() + this.opts.cooldownMs;
    if (!cmd) {
      this.setState("idle");
      return;
    }
    this.finalizing = true;
    this.setState("processing");
    try {
      const reply = await this.opts.onCommand(cmd);
      if (typeof reply === "string" && reply.trim()) {
        await this.speak(reply);
      } else {
        this.setState("idle");
      }
    } catch (e: any) {
      this.opts.onError?.(e?.message ?? "command-failed");
      this.setState("idle");
    } finally {
      this.finalizing = false;
    }
  }

  /** Speak text via /functions/v1/tts (returns audio/mpeg). Falls back to SpeechSynthesis. */
  async speak(text: string): Promise<void> {
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
        body: JSON.stringify({ text, workspace_id }),
      });
      if (!res.ok) throw new Error("tts-failed");
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
      // Fallback to browser TTS
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

  playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close().catch(() => {}), 400);
    } catch { /* noop */ }
  }

  async start() {
    if (!VoiceRuntime.isSupported()) {
      this.opts.onError?.("Speech recognition not supported in this browser");
      this.setState("error");
      return;
    }
    if (this.wantListening) return;
    try {
      // Prompt mic permission early
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
    } catch { /* noop */ }
    this.wantListening = true;
    this.rec = this.buildRecognition();
    try { this.rec.start(); this.setState("idle"); } catch { /* already running */ }
  }

  stop() {
    this.wantListening = false;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.interruptTTS();
    try { this.rec?.stop(); } catch { /* noop */ }
    this.setState("idle");
  }

  getState() { return this.state; }
}
