import { describe, expect, it } from "vitest";
import type { TimeEntry } from "@/lib/data/time-entries";
import {
  entryMinutes,
  formatDuration,
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
