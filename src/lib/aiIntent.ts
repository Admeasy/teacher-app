/**
 * Intent detection for routing user prompts to the correct edge function.
 * Kept side-effect free and string-only so it can be unit tested.
 */

const EMAIL_RE = /\b(draft\s+email|write\s+email|send\s+email|compose\s+email|email|e-?mail|mail|gmail|notify|notification|reminder|reminders|remind|message|msg|inform|intimate|circular|memo|broadcast|announce|announcement)\b/i;
// "open gmail / open mail / open inbox" should NOT be treated as draft-email intent — it's a navigation command
const EMAIL_NAV_RE = /\bopen\s+(gmail|mail|inbox)\b/i;
// "message" can also mean a phone call context — only treat as email when not preceded by call/dial verbs
const EMAIL_NEG_RE = /\b(call|dial|ring|phone)\b/i;

const CALL_RE = /\b(call|calling|make\s+(a\s+)?call|dial|phone\s+(up|call)?|ring\s+up|ring|voice\s+call)\b/i;
// Avoid "calling card", "call to action", or generic phrases
const CALL_NEG_RE = /\b(call\s+to\s+action|calling\s+card|recall|so[-\s]?called)\b/i;

const ACADEMIC_CLASS_RE = /\b(?:class|grade|std|standard)\s*(?:nursery|lkg|ukg|kg|\d{1,2})\s*[-\s]*[a-z]?\b|\b\d{1,2}\s*[-\s]?[a-z]\b|\bsection\s*[a-z]\b/i;
const STUDENT_OPERATION_RE = /\b(students?|class|section|how\s+many|count|list|show|fees?|unpaid|due|outstanding|pending|defaulters?|attendance|risk|below|critical)\b/i;

export function detectEmailIntent(prompt: string): boolean {
  if (!prompt) return false;
  if (EMAIL_NAV_RE.test(prompt)) return false;
  // Strong email signals always win, even if "call" also appears
  const strongEmail = /\b(draft|write|send|compose)\s+(an?\s+)?(email|mail|message|reminder|notification)\b|\bemail\b|\bmail\b|\bgmail\b/i.test(prompt);
  if (strongEmail) return true;
  // Soft signals (notify/remind/message alone): suppress if user said call/dial/ring/phone
  if (EMAIL_NEG_RE.test(prompt)) return false;
  return EMAIL_RE.test(prompt);
}

export function detectCallIntent(prompt: string): boolean {
  if (!prompt) return false;
  if (CALL_NEG_RE.test(prompt)) return false;
  return CALL_RE.test(prompt);
}

export function detectOperationalStudentIntent(prompt: string): boolean {
  if (!prompt) return false;
  if (detectEmailIntent(prompt) || detectCallIntent(prompt)) return false;
  return STUDENT_OPERATION_RE.test(prompt) && (ACADEMIC_CLASS_RE.test(prompt) || /\b(fees?|unpaid|due|outstanding|pending|defaulters?|attendance\s+risk|low\s+attendance)\b/i.test(prompt));
}

export type ActionIntent = "email" | "call" | "none";

export function detectActionIntent(prompt: string): ActionIntent {
  if (detectEmailIntent(prompt)) return "email";
  if (detectCallIntent(prompt)) return "call";
  return "none";
}
