// Pure parsers for AI response sentinels. Extracted so they can be unit-tested
// independently of the AIPanel component and to prevent regressions in
// %%CALL_QUEUE%% / %%EMAIL_DRAFTS%% handling.

export interface CallQueueItem {
  student_id?: string;
  student_name?: string;
  parent_name?: string;
  phone: string;
  amount_due?: string;
  attendance_pct?: string;
  call_type?: string;
  role?: string;
}

export interface ParsedCallQueue {
  callType: string;
  script: string;
  recipients: CallQueueItem[];
}

export function parseCallQueue(response: string): ParsedCallQueue | null {
  if (!response) return null;
  // 1) Preferred: %%CALL_QUEUE%% JSON sentinel
  const sentinel = response.match(/%%CALL_QUEUE%%([\s\S]*?)%%END_CALL_QUEUE%%/);
  if (sentinel) {
    try {
      const parsed = JSON.parse(sentinel[1].trim());
      const recs = Array.isArray(parsed?.recipients) ? parsed.recipients : [];
      const recipients: CallQueueItem[] = recs
        .map((r: any) => ({
          student_id: r.student_id,
          student_name: r.student_name ?? "",
          parent_name: r.parent_name ?? r.name ?? "",
          phone: String(r.phone ?? r.parent_phone ?? r.mobile ?? "").replace(/[\s-]/g, ""),
          amount_due: r.amount_due != null ? String(r.amount_due) : undefined,
          attendance_pct: r.attendance_pct != null ? String(r.attendance_pct) : undefined,
          call_type: parsed.call_type ?? "general",
          role: r.role,
        }) as CallQueueItem)
        .filter((r: CallQueueItem) => r.phone);
      if (recipients.length > 0) {
        return { callType: parsed.call_type ?? "general", script: parsed.script ?? parsed.purpose ?? "", recipients };
      }
    } catch { /* fall through */ }
  }
  if (!/CALL\s*QUEUE\s*:/i.test(response)) return null;
  try {
    const blockMatch = response.match(/CALL\s*QUEUE\s*:([\s\S]*?)(?:END_CALL_QUEUE|$)/i);
    const block = blockMatch?.[1] ?? "";
    const callTypeMatch = block.match(/call_type\s*:\s*(.+)/i);
    const scriptMatch = block.match(/script\s*:\s*(.+)/i);
    const callType = callTypeMatch?.[1]?.trim() ?? "fee_reminder";
    const script = scriptMatch?.[1]?.trim() ?? "";
    const recipients: CallQueueItem[] = [];
    const lines = block.split("\n").filter((l) => /^\s*(?:[-*•]|\d+\.)\s+/.test(l));
    for (const line of lines) {
      const parts: Record<string, string> = {};
      line.replace(/^\s*(?:[-*•]|\d+\.)\s*/, "").split("|").forEach((p) => {
        const [k, ...vParts] = p.split(":");
        const v = vParts.join(":").trim();
        if (k?.trim() && v) parts[k.trim().toLowerCase()] = v;
      });
      const phone = parts.phone ?? parts.parent_phone ?? parts.teacher_phone ?? parts.mentor_phone ?? parts.number ?? parts.mobile ?? parts.contact;
      if (phone) {
        const teacherOrMentorName = parts.teacher_name ?? parts.mentor_name ?? parts.faculty_name ?? parts.staff_name;
        const genericName = parts.name ?? parts.full_name ?? parts.contact_name;
        recipients.push({
          student_id: parts.student_id,
          student_name: parts.student_name ?? (teacherOrMentorName ? "" : (genericName ?? "")),
          parent_name: parts.parent_name ?? parts.contact_name ?? teacherOrMentorName ?? genericName ?? "",
          phone: String(phone).replace(/[\s-]/g, ""),
          amount_due: parts.amount_due ?? parts.due,
          attendance_pct: parts.attendance_pct ?? parts.attendance,
          call_type: callType,
        });
      }
    }
    return recipients.length > 0 ? { callType, script, recipients } : null;
  } catch {
    return null;
  }
}

export interface ParsedEmailDrafts { drafts: any[]; cleanText: string }

export function parseEmailDraftsFromText(text: string): ParsedEmailDrafts {
  if (!text) return { drafts: [], cleanText: text };
  const sentinel = text.match(/%%EMAIL_DRAFTS%%([\s\S]*?)%%END_EMAIL_DRAFTS%%/);
  if (sentinel) {
    try {
      const drafts = JSON.parse(sentinel[1].trim());
      if (Array.isArray(drafts) && drafts.length > 0) {
        return { drafts, cleanText: text.replace(/%%EMAIL_DRAFTS%%[\s\S]*?%%END_EMAIL_DRAFTS%%/, "").trim() };
      }
    } catch { /* fall through */ }
  }
  const fenced = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i);
  if (fenced) {
    try {
      const arr = JSON.parse(fenced[1]);
      if (Array.isArray(arr) && arr.length > 0 && arr.every((d: any) => d && (d.to || d.email) && (d.body || d.message || d.content))) {
        const drafts = arr.map((d: any) => ({
          to: d.to ?? d.email ?? "",
          subject: d.subject ?? "",
          body: d.body ?? d.message ?? d.content ?? "",
          recipient_name: d.recipient_name ?? d.name ?? "",
        }));
        return { drafts, cleanText: text.replace(fenced[0], "").trim() };
      }
    } catch { /* fall through */ }
  }
  return { drafts: [], cleanText: text };
}
