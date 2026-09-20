/**
 * Year-to-date, and the difference between "nothing" and "not yours to see".
 *
 * The summary must never turn a withheld number into a zero. A zero BES cost
 * would tell a reader that BES paid nothing for this person, which is a
 * statement — and a false one — where `null` is an absence.
 */
import { describe, expect, it } from "vitest";
import { yearToDate, type PayrollRecordRow } from "@/lib/data/compensation";

const row = (over: Partial<PayrollRecordRow>): PayrollRecordRow => ({
  payslipId: "p", cutoffId: "c", periodStart: "2026-09-01", periodEnd: "2026-09-15",
  payday: null, status: "released", currency: "PHP", basis: "hourly", rateCents: 8000,
  workMinutes: 4800, paidLeaveMinutes: 0, paidBreakMinutes: 0, paidDays: 10,
  baseCents: 640000, adjustmentCents: 0, adjustmentNote: null, grossCents: 640000,
  besTotalCents: 800000, marginCents: 160000, managingPartnerName: "Bryan Breva",
  ...over,
});

describe("yearToDate", () => {
  it("adds up only the released periods of the year asked for", () => {
    const ytd = yearToDate(
      [row({}), row({ periodEnd: "2025-12-31" }), row({ status: "draft" })],
      2026,
    );
    expect(ytd.periods).toBe(1);
    expect(ytd.grossCents).toBe(640000);
  });

  it("sums both sides when the caller may see cost", () => {
    const ytd = yearToDate([row({}), row({ periodEnd: "2026-09-30" })], 2026);
    expect(ytd.grossCents).toBe(1280000);
    expect(ytd.besTotalCents).toBe(1600000);
    expect(ytd.marginCents).toBe(320000);
  });

  it("reports a withheld cost as absent, never as zero", () => {
    const ytd = yearToDate([row({ besTotalCents: null, marginCents: null })], 2026);
    expect(ytd.grossCents).toBe(640000);
    expect(ytd.besTotalCents).toBeNull();
    expect(ytd.marginCents).toBeNull();
  });

  it("counts hours as worked plus paid leave plus allowed paid break", () => {
    expect(yearToDate([row({ workMinutes: 100, paidLeaveMinutes: 20, paidBreakMinutes: 5 })], 2026).minutes)
      .toBe(125);
  });
});
