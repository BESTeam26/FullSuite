import { describe, expect, it } from "vitest";
import type { LeaveRequest, WorkSchedule } from "@/lib/data/people-management";
import { cellFor, isoWeekday, summariseWeek, weekDates } from "./schedule-week";

const schedule = (over: Partial<WorkSchedule> = {}): WorkSchedule => ({
  id: "s1", userId: "u1", workDays: [1, 2, 3, 4, 5], shiftStart: "09:00:00", shiftEnd: "18:00:00",
  lunchMinutes: 60, breakMinutes: 30, graceMinutes: 5, timezone: "America/New_York",
  effectiveFrom: "2026-01-01", ...over,
});
const leave = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: "l1", userId: "u1", typeId: "t", typeLabel: "Sick leave", startsOn: "2026-09-22", endsOn: "2026-09-23",
  reason: "private", coverageNote: null, status: "approved", compensation: "unpaid",
  decidedByName: null, decidedAt: null, decisionNote: null, requesterName: null, createdAt: "2026-09-20", ...over,
});

describe("the week", () => {
  it("runs Monday to Sunday from the Monday given", () => {
    // 2026-09-21 is a Monday.
    expect(weekDates("2026-09-21")).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
    ]);
  });

  it("numbers weekdays the ISO way, Sunday last", () => {
    expect(isoWeekday("2026-09-21")).toBe(1);
    expect(isoWeekday("2026-09-27")).toBe(7);
  });
});

describe("what a day says", () => {
  it("is the shift on a working day", () => {
    expect(cellFor("2026-09-21", schedule(), [])).toEqual({ kind: "shift", start: "09:00:00", end: "18:00:00" });
  });

  it("is a day off outside the work days", () => {
    expect(cellFor("2026-09-26", schedule(), [])).toEqual({ kind: "off" });
  });

  it("is approved leave on a working day — the kind, never the reason", () => {
    const cell = cellFor("2026-09-22", schedule(), [leave()]);
    expect(cell).toEqual({ kind: "leave", label: "Sick leave", compensation: "unpaid" });
    expect(JSON.stringify(cell)).not.toContain("private");
  });

  it("ignores leave that is only pending or was declined", () => {
    expect(cellFor("2026-09-22", schedule(), [leave({ status: "pending" })]).kind).toBe("shift");
    expect(cellFor("2026-09-22", schedule(), [leave({ status: "declined" })]).kind).toBe("shift");
  });

  it("says a day off is a day off even when leave overlaps it", () => {
    expect(cellFor("2026-09-26", schedule(), [leave({ startsOn: "2026-09-25", endsOn: "2026-09-28" })]).kind).toBe("off");
  });

  it("says nothing at all without a schedule — attendance cannot judge them", () => {
    expect(cellFor("2026-09-21", undefined, [leave()])).toEqual({ kind: "unscheduled" });
  });
});

describe("the week's headline", () => {
  it("counts who has no schedule and who is away some day", () => {
    const people = [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }];
    const s = summariseWeek("2026-09-21", people,
      (id) => (id === "u3" ? undefined : schedule({ userId: id })),
      (id) => (id === "u1" ? [leave()] : []));
    expect(s).toEqual({ unscheduled: 1, awaySomeDay: 1 });
  });
});
