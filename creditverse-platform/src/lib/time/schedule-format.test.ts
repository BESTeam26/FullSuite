/**
 * D-028 (Dee, 2026-10-15): a flexible schedule has hours, not a start time.
 * The one-line summary says "Flexible · 8h/day" and never prints a grace
 * nothing reads; a fixed schedule reads exactly as before.
 */
import { describe, expect, it } from "vitest";
import type { WorkSchedule } from "@/lib/data/people-management";
import { describeSchedule, scheduledHoursPerDay, shiftLabel } from "./schedule-format";

const base: WorkSchedule = {
  id: "s", userId: "u", workDays: [1, 2, 3, 4, 5], shiftStart: "09:00:00", shiftEnd: "18:00:00",
  lunchMinutes: 60, breakMinutes: 30, graceMinutes: 120, timezone: "America/New_York", effectiveFrom: "2026-10-01", kind: "fixed",
};

describe("how a schedule reads", () => {
  it("a fixed shift: days, times, zone, allowances and grace", () => {
    expect(describeSchedule(base)).toBe("MTWTF · 09:00–18:00 America/New_York · lunch 60m · breaks 30m · grace 120m");
    expect(shiftLabel(base)).toBe("9:00 AM – 6:00 PM");
  });
  it("a flexible schedule: the hours a day, no start time, no grace", () => {
    const flex = { ...base, kind: "flexible" as const };
    expect(scheduledHoursPerDay(flex)).toBe(8);
    expect(describeSchedule(flex)).toBe("MTWTF · Flexible · 8h/day · lunch 60m · breaks 30m");
    expect(shiftLabel(flex)).toBe("Flexible · 8h/day");
  });
  it("no schedule says so", () => {
    expect(shiftLabel(undefined)).toBe("No schedule");
  });
});
