import { describe, expect, it } from "vitest";
import type { TimeEntry } from "@/lib/data/time-entries";
import {
  entryMinutes,
  entrySeconds,
  formatClock,
  formatDuration,
  lateMinutesToday,
  liveDaySeconds,
  summariseTime,
  weekStart,
} from "@/lib/time-domain";

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: "t1",
  divisionId: "creditops",
  workDate: "2026-09-03",
  startedAt: "2026-09-03T09:00:00.000Z",
  endedAt: "2026-09-03T10:30:00.000Z",
  durationMinutes: 90,
  autoStopped: false,
  kind: "work",
  ...over,
});

describe("formatDuration", () => {
  it("shows hours and minutes together", () => {
    expect(formatDuration(382)).toBe("6h 22m");
  });

  it("drops the hour when under one", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("drops the minutes when exactly on the hour", () => {
    expect(formatDuration(120)).toBe("2h");
  });

  it("renders nothing meaningful as an em dash, never '0h'", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("entryMinutes", () => {
  it("uses the stored duration for a closed entry", () => {
    expect(entryMinutes(entry())).toBe(90);
  });

  it("counts a running clock up to now, so the current shift is not lost", () => {
    const open = entry({
      endedAt: undefined,
      durationMinutes: undefined,
      startedAt: "2026-09-03T09:00:00.000Z",
    });
    const now = new Date("2026-09-03T09:45:00.000Z");
    expect(entryMinutes(open, now)).toBe(45);
  });

  it("never reports negative time when a clock starts in the future", () => {
    const skewed = entry({
      endedAt: undefined,
      durationMinutes: undefined,
      startedAt: "2026-09-03T12:00:00.000Z",
    });
    expect(entryMinutes(skewed, new Date("2026-09-03T09:00:00.000Z"))).toBe(0);
  });
});

describe("weekStart", () => {
  it("returns Monday for a midweek date", () => {
    // 2026-09-03 is a Thursday.
    expect(weekStart(new Date(2026, 8, 3))).toBe("2026-08-31");
  });

  it("treats Sunday as the END of its week, not the start", () => {
    // 2026-09-06 is a Sunday; its Monday is 2026-08-31.
    expect(weekStart(new Date(2026, 8, 6))).toBe("2026-08-31");
  });

  it("returns the same day when given a Monday", () => {
    expect(weekStart(new Date(2026, 7, 31))).toBe("2026-08-31");
  });
});

describe("summariseTime", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");

  it("separates today from the rest of the week", () => {
    const s = summariseTime(
      [
        entry({ id: "a", workDate: "2026-09-03", durationMinutes: 90 }),
        entry({ id: "b", workDate: "2026-09-02", durationMinutes: 60 }),
      ],
      "2026-09-03",
      now,
    );
    expect(s.todayMinutes).toBe(90);
    expect(s.weekMinutes).toBe(150);
  });

  it("totals per division, highest first", () => {
    const s = summariseTime(
      [
        entry({ id: "a", divisionId: "creditops", durationMinutes: 30 }),
        entry({ id: "b", divisionId: "bes-crm", durationMinutes: 120 }),
        entry({ id: "c", divisionId: "creditops", durationMinutes: 30 }),
      ],
      "2026-09-03",
      now,
    );
    expect(s.byDivision).toEqual([
      { divisionId: "bes-crm", minutes: 120 },
      { divisionId: "creditops", minutes: 60 },
    ]);
  });

  it("includes the running clock in today's total", () => {
    const s = summariseTime(
      [
        entry({ id: "closed", durationMinutes: 60 }),
        entry({
          id: "open",
          endedAt: undefined,
          durationMinutes: undefined,
          startedAt: "2026-09-03T11:30:00.000Z",
        }),
      ],
      "2026-09-03",
      now,
    );
    expect(s.todayMinutes).toBe(90);
    expect(s.openEntry?.id).toBe("open");
  });

  it("reports no open entry when every clock is stopped", () => {
    const s = summariseTime([entry()], "2026-09-03", now);
    expect(s.openEntry).toBeUndefined();
  });
});

describe("breaks are rest, not production", () => {
  it("excludes break and lunch minutes from today and the week", () => {
    const s = summariseTime(
      [
        entry({ id: "w", durationMinutes: 120 }),
        entry({ id: "b", kind: "break", durationMinutes: 15 }),
        entry({ id: "l", kind: "lunch", durationMinutes: 60 }),
      ],
      "2026-09-03",
    );
    expect(s.todayMinutes).toBe(120);
    expect(s.weekMinutes).toBe(120);
    expect(s.todayRestMinutes).toBe(75);
  });

  it("never attributes rest to a division", () => {
    const s = summariseTime(
      [entry({ id: "b", kind: "lunch", divisionId: "creditops", durationMinutes: 60 })],
      "2026-09-03",
    );
    expect(s.byDivision).toEqual([]);
  });
});

describe("the ticking clock", () => {
  const NOW = new Date("2026-09-03T10:30:45.000Z");

  it("counts a running entry in live seconds", () => {
    const e = entry({ endedAt: undefined, durationMinutes: undefined, startedAt: "2026-09-03T09:00:00.000Z" });
    expect(entrySeconds(e, NOW)).toBe(90 * 60 + 45);
  });

  it("a closed entry's seconds come from its stored minutes", () => {
    expect(entrySeconds(entry({ durationMinutes: 90 }))).toBe(5400);
  });

  it("formats hours, minutes and seconds — and never drops the seconds", () => {
    expect(formatClock(3872)).toBe("1h 04m 32s");
    expect(formatClock(725)).toBe("12m 05s");
    expect(formatClock(0)).toBe("0m 00s");
  });

  it("splits the day's live totals into work and rest", () => {
    const t = liveDaySeconds(
      [
        entry({ id: "w", durationMinutes: 60 }),
        entry({ id: "b", kind: "break", durationMinutes: 10 }),
        entry({ id: "r", kind: "work", endedAt: undefined, durationMinutes: undefined, startedAt: "2026-09-03T10:30:15.000Z" }),
      ],
      "2026-09-03",
      NOW,
    );
    expect(t.workSeconds).toBe(3600 + 30);
    expect(t.restSeconds).toBe(600);
  });
});

describe("the agent's own warnings", () => {
  const SCHEDULE = { workDays: [1, 2, 3, 4], shiftStart: "09:00:00", graceMinutes: 5, timezone: "UTC" };
  // 2026-09-03 is a Thursday (ISO day 4).

  it("splits rest into break and lunch", () => {
    const t = liveDaySeconds(
      [entry({ id: "b", kind: "break", durationMinutes: 20 }), entry({ id: "l", kind: "lunch", durationMinutes: 45 })],
      "2026-09-03",
    );
    expect(t.breakSeconds).toBe(1200);
    expect(t.lunchSeconds).toBe(2700);
  });

  it("counts lateness against shift start plus grace, in the schedule's timezone", () => {
    const late = lateMinutesToday(
      [entry({ startedAt: "2026-09-03T09:17:00.000Z" })],
      SCHEDULE, "2026-09-03",
    );
    expect(late).toBe(12); // 9:17 against 9:00 + 5m grace
  });

  it("says nothing on a day off, or before the first clock-in", () => {
    expect(lateMinutesToday([entry({ startedAt: "2026-09-04T12:00:00.000Z", workDate: "2026-09-04" })],
      SCHEDULE, "2026-09-04")).toBe(0); // Friday not in workDays
    expect(lateMinutesToday([], SCHEDULE, "2026-09-03")).toBe(0);
  });
});
