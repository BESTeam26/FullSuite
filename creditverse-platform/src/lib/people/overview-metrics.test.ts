import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, type AttendanceFact } from "@/lib/attendance/attendance-score";
import {
  attendanceMix, eodMix, lastActiveLabel, monthToDate, onTimeRate, previousMonth, qualityScore, rateChange,
  submissionRate, weekToDate,
} from "./overview-metrics";

const fact = (day: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
  day, scheduled: true, approvedLeave: false, lateMinutes: 0, workedMinutes: 480, scheduledMinutes: 480,
  notified: false, ...over,
} as AttendanceFact);

describe("ranges", () => {
  it("week to date starts on Monday", () => {
    // 2026-09-17 is a Thursday.
    expect(weekToDate("2026-09-17")).toEqual({ from: "2026-09-14", to: "2026-09-17" });
  });
  it("month to date and the previous month", () => {
    expect(monthToDate("2026-09-17")).toEqual({ from: "2026-09-01", to: "2026-09-17" });
    expect(previousMonth("2026-09-17")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(previousMonth("2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("the attendance donut", () => {
  const facts = [
    fact("2026-09-14"),
    fact("2026-09-15"),                               // grace is policy data (BES: 0), so no "inside grace" fixture
    fact("2026-09-16", { lateMinutes: 40 }),          // late
    fact("2026-09-17", { workedMinutes: 0, notified: true }), // absent
    fact("2026-09-18", { approvedLeave: true }),
    fact("2026-09-19", { scheduled: false }),         // day off: not counted
    fact("2026-09-10"),                               // outside the range
  ];
  const range = { from: "2026-09-14", to: "2026-09-18" };

  it("buckets days the way the score classifies them, only inside the range", () => {
    expect(attendanceMix(facts, range, DEFAULT_POLICY)).toEqual({ onTime: 2, late: 1, absent: 1, onLeave: 1 });
  });

  it("honours a correction the same way the score does", () => {
    const corrected = attendanceMix(facts, range, DEFAULT_POLICY,
      [{ day: "2026-09-16", to: "on_time", reason: "clock fault", by: "lead", at: "2026-09-16T20:00:00Z" }]);
    expect(corrected.late).toBe(0);
    expect(corrected.onTime).toBe(3);
  });

  it("rates on time against scheduled working days, leave excluded — and has no rate for no days", () => {
    expect(onTimeRate({ onTime: 2, late: 1, absent: 1, onLeave: 5 })).toBe(50);
    expect(onTimeRate({ onTime: 0, late: 0, absent: 0, onLeave: 2 })).toBeNull();
    expect(rateChange(88, 82)).toBe(6);
    expect(rateChange(88, null)).toBeNull();
  });
});

describe("EOD compliance", () => {
  it("counts scheduled days as submitted, late (cutoff) or missing — never a day off", () => {
    const marks = [
      { employeeId: "a", workDate: "2026-09-14", kind: "submitted_by_person" as const },
      { employeeId: "a", workDate: "2026-09-15", kind: "auto_submitted" as const },
      { employeeId: "b", workDate: "2026-09-14", kind: "submitted_by_person" as const },
    ];
    const scheduled = [
      { employeeId: "a", day: "2026-09-14" }, { employeeId: "a", day: "2026-09-15" }, { employeeId: "a", day: "2026-09-16" },
      { employeeId: "b", day: "2026-09-14" },
    ];
    const mix = eodMix(marks, scheduled, { from: "2026-09-14", to: "2026-09-16" });
    expect(mix).toEqual({ submitted: 2, late: 1, missing: 1 });
    expect(submissionRate(mix)).toBe(50);
    expect(submissionRate({ submitted: 0, late: 0, missing: 0 })).toBeNull();
  });
});

describe("last active", () => {
  it("reads as a person would say it", () => {
    expect(lastActiveLabel("2026-09-17T13:00:00Z", "2026-09-17")).toBe("Today");
    expect(lastActiveLabel("2026-09-16T13:00:00Z", "2026-09-17")).toBe("Yesterday");
    expect(lastActiveLabel("2026-09-14T13:00:00Z", "2026-09-17")).toBe("3 days ago");
    expect(lastActiveLabel(null, "2026-09-17")).toBe("—");
  });
});

describe("quality score from QA verdicts", () => {
  const range = { from: "2026-09-01", to: "2026-09-19" };
  const items = [
    { assignedTo: "a", completedAt: "2026-09-02T10:00:00Z", qaResult: "passed" as const },
    { assignedTo: "a", completedAt: "2026-09-03T10:00:00Z", qaResult: "passed" as const },
    { assignedTo: "a", completedAt: "2026-09-04T10:00:00Z", qaResult: "needs_fix" as const },
    { assignedTo: "a", completedAt: "2026-09-05T10:00:00Z", qaResult: "pending" as const },
    { assignedTo: "a", completedAt: "2026-08-05T10:00:00Z", qaResult: "needs_fix" as const },
    { assignedTo: "b", completedAt: "2026-09-05T10:00:00Z", qaResult: "needs_fix" as const },
  ];
  it("is passed over reviewed, this person, this range — pending not counted", () => {
    expect(qualityScore(items, "a", range)).toEqual({ score: 67, reviewed: 3 });
  });
  it("has no score when nothing was reviewed", () => {
    expect(qualityScore(items, "c", range)).toEqual({ score: null, reviewed: 0 });
  });
});

