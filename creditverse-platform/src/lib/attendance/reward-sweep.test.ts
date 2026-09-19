/**
 * Dee's acceptance tests for the quarter-close sweep — the ones that are
 * DECISIONS. The ones that are database rules (uniqueness, 90-day expiry,
 * who may issue, the review flag) live in reward-credits-probe.mjs.
 */
import { describe, expect, it } from "vitest";
import { closedQuarterFor, evaluateQuarter, isClosed, quarterBounds } from "./reward-sweep";
import { DEFAULT_POLICY, type AttendanceFact } from "./attendance-score";

const day = (d: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
  day: d, scheduled: true, approvedLeave: false, lateMinutes: 0,
  workedMinutes: 480, scheduledMinutes: 480, notified: true, ...over,
});
/* Every calendar day of Q3 2026 worked clean — enough for three perfect
   months and the 90-day streak, which is the only way to 20. */
const perfectQ3 = Array.from({ length: 92 }, (_, i) =>
  day(new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10)));
const oneLate = [
  ...perfectQ3.slice(0, 40),
  day("2026-08-10", { lateMinutes: 15, workedMinutes: 460 }),
  ...perfectQ3.slice(41),
];

const person = (userId: string, over: Partial<{ active: boolean; alreadyRewarded: boolean }> = {}) =>
  ({ userId, agencyId: "a1", active: true, alreadyRewarded: false, ...over });

const run = (opts: {
  people: ReturnType<typeof person>[];
  facts: Record<string, AttendanceFact[]>;
  today?: string;
  quarter?: string;
  noSchedule?: string[];
}) => evaluateQuarter({
  quarter: opts.quarter ?? "2026-Q3",
  today: opts.today ?? "2026-10-01",
  policy: DEFAULT_POLICY,
  people: opts.people,
  factsFor: (id) => opts.facts[id] ?? [],
  hasSchedule: (id) => !(opts.noSchedule ?? []).includes(id),
  correctionsFor: () => [],
});

describe("which quarter closes", () => {
  it("names the quarter that most recently ended", () => {
    expect(closedQuarterFor("2026-10-01")).toBe("2026-Q3");
    expect(closedQuarterFor("2026-12-31")).toBe("2026-Q3");
    expect(closedQuarterFor("2027-01-01")).toBe("2026-Q4");
  });

  it("knows a quarter's edges", () => {
    expect(quarterBounds("2026-Q3")).toEqual({ from: "2026-07-01", to: "2026-09-30", closesOn: "2026-10-01" });
    expect(quarterBounds("2026-Q4").closesOn).toBe("2027-01-01");
  });

  it("is closed the day AFTER its last day, not on it", () => {
    /* Dee's example: "Sep 30 while quarter still active: no grant. Oct 1:
       evaluate Q3." */
    expect(isClosed("2026-Q3", "2026-09-30")).toBe(false);
    expect(isClosed("2026-Q3", "2026-10-01")).toBe(true);
  });
});

describe("acceptance", () => {
  it("1. a 20/20 quarter grants once after the quarter closes", () => {
    const out = run({ people: [person("u1")], facts: { u1: perfectQ3 } });
    expect(out).toEqual([{ userId: "u1", decision: "grant", finalScore: 20 }]);
  });

  it("2. 19.75 does not grant", () => {
    const out = run({ people: [person("u1")], facts: { u1: oneLate } });
    expect(out[0].decision).toBe("skip");
    expect(out[0]).toMatchObject({ reason: "below_max" });
    expect((out[0] as { finalScore: number }).finalScore).toBeLessThan(20);
  });

  it("3. a running quarter is not evaluated at all", () => {
    const out = run({ people: [person("u1")], facts: { u1: perfectQ3 }, today: "2026-09-30" });
    expect(out).toEqual([]);
  });

  it("4. a rerun makes the same decision, and skips anyone already paid", () => {
    const first = run({ people: [person("u1")], facts: { u1: perfectQ3 } });
    const again = run({ people: [person("u1")], facts: { u1: perfectQ3 } });
    expect(again).toEqual(first);
    const paid = run({ people: [person("u1", { alreadyRewarded: true })], facts: { u1: perfectQ3 } });
    expect(paid[0]).toMatchObject({ decision: "skip", reason: "already_rewarded" });
  });

  it("8. an inactive person is not granted, whatever their record", () => {
    const out = run({ people: [person("u1", { active: false })], facts: { u1: perfectQ3 } });
    expect(out[0]).toMatchObject({ decision: "skip", reason: "inactive" });
  });

  it("9. one person's bad data does not stop the batch", () => {
    const out = run({
      people: [person("bad"), person("good")],
      facts: { bad: perfectQ3, good: perfectQ3 },
      noSchedule: ["bad"],
    });
    expect(out.find((o) => o.userId === "bad")).toMatchObject({ decision: "exception", kind: "missing_schedule" });
    expect(out.find((o) => o.userId === "good")).toMatchObject({ decision: "grant" });
  });

  it("scores with whatever policy is in force, not the constants", () => {
    /* Lower the ceiling and the same clean quarter is still Champion — the
       sweep asks the engine for the standing, never for the number 20. */
    const policy = { ...DEFAULT_POLICY, maxPoints: 18, bands: { ...DEFAULT_POLICY.bands, champion: 18 } };
    const out = evaluateQuarter({
      quarter: "2026-Q3", today: "2026-10-01", policy,
      people: [person("u1")], factsFor: () => perfectQ3,
      hasSchedule: () => true, correctionsFor: () => [],
    });
    expect(out[0]).toMatchObject({ decision: "grant", finalScore: 18 });
  });

  it("uses corrections the way the app does", () => {
    /* An absence corrected to approved leave after the fact restores the
       quarter — same engine, same answer as the Attendance page. */
    const absent = [...perfectQ3.slice(0, 20), day("2026-07-21", { workedMinutes: 0 }), ...perfectQ3.slice(21)];
    const without = evaluateQuarter({
      quarter: "2026-Q3", today: "2026-10-01", policy: DEFAULT_POLICY,
      people: [person("u1")], factsFor: () => absent, hasSchedule: () => true, correctionsFor: () => [],
    });
    const withFix = evaluateQuarter({
      quarter: "2026-Q3", today: "2026-10-01", policy: DEFAULT_POLICY,
      people: [person("u1")], factsFor: () => absent, hasSchedule: () => true,
      correctionsFor: () => [{ day: "2026-07-21", to: "approved_leave", reason: "Emergency approved", by: "Lead", at: "2026-07-22T00:00:00Z" }],
    });
    expect(without[0].decision).toBe("skip");
    expect(withFix[0].decision).toBe("grant");
  });
});
