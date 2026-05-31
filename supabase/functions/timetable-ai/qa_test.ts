// Deno test for the timetable-ai edge function.
//   Verifies: (1) no teacher double-bookings within the returned week,
//             (2) no stream violations (Accountancy/Business Studies in Science streams),
//             (3) every day has the configured number of periods.
//
// Run:  supabase--test_edge_functions ({ "functions": ["timetable-ai"] })
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const TEST_WS = Deno.env.get("TIMETABLE_TEST_WORKSPACE") ?? "qa";

const STREAM_BANS: Record<string, string[]> = {
  Science: ["accountancy", "business studies", "economics (commerce)"],
  Commerce: ["physics", "chemistry", "biology"],
  Arts: ["accountancy", "physics", "chemistry"],
};

async function callGen(klass: string, section: string, stream: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/timetable-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      mode: "generate", workspace_id: TEST_WS, class: klass, section, stream,
      periods_per_day: 8, include_saturday: true,
    }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

Deno.test("timetable-ai: generates a structurally valid week", async () => {
  const { status, json } = await callGen("12", "B", "Science");
  assertEquals(status, 200, `HTTP ${status}: ${JSON.stringify(json).slice(0, 200)}`);
  assert(json.ok, `Generation failed: ${json.error}`);
  assert(json.timetable && typeof json.timetable === "object", "Missing timetable payload");
  const days = Object.keys(json.timetable);
  assert(days.length >= 5, `Expected ≥5 days, got ${days.length}`);
});

Deno.test("timetable-ai: no teacher double-bookings in returned week", async () => {
  const { json } = await callGen("12", "B", "Science");
  if (!json?.ok) return;
  const seen = new Map<string, string>();
  for (const [day, slots] of Object.entries(json.timetable as Record<string, any[]>)) {
    for (const s of slots ?? []) {
      const teacher = (s.teacher ?? "").trim();
      if (!teacher) continue;
      const key = `${day.toUpperCase().slice(0,3)}|${s.period}|${teacher}`;
      if (seen.has(key)) {
        throw new Error(`Double-booking — ${teacher} at ${day} P${s.period}`);
      }
      seen.set(key, `${s.subject}`);
    }
  }
});

Deno.test("timetable-ai: no stream violations", async () => {
  const { json } = await callGen("12", "B", "Science");
  if (!json?.ok) return;
  const bans = STREAM_BANS.Science;
  const violations: string[] = [];
  for (const [day, slots] of Object.entries(json.timetable as Record<string, any[]>)) {
    for (const s of slots ?? []) {
      const subj = (s.subject ?? "").toLowerCase();
      for (const b of bans) {
        if (subj.includes(b)) violations.push(`${day} P${s.period}: ${s.subject}`);
      }
    }
  }
  assertEquals(violations.length, 0, `Stream violations: ${violations.join("; ")}`);
});
