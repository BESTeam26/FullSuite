import { describe, expect, it } from "vitest";
import { ATTENDANCE_LABEL, applyCorrection } from "./attendance-day-label";

const day = { status: "late" as const, lateMinutes: 40 };

describe("an attendance day after a correction", () => {
  it("reads as the correction, and a late corrected to on time keeps no late minutes", () => {
    const c = { day: "2026-10-01", to: "on_time" as const, reason: "Portal outage", by: "Allyssa", at: "2026-10-01T20:00:00Z" };
    expect(applyCorrection(day, c)).toEqual({ status: "present", lateMinutes: 0, correctedBy: "Allyssa" });
    expect(ATTENDANCE_LABEL.present).toBe("On time");
  });
  it("stands as derived without one", () => {
    expect(applyCorrection(day, undefined)).toEqual({ status: "late", lateMinutes: 40, correctedBy: null });
  });
});
