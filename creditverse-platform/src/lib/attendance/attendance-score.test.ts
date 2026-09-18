/**
 * Dee's attendance policy, rule by rule.
 *
 * "10-minute grace. Late ¼. Half day ½. Absent 1. NCNS 2. Approved leave 0.
 *  Perfect month +1. Perfect quarter +2. Start at 15. Max 20."
 *
 * Every rule Dee locked has a test whose name is the rule, so a future change
 * that breaks one says which promise it broke.
 */
import { describe, expect, it } from "vitest";
import {
  classifyDay, isViolation, POINTS, quarterOf, scoreQuarter, standingFor,
  type AttendanceFact,
} from "./attendance-score";

const day = (over: Partial<AttendanceFact> & { day: string }): AttendanceFact => ({
  scheduled: true, approvedLeave: false, lateMinutes: 0,
  workedMinutes: 480, scheduledMinutes: 480, notified: true, ...over,
});

const Q = { quarter: "2026-Q3", today: "2026-09-30" };

describe("one incident, one classification", () => {
  it("scores a full day on time as nothing", () => {
    expect(classifyDay(day({ day: "2026-09-01" }))).toBe("on_time");
  });

  it("is not a violation inside the grace period", () => {
    /* attendance_for already subtracts the schedule's grace, so 0 minutes late
       IS "arrived inside grace". It must not even show as a deduction. */
    expect(classifyDay(day({ day: "2026-09-01", lateMinutes: 0, workedMinutes: 470 })))
      .toBe("on_time");
  });

  it("is Late once past grace, if more than half the shift is worked", () => {
    expect(classifyDay(day({ day: "2026-09-08", lateMinutes: 20, workedMinutes: 460 })))
      .toBe("late");
  });

  it("Half Day BEATS Late — never both", () => {
    /* Dee: "If someone arrives so late that the attendance event qualifies as
       Half Day, it's -0.50, not -0.25 -0.50." */
    const c = classifyDay(day({ day: "2026-09-08", lateMinutes: 240, workedMinutes: 240 }));
    expect(c).toBe("half_day");
    expect(POINTS[c]).toBe(-0.5);
  });

  it("treats exactly half a shift as a Half Day", () => {
    expect(classifyDay(day({ day: "2026-09-08", workedMinutes: 240, scheduledMinutes: 480 })))
      .toBe("half_day");
  });

  it("separates Absent from NCNS by NOTICE, not by hours", () => {
    const base = { day: "2026-09-09", workedMinutes: 0, lateMinutes: 480 };
    expect(classifyDay(day({ ...base, notified: true }))).toBe("absent");
    expect(classifyDay(day({ ...base, notified: false }))).toBe("ncns");
  });

  it("scores approved leave as nothing, whatever else the day looks like", () => {
    expect(classifyDay(day({ day: "2026-09-10", approvedLeave: true, workedMinutes: 0 })))
      .toBe("approved_leave");
  });

  it("is not an attendance event at all on a day off", () => {
    expect(classifyDay(day({ day: "2026-09-12", scheduled: false, workedMinutes: 0 })))
      .toBe("none");
  });

  it("carries Dee's four numbers exactly", () => {
    expect([POINTS.late, POINTS.half_day, POINTS.absent, POINTS.ncns])
      .toEqual([-0.25, -0.5, -1, -2]);
    expect([POINTS.approved_leave, POINTS.grace, POINTS.on_time]).toEqual([0, 0, 0]);
  });

  it("counts only the four as violations", () => {
    expect(["late", "half_day", "absent", "ncns"].every(isViolation)).toBe(true);
    expect(["approved_leave", "grace", "on_time", "none"].some(isViolation)).toBe(false);
  });
});

describe("the quarter", () => {
  const clean = (days: string[]) => days.map((d) => day({ day: d }));

  it("starts at 15", () => {
    expect(scoreQuarter([], Q).score).toBe(15);
  });

  it("is Dee's worked example: two lates and two perfect months", () => {
    /* 15 + 1 (Jul) + 1 (Aug) − 0.25 − 0.25 = 16.5, Good standing. September
       has a late, so it earns no bonus — automatically, not by a manager
       choosing. */
    const facts = [
      ...clean(["2026-07-06", "2026-07-07"]),
      ...clean(["2026-08-03", "2026-08-04"]),
      day({ day: "2026-09-08", lateMinutes: 15, workedMinutes: 460 }),
      day({ day: "2026-09-17", lateMinutes: 15, workedMinutes: 460 }),
    ];
    const r = scoreQuarter(facts, Q);
    expect(r.score).toBe(16.5);
    expect(r.standing).toBe("good");
    expect(r.ledger.filter((l) => l.kind === "perfect_month").map((l) => l.label))
      .toEqual(["Perfect attendance · July", "Perfect attendance · August"]);
  });

  it("gives a month with a late no bonus, without anyone deciding", () => {
    const facts = [
      ...clean(["2026-07-06"]),
      day({ day: "2026-07-07", lateMinutes: 15, workedMinutes: 460 }),
    ];
    expect(scoreQuarter(facts, Q).ledger.some((l) => l.kind === "perfect_month")).toBe(false);
  });

  it("does not let approved leave spoil a perfect month", () => {
    /* Dee: "Approved Leave = no violation." Somebody on booked holiday has not
       missed anything, so the month is still perfect. */
    const facts = [
      day({ day: "2026-07-06" }),
      day({ day: "2026-07-07", approvedLeave: true, workedMinutes: 0 }),
    ];
    expect(scoreQuarter(facts, Q).score).toBe(16);
  });

  it("no longer pays a perfect-quarter bonus", () => {
    /* Dee, 2026-09-18: "I would NOT give +2 for a perfect quarter on top of
       three +1 perfect months if that makes 20/20 attainable only through
       perfect attendance." Three clean months is 18, not 20. */
    const facts = clean(["2026-07-06", "2026-08-03", "2026-09-07"]);
    const r = scoreQuarter(facts, { quarter: "2026-Q3", today: "2026-10-05" });
    expect(r.score).toBe(18);
    expect(r.ledger.some((l) => l.kind === "streak")).toBe(false);
  });

  it("reaches 20 through perfect months AND reliability streaks", () => {
    /* 15 + 3 monthly + 0.5 + 0.5 + 1 = 20. */
    const days = Array.from({ length: 92 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10);
      return day({ day: d });
    });
    const r = scoreQuarter(days, { quarter: "2026-Q3", today: "2026-10-05" });
    expect(r.score).toBe(20);
    expect(r.standing).toBe("champion");
  });

  it("does not bank points above the ceiling", () => {
    const days = Array.from({ length: 92 }, (_, i) =>
      day({ day: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10) }));
    const r = scoreQuarter(days, { quarter: "2026-Q3", today: "2026-10-05" });
    expect(r.score).toBeLessThanOrEqual(20);
  });

  it("lets somebody earn their way back after an early mistake", () => {
    /* The whole reason the quarterly bonus went away. One late in week one
       used to put the top mathematically out of reach; now a long clean run
       still pays. */
    const days = [
      day({ day: "2026-07-02", lateMinutes: 15, workedMinutes: 460 }),
      ...Array.from({ length: 80 }, (_, i) =>
        day({ day: new Date(Date.UTC(2026, 6, 10 + i)).toISOString().slice(0, 10) })),
    ];
    const r = scoreQuarter(days, { quarter: "2026-Q3", today: "2026-10-05" });
    expect(r.ledger.filter((l) => l.kind === "streak").map((l) => l.points)).toEqual([0.5, 0.5]);
    expect(r.score).toBeGreaterThan(15);
  });

  it("never goes below zero", () => {
    const facts = Array.from({ length: 12 }, (_, i) =>
      day({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, workedMinutes: 0, notified: false }));
    const r = scoreQuarter(facts, Q);
    expect(r.score).toBe(0);
    expect(r.clamped).toBe(true);
    expect(r.standing).toBe("review");
  });

  it("does not award a bonus for a month that is still running", () => {
    /* Awarding September on the 18th and taking it back on the 20th would make
       the score untrustworthy. It is earned when the month has ended. */
    const facts = clean(["2026-09-01", "2026-09-02"]);
    const mid = scoreQuarter(facts, { quarter: "2026-Q3", today: "2026-09-18" });
    expect(mid.ledger.some((l) => l.kind === "perfect_month")).toBe(false);
    const after = scoreQuarter(facts, { quarter: "2026-Q3", today: "2026-10-01" });
    expect(after.ledger.some((l) => l.kind === "perfect_month")).toBe(true);
  });

  it("ignores days from another quarter", () => {
    const facts = [day({ day: "2026-06-30", workedMinutes: 0, notified: false })];
    expect(scoreQuarter(facts, Q).score).toBe(15);
  });

  it("keeps the arithmetic on quarter-point steps", () => {
    const facts = [1, 2, 3].map((n) =>
      day({ day: `2026-09-0${n}`, lateMinutes: 12, workedMinutes: 460 }));
    expect(scoreQuarter(facts, Q).score).toBe(14.25);
  });
});

describe("standing bands", () => {
  it("matches Dee's achievement table at every boundary", () => {
    expect(standingFor(20)).toBe("champion");
    expect(standingFor(19.75)).toBe("excellent");
    expect(standingFor(18)).toBe("excellent");
    expect(standingFor(17.75)).toBe("good");
    expect(standingFor(15)).toBe("good");
    expect(standingFor(14.75)).toBe("coaching");
    expect(standingFor(12)).toBe("coaching");
    expect(standingFor(11.75)).toBe("improvement");
    expect(standingFor(9)).toBe("improvement");
    expect(standingFor(8.75)).toBe("review");
    expect(standingFor(0)).toBe("review");
  });

  it("reserves Champion for a full 20, not merely a high score", () => {
    expect(standingFor(19.75)).not.toBe("champion");
  });

  it("puts a fresh quarter in Good standing, not on a watch list", () => {
    /* Dee: "This makes 15 the normal baseline. Employees aren't starting the
       quarter already in a 'watch' category." */
    expect(standingFor(15)).toBe("good");
  });
});

describe("patterns trigger coaching, never a bigger deduction", () => {
  const lates = (days: string[]) =>
    days.map((d) => day({ day: d, lateMinutes: 15, workedMinutes: 460 }));

  it("keeps every late at −0.25 however many there are", () => {
    const r = scoreQuarter(lates(["2026-09-08", "2026-09-15", "2026-09-22"]), Q);
    expect(r.ledger.filter((l) => l.kind === "incident").map((l) => l.points))
      .toEqual([-0.25, -0.25, -0.25]);
    expect(r.score).toBe(14.25);
  });

  it("raises a coaching alert at three lates in a rolling 30 days", () => {
    const r = scoreQuarter(lates(["2026-09-08", "2026-09-15", "2026-09-22"]), Q);
    expect(r.alerts.map((a) => a.kind)).toContain("coaching");
    expect(r.latesInWindow).toBe(3);
  });

  it("does not raise it for three lates spread wider than the window", () => {
    const r = scoreQuarter(lates(["2026-07-08", "2026-08-15", "2026-09-22"]), Q);
    expect(r.alerts.some((a) => a.kind === "coaching")).toBe(false);
    expect(r.latesInWindow).toBe(1);
  });

  it("raises a management alert at two NCNS, each still −2", () => {
    const facts = ["2026-09-08", "2026-09-15"].map((d) =>
      day({ day: d, workedMinutes: 0, notified: false }));
    const r = scoreQuarter(facts, Q);
    expect(r.alerts.map((a) => a.kind)).toContain("management");
    expect(r.ledger.filter((l) => l.kind === "incident").map((l) => l.points)).toEqual([-2, -2]);
    expect(r.score).toBe(11);
  });
});

describe("a correction reverses, it does not delete", () => {
  const facts = [day({ day: "2026-09-08", workedMinutes: 0, notified: true })];
  const corrected = scoreQuarter(facts, {
    ...Q,
    corrections: [{
      day: "2026-09-08", to: "approved_leave",
      reason: "Family emergency approved after the fact", by: "Bryan Breva",
      at: "2026-09-10T10:00:00.000Z",
    }],
  });

  it("puts the score back", () => {
    expect(scoreQuarter(facts, Q).score).toBe(14);
    expect(corrected.score).toBe(15);
  });

  it("keeps the original event in the history", () => {
    /* Dee's rule 6: "FullSuite reverses the -1 rather than deleting the
       original event." */
    expect(corrected.ledger.filter((l) => l.kind === "incident").map((l) => l.label))
      .toEqual(["Absent"]);
  });

  it("records who reversed it and why", () => {
    const reversal = corrected.ledger.find((l) => l.kind === "reversal");
    expect(reversal?.points).toBe(1);
    expect(reversal?.detail).toContain("Bryan Breva");
  });

  it("lets the corrected day earn its perfect month back", () => {
    /* Once the month has ENDED. On 30 September the month is still running and
       no bonus is due yet — which is why this asks on 1 October. The first
       draft asked on the 30th and failed; the rule was right. */
    const after = scoreQuarter(facts, {
      quarter: "2026-Q3", today: "2026-10-01",
      corrections: [{
        day: "2026-09-08", to: "approved_leave",
        reason: "Family emergency approved after the fact", by: "Bryan Breva",
        at: "2026-09-10T10:00:00.000Z",
      }],
    });
    expect(after.ledger.some((l) => l.kind === "perfect_month")).toBe(true);
  });
});

describe("which quarter a day belongs to", () => {
  it("splits the year into four", () => {
    expect(["2026-02-10", "2026-04-01", "2026-09-30", "2026-12-31"].map(quarterOf))
      .toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
  });
});

describe("the month-by-month breakdown", () => {
  const day2 = (d: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
    day: d, scheduled: true, approvedLeave: false, lateMinutes: 0,
    workedMinutes: 480, scheduledMinutes: 480, notified: true, ...over,
  });

  it("marks a finished clean month earned and a spoilt one lost", () => {
    const r = scoreQuarter([
      day2("2026-07-06"),
      day2("2026-08-03", { lateMinutes: 15, workedMinutes: 460 }),
    ], { quarter: "2026-Q3", today: "2026-09-18" });
    expect(r.months.map((m) => [m.label, m.bonus]))
      .toEqual([["July", "earned"], ["August", "lost"]]);
  });

  it("marks the month still running as pending, not earned", () => {
    const r = scoreQuarter([day2("2026-09-01")], { quarter: "2026-Q3", today: "2026-09-18" });
    expect(r.months[0].bonus).toBe("pending");
  });
});

describe("the current streak", () => {
  const d = (day: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
    day, scheduled: true, approvedLeave: false, lateMinutes: 0,
    workedMinutes: 480, scheduledMinutes: 480, notified: true, ...over,
  });

  it("counts consecutive clean scheduled days", () => {
    const r = scoreQuarter([d("2026-09-01"), d("2026-09-02"), d("2026-09-03")], Q);
    expect(r.streakDays).toBe(3);
  });

  it("stops at the most recent violation, not at the first", () => {
    const r = scoreQuarter([
      d("2026-09-01", { lateMinutes: 20, workedMinutes: 460 }),
      d("2026-09-02"), d("2026-09-03"),
    ], Q);
    expect(r.streakDays).toBe(2);
  });

  it("is not broken by approved leave", () => {
    /* Somebody on booked holiday has not stopped turning up. */
    const r = scoreQuarter([
      d("2026-09-01"), d("2026-09-02", { approvedLeave: true, workedMinutes: 0 }), d("2026-09-03"),
    ], Q);
    expect(r.streakDays).toBe(2);
  });

  it("is zero right after a violation", () => {
    const r = scoreQuarter([d("2026-09-01"), d("2026-09-02", { workedMinutes: 0 })], Q);
    expect(r.streakDays).toBe(0);
  });
});

describe("badges are cumulative, the score is not", () => {
  const d = (day: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
    day, scheduled: true, approvedLeave: false, lateMinutes: 0,
    workedMinutes: 480, scheduledMinutes: 480, notified: true, ...over,
  });
  const run = (n: number, from = 0) => Array.from({ length: n }, (_, i) =>
    d(new Date(Date.UTC(2026, 6, 1 + from + i)).toISOString().slice(0, 10)));

  it("awards a reliability badge at each milestone the streak passed", () => {
    const r = scoreQuarter(run(65), { quarter: "2026-Q3", today: "2026-10-05" });
    expect(r.badges.map((b) => b.key)).toEqual(
      expect.arrayContaining(["reliability_30", "reliability_60"]));
    expect(r.badges.map((b) => b.key)).not.toContain("reliability_90");
  });

  it("separates Perfect Attendance from Champion", () => {
    /* Dee: "those are slightly different accomplishments." A clean quarter
       that does not reach 20 still earns the perfect-attendance badge. */
    const r = scoreQuarter(run(10), { quarter: "2026-Q3", today: "2026-10-05" });
    expect(r.badges.map((b) => b.key)).toContain("perfect_attendance");
    expect(r.badges.map((b) => b.key)).not.toContain("champion");
    expect(r.standing).not.toBe("champion");
  });

  it("does not let approved leave cost somebody a badge", () => {
    /* Dee: "the reward system shouldn't encourage them to avoid legitimate
       approved leave just to preserve a badge." */
    const withLeave = [
      ...run(20),
      d("2026-07-21", { approvedLeave: true, workedMinutes: 0 }),
      ...run(15, 21),
    ];
    const r = scoreQuarter(withLeave, { quarter: "2026-Q3", today: "2026-10-05" });
    expect(r.badges.map((b) => b.key)).toContain("reliability_30");
  });
});

describe("the journey to the next achievement", () => {
  const d = (day: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
    day, scheduled: true, approvedLeave: false, lateMinutes: 0,
    workedMinutes: 480, scheduledMinutes: 480, notified: true, ...over,
  });

  it("says how far the next band is", () => {
    const r = scoreQuarter([d("2026-09-01")], Q);
    expect(r.toNextStanding).toEqual({ standing: "excellent", points: 3 });
  });

  it("says nothing further once at the top", () => {
    const days = Array.from({ length: 92 }, (_, i) =>
      d(new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10)));
    expect(scoreQuarter(days, { quarter: "2026-Q3", today: "2026-10-05" }).toNextStanding).toBeNull();
  });

  it("points at the running month while it is still clean", () => {
    const r = scoreQuarter([d("2026-09-01")], { quarter: "2026-Q3", today: "2026-09-18" });
    expect(r.nextAchievement?.label).toBe("Perfect September");
    expect(r.nextAchievement?.points).toBe(1);
  });

  it("points at the next streak milestone once the month is spoilt", () => {
    const r = scoreQuarter([
      d("2026-09-01", { lateMinutes: 15, workedMinutes: 460 }), d("2026-09-02"),
    ], { quarter: "2026-Q3", today: "2026-09-18" });
    expect(r.nextAchievement?.label).toBe("30-Day Reliability");
    expect(r.nextAchievement?.detail).toContain("29 more");
  });
});

describe("where a classification came from", () => {
  /* Dee, 2026-09-18: "Do not hide where the decision came from." */
  const d = (day: string, over: Partial<AttendanceFact> = {}): AttendanceFact => ({
    day, scheduled: true, approvedLeave: false, lateMinutes: 0,
    workedMinutes: 480, scheduledMinutes: 480, notified: true, ...over,
  });

  it("marks a derived day automatic", () => {
    const r = scoreQuarter([d("2026-09-08", { lateMinutes: 12, workedMinutes: 460 })], Q);
    expect(r.activity[0]).toMatchObject({ source: "automatic", classification: "late" });
    expect(r.activity[0].correction).toBeUndefined();
  });

  it("marks a changed day corrected, and keeps what it was", () => {
    const r = scoreQuarter([d("2026-09-08", { workedMinutes: 0 })], {
      ...Q,
      corrections: [{
        day: "2026-09-08", to: "approved_leave", reason: "Emergency approved",
        by: "Bryan Breva", at: "2026-09-09T10:00:00.000Z",
      }],
    });
    expect(r.activity[0]).toMatchObject({
      source: "corrected", classification: "approved_leave", originalClassification: "absent",
    });
    expect(r.activity[0].correction?.by).toBe("Bryan Breva");
  });

  it("marks an escalation to NCNS as corrected too", () => {
    /* Absent → NCNS is a manager's judgement, not something the records show,
       and the row has to say so. */
    const r = scoreQuarter([d("2026-09-08", { workedMinutes: 0 })], {
      ...Q,
      corrections: [{
        day: "2026-09-08", to: "ncns", reason: "No contact all day",
        by: "Bryan Breva", at: "2026-09-09T10:00:00.000Z",
      }],
    });
    expect(r.activity[0]).toMatchObject({
      source: "corrected", classification: "ncns", originalClassification: "absent",
    });
    expect(r.activity[0].points).toBe(-2);
  });
});
