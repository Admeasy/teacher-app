import { describe, it, expect } from "vitest";
import { parseCallQueue, parseEmailDraftsFromText } from "@/lib/aiSentinels";

describe("parseCallQueue", () => {
  it("parses %%CALL_QUEUE%% JSON sentinel", () => {
    const raw = `
prefix
%%CALL_QUEUE%%
{
  "call_type": "fee_reminder",
  "script": "Hello {{parent_name}}, fees of {{amount_due}} are due.",
  "recipients": [
    { "student_name": "Aman", "parent_name": "Rita", "phone": "9876543210", "amount_due": 1500 },
    { "student_name": "Sara", "parent_name": "Liam", "phone": "9988-77 6655" }
  ]
}
%%END_CALL_QUEUE%%
trailer`;
    const q = parseCallQueue(raw)!;
    expect(q).not.toBeNull();
    expect(q.callType).toBe("fee_reminder");
    expect(q.recipients).toHaveLength(2);
    expect(q.recipients[0].phone).toBe("9876543210");
    // Whitespace/dashes stripped
    expect(q.recipients[1].phone).toBe("9988776655");
    expect(q.recipients[0].amount_due).toBe("1500");
  });

  it("falls back to legacy CALL QUEUE: bullet block", () => {
    const raw = `CALL QUEUE:
call_type: attendance
script: Please ensure attendance.
- student_name: Tia | parent_name: Mira | phone: 9000000001 | attendance: 60
- student_name: Ron | parent_name: Sam | phone: 9000000002
END_CALL_QUEUE`;
    const q = parseCallQueue(raw)!;
    expect(q.callType).toBe("attendance");
    expect(q.recipients.length).toBe(2);
    expect(q.recipients[0].attendance_pct).toBe("60");
  });

  it("returns null when neither sentinel nor legacy block", () => {
    expect(parseCallQueue("just some text")).toBeNull();
  });

  it("returns null when sentinel has no recipients with phone", () => {
    const raw = `%%CALL_QUEUE%%{"call_type":"x","recipients":[{"student_name":"a"}]}%%END_CALL_QUEUE%%`;
    expect(parseCallQueue(raw)).toBeNull();
  });
});

describe("parseEmailDraftsFromText", () => {
  it("parses %%EMAIL_DRAFTS%% sentinel and strips it from cleanText", () => {
    const raw = `before
%%EMAIL_DRAFTS%%
[{"to":"a@x.com","subject":"hi","body":"hello"}]
%%END_EMAIL_DRAFTS%%
after`;
    const { drafts, cleanText } = parseEmailDraftsFromText(raw);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].to).toBe("a@x.com");
    expect(cleanText).not.toMatch(/EMAIL_DRAFTS/);
  });

  it("parses a fenced ```json email array", () => {
    const raw = "intro\n```json\n[{\"to\":\"b@y.com\",\"subject\":\"S\",\"body\":\"B\"}]\n```\nend";
    const { drafts } = parseEmailDraftsFromText(raw);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].to).toBe("b@y.com");
  });

  it("returns empty drafts when no recognizable format", () => {
    const { drafts } = parseEmailDraftsFromText("just a paragraph");
    expect(drafts).toHaveLength(0);
  });

  it("ignores invalid JSON in sentinel without throwing", () => {
    const raw = `%%EMAIL_DRAFTS%%not-json%%END_EMAIL_DRAFTS%%`;
    expect(() => parseEmailDraftsFromText(raw)).not.toThrow();
    expect(parseEmailDraftsFromText(raw).drafts).toHaveLength(0);
  });
});
