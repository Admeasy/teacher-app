/** Intent classifier — decides what slice of ERP data to send with the prompt. */
export type Intent =
  | "navigate"
  | "fees"
  | "attendance"
  | "students"
  | "teachers"
  | "mentors"
  | "calls"
  | "email"
  | "general";

export function classifyIntent(prompt: string): Intent {
  const p = prompt.toLowerCase();
  if (/\b(open|launch|go to|navigate|gmail|calendar|inbox|youtube|fedena|edunext)\b/.test(p)) return "navigate";
  if (/\b(fee|unpaid|defaulter|payment|due|pending|partial|reminder|bakaya|fees)\b/.test(p)) return "fees";
  if (/\b(attendance|absent|absenteeism|risk|present|truant|haziri)\b/.test(p)) return "attendance";
  if (/\b(call|phone|dial|ring)\b/.test(p)) return "calls";
  if (/\b(email|mail|notify|send notice|drafting|draft|message)\b/.test(p)) return "email";
  if (/\b(teacher|faculty|staff|sir|madam|subject)\b/.test(p)) return "teachers";
  if (/\b(mentor|alumni|guide|career|counsel)\b/.test(p)) return "mentors";
  // BROAD student match — any class/count/section question
  if (/\b(student|class|section|grade|\d{1,2}[abcdef]|12b|11a|how many|kitne|kaun)\b/.test(p)) return "students";
  return "general";
}

/** Extract class number from prompt e.g. "class 12", "12th", "12-B" */
function extractClassFromPrompt(prompt: string): string | null {
  const m =
    prompt.match(/\b(?:class\s*)?(\d{1,2})\s*[-/]?\s*[abcdefABCDEF]?\b/i) ||
    prompt.match(/\b(\d{1,2})(?:th|st|nd|rd)?\s*(?:class|grade|std)?\b/i);
  return m ? m[1] : null;
}

/** Extract section from prompt e.g. "section B", "12-B", "12B" */
function extractSectionFromPrompt(prompt: string): string | null {
  const m =
    prompt.match(/\b\d{1,2}[-\s]?([abcdefABCDEF])\b/) ||
    prompt.match(/\bsection\s+([abcdefABCDEF])\b/i) ||
    prompt.match(/\b([abcdefABCDEF])\s+section\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** Detect prompts that need the FULL student dataset (no truncation allowed). */
export function requiresFullStudentData(prompt: string): boolean {
  const p = prompt.toLowerCase();
  // Class / section / grade mentioned
  if (/\b(class|grade|std|standard|section)\b/.test(p)) return true;
  if (/\b\d{1,2}\s*[-]?\s*[a-f]\b/i.test(p)) return true;
  // Aggregate metrics: fees, attendance, totals, counts
  if (/\b(fees?|unpaid|due|outstanding|defaulters?|partial|pending|paid|payment)\b/.test(p)) return true;
  if (/\b(attendance|absent|present|absenteeism|risk|below|critical)\b/.test(p)) return true;
  if (/\b(how\s+many|count|total|sum|average|all\s+students?|every\s+student|list\s+all|show\s+all)\b/.test(p)) return true;
  return false;
}

/**
 * Given a prompt + raw lists, return the rows worth sending.
 * KEY PRINCIPLE: Never send fewer rows than reality has.
 * When in doubt, send ALL students (edge fn handles token limits).
 */
export function sliceContext(
  prompt: string,
  students: any[],
  teachers: any[],
  mentors: any[],
): { students: any[]; teachers: any[]; mentors: any[]; intent: Intent } {
  const intent = classifyIntent(prompt);
  const p = prompt.toLowerCase();

  // ── AUTOMATED SAFETY CHECK ──
  // Class/section/aggregate-metric queries must NEVER be truncated.
  // Override any downstream slicing for these prompts.
  const mustSendFullData = requiresFullStudentData(prompt);

  // ── Always extract class/section for targeted queries ──
  const classNum = extractClassFromPrompt(prompt);
  const sectionLetter = extractSectionFromPrompt(prompt);

  // Helper: filter students by class+section if mentioned
  function filterByClassSection(rows: any[]): any[] {
    let filtered = rows;
    if (classNum) {
      filtered = filtered.filter((s) => String(s.class ?? "") === classNum);
    }
    if (sectionLetter) {
      filtered = filtered.filter((s) => String(s.section ?? "").toUpperCase() === sectionLetter);
    }
    return filtered;
  }

  // Helper: apply safety override before returning
  const withSafety = (out: { students: any[]; teachers: any[]; mentors: any[]; intent: Intent }) => {
    if (mustSendFullData) {
      // Never return fewer students than the targeted-by-class subset (or full list)
      const baseline = (classNum || sectionLetter) ? filterByClassSection(students) : students;
      if (out.students.length < baseline.length) {
        return { ...out, students: baseline };
      }
    }
    return out;
  };

  switch (intent) {
    case "navigate":
      return withSafety({ students: [], teachers: [], mentors: [], intent });

    case "fees": {
      // Fee status derived from Due vs Total: Due=0 → paid; Due>0 → unpaid (full or partial)
      const feeStudents = students.filter((s) => Number(s.due) > 0);
      const targeted = classNum ? filterByClassSection(feeStudents) : feeStudents;
      return withSafety({ students: targeted, teachers: [], mentors: [], intent });
    }

    case "attendance": {
      const attStudents = students.filter((s) => s.attendance_pct != null && Number(s.attendance_pct) < 75);
      const targeted = classNum ? filterByClassSection(attStudents) : attStudents;
      return withSafety({ students: targeted, teachers: [], mentors: [], intent });
    }

    case "teachers":
      return withSafety({ students: [], teachers: teachers, mentors: [], intent });

    case "mentors": {
      // Match mentors to students via shared "interests" tokens when available
      const studentInterests = new Set(
        students
          .flatMap((s) => String(s.interests ?? "").toLowerCase().split(/[,;|/]+/))
          .map((w) => w.trim())
          .filter(Boolean),
      );
      const matched = studentInterests.size
        ? mentors.filter((m) =>
            String(m.interests ?? m.expertise ?? "")
              .toLowerCase()
              .split(/[,;|/]+/)
              .map((w) => w.trim())
              .some((w) => w && studentInterests.has(w)),
          )
        : mentors;
      return withSafety({ students: [], teachers: [], mentors: matched.length ? matched : mentors, intent });
    }

    case "calls": {
      if (/attendance|risk|absent/.test(p)) {
        const at = students.filter((s) => Number(s.attendance_pct) < 75);
        return withSafety({ students: classNum ? filterByClassSection(at) : at, teachers: [], mentors: [], intent });
      }
      if (/teacher|faculty/.test(p))
        return withSafety({ students: [], teachers: teachers.filter((t) => t.phone), mentors: [], intent });
      const callable = students.filter((s) => s.parent_phone && Number(s.due) > 0);
      return withSafety({ students: classNum ? filterByClassSection(callable) : callable, teachers: [], mentors: [], intent });
    }

    case "email": {
      if (/attendance/.test(p)) {
        const at = students.filter((s) => Number(s.attendance_pct) < 75 && s.parent_email);
        return withSafety({ students: classNum ? filterByClassSection(at) : at, teachers: [], mentors: [], intent });
      }
      const mailable = students.filter((s) => s.parent_email && Number(s.due) > 0);
      return withSafety({ students: classNum ? filterByClassSection(mailable) : mailable, teachers: [], mentors: [], intent });
    }

    case "students": {
      // NAME LOOKUP — if a name token matches, send only those rows
      const words = p.split(/\s+/).filter((w) => w.length > 3);
      const named = students.filter((s) => words.some((w) => (s.name ?? "").toLowerCase().includes(w)));
      if (named.length > 0 && named.length <= 10) {
        return withSafety({ students: named, teachers: [], mentors: [], intent });
      }
      // CLASS/SECTION TARGETED — send ALL students matching that class/section
      if (classNum || sectionLetter) {
        const targeted = filterByClassSection(students);
        // CRITICAL: return ALL matching students, never truncate here
        return withSafety({ students: targeted, teachers: teachers, mentors: [], intent });
      }
      // General student question — send ALL students
      return withSafety({ students: students, teachers: teachers, mentors: [], intent });
    }

    default:
      // General — send everything so AI can answer anything
      return withSafety({ students: students, teachers: teachers, mentors: mentors, intent });
  }
}
