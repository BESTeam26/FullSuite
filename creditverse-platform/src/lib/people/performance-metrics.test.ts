import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, type AttendanceFact } from "@/lib/attendance/attendance-score";
import {
  averageOf, bandOf, deliveredCount, distribution, lastMonths, outputRate, overallOf, performanceCsv, personScore, trendOf,
} from "./performance-metrics";
import { DEFAULT_PERFORMANCE_POLICY } from "./performance-policy";

const fact = (day: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
  day, scheduled: true, approvedLeave: false, lateMinutes: 0, workedMinutes: 480, scheduledMinutes: 480,
  notified: true, ...over,
} as AttendanceFact);
const range = { from: "2026-09-01", to: "2026-09-19" };
const parts = (p: Partial<Record<"attendance" | "quality" | "compliance" | "output", number | null>>) =>
  ({ attendance: null, quality: null, compliance: null, output: null, ...p });

/* Dee, 2026-09-19: "35% Quality + 35% Output + 20% Compliance + 10% Reliability." */
describe("the weighted overall", () => {
  it("is Dee's example — 93 quality, 91 output, 87 compliance, 82 attendance — which the formula makes exactly 90", () => {
    // 93·35 + 91·35 + 87·20 + 82·10 = 9,000 → 90 (Dee's prose said "89"; the arithmetic says 90).
    expect(overallOf(parts({ quality: 93, output: 91, compliance: 87, attendance: 82 }))).toBe(90);
  });

  it("renormalises the weights to the components that exist — no QA review is not a zero", () => {
    // quality 35 + compliance 20 + attendance 10 = 65 → (90·35 + 100·20 + 50·10) / 65 = 86.9
    expect(overallOf(parts({ quality: 90, compliance: 100, attendance: 50 }))).toBe(87);
    expect(overallOf(parts({}))).toBeNull();
  });

  it("caps the overall in Needs Support when Quality or Compliance is under a set minimum", () => {
    const policy = { ...DEFAULT_PERFORMANCE_POLICY, minQuality: 70, minCompliance: 70 };
    expect(overallOf(parts({ quality: 60, output: 100, compliance: 100, attendance: 100 }), policy)).toBe(59);
    expect(overallOf(parts({ quality: 95, output: 100, compliance: 50, attendance: 100 }), policy)).toBe(59);
    expect(overallOf(parts({ quality: 95, output: 100, compliance: 95, attendance: 100 }), policy)).toBe(97);
  });

  it("applies no cap while the thresholds are unset — a threshold nobody chose caps nobody", () => {
    expect(overallOf(parts({ quality: 10, output: 100, compliance: 10, attendance: 100 }))).toBe(51); // 50.5 rounds up
  });
});

describe("output is work delivered, not hours", () => {
  const items = [
    { assignedTo: "a", completedAt: "2026-09-02T10:00:00Z" },
    { assignedTo: "a", completedAt: "2026-09-05T10:00:00Z" },
    { assignedTo: "a", completedAt: "2026-08-30T10:00:00Z" },
    { assignedTo: "b", completedAt: "2026-09-05T10:00:00Z" },
  ];
  it("counts the person's completed items in the period", () => {
    expect(deliveredCount(items, "a", range)).toBe(2);
  });
  it("is a rate only against a real target, capped at 100", () => {
    expect(outputRate(2, null)).toBeNull();
    expect(outputRate(2, 4)).toBe(50);
    expect(outputRate(9, 4)).toBe(100);
  });
});

describe("a person's score", () => {
  it("derives every component from the records, with output out of the overall until a target exists", () => {
    const facts = [fact("2026-09-01"), fact("2026-09-02", { lateMinutes: 30 }), fact("2026-09-03", { workedMinutes: 0 })];
    const score = personScore({
      userId: "a", facts, corrections: [], policy: DEFAULT_POLICY,
      eodMarks: [{ employeeId: "a", workDate: "2026-09-01", kind: "submitted_by_person" }],
      items: [{ assignedTo: "a", completedAt: "2026-09-02T10:00:00Z", qaResult: "passed" }],
    }, range);
    expect(score.attendance).toBe(33);   // 1 on time of 3 scheduled
    expect(score.quality).toBe(100);
    expect(score.compliance).toBe(33);   // 1 of 3 scheduled days
    expect(score.delivered).toBe(1);
    expect(score.output).toBeNull();
    expect(score.overall).toBe(69);      // (33·10 + 100·35 + 33·20) / 65
    expect(score.belowMinimum).toBe(false);
  });
});

describe("bands and the team", () => {
  const s = (overall: number | null) => ({ attendance: overall, quality: null, compliance: null, output: null, delivered: 0, overall, belowMinimum: false });
  it("places people by the mockup's bands, leaving the unscored out", () => {
    expect(bandOf(95)).toBe("outstanding");
    expect(bandOf(75)).toBe("strong");
    expect(bandOf(60)).toBe("on_track");
    expect(bandOf(59)).toBe("needs_support");
    expect(distribution([s(95), s(80), s(50), s(null)])).toEqual({ outstanding: 1, strong: 1, on_track: 0, needs_support: 1 });
    expect(averageOf([s(90), s(70), s(null)], "overall")).toBe(80);
  });
  it("trends in percentage points", () => {
    expect(trendOf(86, 82)).toBe(4);
    expect(trendOf(86, null)).toBeNull();
  });
});

describe("months and the export", () => {
  it("lists the last six months oldest first, the current one cut at today", () => {
    const months = lastMonths("2026-09-19", 6);
    expect(months[0]).toEqual({ from: "2026-04-01", to: "2026-04-30" });
    expect(months.at(-1)).toEqual({ from: "2026-09-01", to: "2026-09-19" });
    expect(lastMonths("2026-01-15", 2)[0]).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("writes a quoted CSV", () => {
    const csv = performanceCsv([{ name: 'Ann "A" Lee', position: "Processor", team: "T1",
      score: { attendance: 90, quality: null, compliance: 100, output: null, delivered: 7, overall: 93, belowMinimum: false } }]);
    expect(csv.split("\n")[1]).toBe('"Ann ""A"" Lee","Processor","T1","90","","100","","7","93"');
  });
});
