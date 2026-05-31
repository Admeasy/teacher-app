// Per-device voice calibration & sensitivity settings (localStorage).
export type WakeSensitivity = "strict" | "normal" | "loose";

export interface VoiceSettings {
  silenceMs: number;       // ms of silence before finalizing
  wakeSensitivity: WakeSensitivity;
  micGain: number;         // 0.5 – 3.0 (WebAudio GainNode multiplier)
  ttsEnabled: boolean;
  autoListen: boolean;     // auto-enable orchestrator on app load
  dockVisible: boolean;    // show floating voice dock on desktop
  dockOnMobile: boolean;   // show floating voice dock on mobile (default: false)
}

const KEY = "admeasy.voice.settings.v1";
const DEFAULTS: VoiceSettings = {
  silenceMs: 5000,
  wakeSensitivity: "normal",
  micGain: 1.0,
  ttsEnabled: true,
  autoListen: true,
  dockVisible: true,
  dockOnMobile: false,
};

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveVoiceSettings(patch: Partial<VoiceSettings>) {
  const cur = loadVoiceSettings();
  const next = { ...cur, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("admeasy:voice-settings-changed", { detail: next }));
  return next;
}

export const VOICE_SETTINGS_DEFAULTS = DEFAULTS;
