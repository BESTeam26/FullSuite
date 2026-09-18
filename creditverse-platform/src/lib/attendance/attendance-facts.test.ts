import { describe, expect, it } from "vitest";
import { factsFrom, scheduledMinutes } from "./attendance-facts";
import { classifyDay } from "./attendance-score";
import type { AttendanceDay } from "@/lib/data/people-management";

const SCHEDULE = { shiftStart: "09:00:00", shiftEnd: "18:00:00", lunchMinutes: 60 };

const att = (over: Partial<AttendanceDay> & { day: string }): AttendanceDay => ({
  userId: "u1", scheduled: true, onLeave: false, leaveLabel: null,
  firstIn: "2026-09-08T13:00:00Z", lastOut: "2026-09-08T22:00:00Z",
  workMinutes: 480, breakMinutes: 0, lunchMinutes: 60, lateMinutes: 0,
  overbreakMinutes: 0, overlunchMinutes: 0, status: "present", ...over,
});

describe("how long a shift is", () => {
  it("is the span minus unpaid lunch", () => {
    expect(scheduledMinutes(SCHEDULE)).toBe(480);
  });

  it("handles a shift that crosses midnight", () => {
    expect(scheduledMinutes({ shiftStart: "22:00:00", shiftEnd: "06:00:00", lunchMinutes: 60 }))
      .toBe(420);
  });
});

describe("turning attendance into facts", () => {
  const today = "2026-09-18";

  it("leaves today out — an unfinished day is not an attendance event", () => {
    /* Somebody who has not clocked in at 9:05 is "not in yet", not absent. */
    const facts = factsFrom([att({ day: today, status: "not_in_yet", workMinutes: 0 })], SCHEDULE, { today });
    expect(facts).toEqual([]);
  });

  it("leaves days off out entirely", () => {
    const facts = factsFrom([att({ day: "2026-09-13", status: "off", workMinutes: 0 })], SCHEDULE, { today });
    expect(facts).toEqual([]);
  });

  it("carries approved leave through as leave, not as absence", () => {
    const facts = factsFrom(
      [att({ day: "2026-09-10", status: "on_leave", onLeave: true, workMinutes: 0 })],
      SCHEDULE, { today });
    expect(classifyDay(facts[0])).toBe("approved_leave");
  });

  it("calls a missed shift Absent, never NCNS, on its own", () => {
    /* The records cannot show whether somebody phoned in. Inventing a −2 from
       silence would punish twice as hard as the evidence supports. */
    const facts = factsFrom(
      [att({ day: "2026-09-09", status: "absent", workMinutes: 0, firstIn: null })],
      SCHEDULE, { today });
    expect(classifyDay(facts[0])).toBe("absent");
  });

  it("passes lateness straight through, already net of grace", () => {
    const facts = factsFrom(
      [att({ day: "2026-09-08", status: "late", lateMinutes: 12, workMinutes: 460 })],
      SCHEDULE, { today });
    expect(classifyDay(facts[0])).toBe("late");
  });

  it("classifies a short day as a half day using the real shift length", () => {
    const facts = factsFrom(
      [att({ day: "2026-09-08", status: "late", lateMinutes: 200, workMinutes: 200 })],
      SCHEDULE, { today });
    expect(classifyDay(facts[0])).toBe("half_day");
  });

  it("does not halve anything when there is no schedule to halve", () => {
    const facts = factsFrom(
      [att({ day: "2026-09-08", status: "late", lateMinutes: 30, workMinutes: 60 })],
      undefined, { today });
    expect(classifyDay(facts[0])).toBe("late");
  });
});
