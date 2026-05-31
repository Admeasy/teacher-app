import { describe, it, expect } from "vitest";
import { detectEmailIntent, detectCallIntent, detectActionIntent, detectOperationalStudentIntent } from "@/lib/aiIntent";

describe("detectEmailIntent", () => {
  const yes = [
    "draft email to parents about exam",
    "write email to teachers",
    "send email reminder for fees",
    "compose email to mentors",
    "email parent of student aadesh",
    "mail all unpaid parents",
    "gmail the principal a summary",
    "notify by email the absent students",
  ];
  for (const p of yes) {
    it(`detects email: "${p}"`, () => expect(detectEmailIntent(p)).toBe(true));
  }
  const no = [
    "open gmail",
    "open mail",
    "open inbox",
    "show fee report",
    "call parents of attendance defaulters",
    "",
  ];
  for (const p of no) {
    it(`not email: "${p}"`, () => expect(detectEmailIntent(p)).toBe(false));
  }
});

describe("detectCallIntent", () => {
  const yes = [
    "call parents of attendance defaulters",
    "calling parents about fees",
    "make a call to Aadesh's father",
    "dial mentors of weak students",
    "phone call all defaulters",
    "ring up the principal",
    "voice call class 10 parents",
  ];
  for (const p of yes) {
    it(`detects call: "${p}"`, () => expect(detectCallIntent(p)).toBe(true));
  }
  const no = [
    "draft email to parents",
    "open gmail",
    "show calling card",          // negative phrase
    "what is a call to action?",  // negative phrase
    "",
  ];
  for (const p of no) {
    it(`not call: "${p}"`, () => expect(detectCallIntent(p)).toBe(false));
  }
});

describe("detectActionIntent priority", () => {
  it("email beats call when both keywords present", () => {
    expect(detectActionIntent("draft email and then call parents")).toBe("email");
  });
  it("returns none for plain queries", () => {
    expect(detectActionIntent("which class has lowest attendance?")).toBe("none");
  });
});

describe("detectOperationalStudentIntent", () => {
  const yes = [
    "students in 12B",
    "students in 12-B",
    "students in 12 B",
    "students in Class 12 B",
    "how many students in 12-b",
    "fees due in section B",
    "unpaid fees for Class 12 B",
    "outstanding fees in 12B",
    "attendance risk in Class 12 B",
  ];
  for (const p of yes) {
    it(`routes live student query: "${p}"`, () => expect(detectOperationalStudentIntent(p)).toBe(true));
  }

  const no = [
    "draft email to Class 12 B parents",
    "call 12B parents",
    "open gmail",
    "research attendance strategy",
  ];
  for (const p of no) {
    it(`does not steal workflow/non-live query: "${p}"`, () => expect(detectOperationalStudentIntent(p)).toBe(false));
  }
});
