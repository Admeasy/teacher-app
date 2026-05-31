// Queues voice transcripts when offline; replays them through the same terminal pipeline on reconnect.
const KEY = "admeasy.voice.offline-queue.v1";

export interface QueuedTranscript {
  id: string;
  text: string;
  queued_at: number;
}

function read(): QueuedTranscript[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function write(q: QueuedTranscript[]) { localStorage.setItem(KEY, JSON.stringify(q)); }

export function enqueueTranscript(text: string) {
  const q = read();
  q.push({ id: crypto.randomUUID(), text, queued_at: Date.now() });
  write(q);
  window.dispatchEvent(new CustomEvent("admeasy:voice-offline-queue", { detail: { size: q.length } }));
}

export function getQueue(): QueuedTranscript[] { return read(); }
export function clearQueue() { write([]); window.dispatchEvent(new CustomEvent("admeasy:voice-offline-queue", { detail: { size: 0 } })); }

let installed = false;
export function installOfflineReplay() {
  if (installed) return;
  installed = true;
  const tryFlush = async () => {
    if (!navigator.onLine) return;
    const q = read();
    if (!q.length) return;
    write([]);
    window.dispatchEvent(new CustomEvent("admeasy:voice-offline-queue", { detail: { size: 0, flushed: q.length } }));
    for (const item of q) {
      window.dispatchEvent(new CustomEvent("admeasy:terminal-submit", {
        detail: { text: item.text, source: "voice-offline-replay" },
      }));
      await new Promise((r) => setTimeout(r, 1200));
    }
  };
  window.addEventListener("online", tryFlush);
  // Fire once on startup in case there's anything stale.
  setTimeout(tryFlush, 2000);
}
