import { describe, expect, it } from "vitest";
import { STALE_TIMER_HOURS, describeRunningFor, isStaleTimer, runningHours } from "./time-domain";
import type { TimeEntry } from "@/lib/data/time-entries";

const at = (hoursAgo: number): TimeEntry =>
  ({ startedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(), endedAt: null }) as TimeEntry;

describe("stale timers", () => {
  it("warns only past the cap", () => {
    expect(isStaleTimer(at(1))).toBe(false);
    expect(isStaleTimer(at(STALE_TIMER_HOURS - 0.1))).toBe(false);
    expect(isStaleTimer(at(STALE_TIMER_HOURS + 1))).toBe(true);
    expect(isStaleTimer(null)).toBe(false);
  });

  it("measures how long it has been running", () => {
    expect(Math.round(runningHours(at(3)))).toBe(3);
  });

  it("says the duration in words", () => {
    expect(describeRunningFor(at(16))).toMatch(/^16 hours/);
    expect(describeRunningFor(at(1.5))).toBe("1 hour 30 minutes");
  });
});
