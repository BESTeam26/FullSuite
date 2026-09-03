import { describe, it, expect, vi, afterEach } from "vitest";
import {
  deriveEodTotals,
  isEodMissing,
  seedProductionLogs,
  type ProductionLog,
  type EodSubmission,
} from "./eod-production-engine";

const log = (
  o: Partial<ProductionLog> & Pick<ProductionLog, "id">,
): ProductionLog => ({
  employeeId: "emp-1",
  employeeName: "Test Employee",
  divisionId: "creditops",
  productionUnitType: "Dispute Letters",
  productionUnitQuantity: 1,
  actions: "",
  workDate: "2026-09-01",
  completedAt: "2026-09-01T12:00:00Z",
  isVoided: false,
  ...o,
});

const submission = (state: EodSubmission["state"]): EodSubmission => ({
  id: "eod-1",
  employeeId: "emp-1",
  employeeName: "Test Employee",
  workDate: "2026-09-01",
  state,
  totalUnits: 0,
  unitsByDivision: {
    creditops: 0,
    fundingops: 0,
    "bes-crm": 0,
    talentops: 0,
    general: 0,
  },
  unitsByType: {},
  logCount: 0,
});

describe("deriveEodTotals", () => {
  const logs: ProductionLog[] = [
    log({ id: "a", productionUnitQuantity: 10 }),
    log({
      id: "b",
      divisionId: "fundingops",
      productionUnitType: "Deals Processed",
      productionUnitQuantity: 5,
    }),
    log({
      id: "c",
      productionUnitQuantity: 7,
      isVoided: true,
      voidReason: "dup",
    }),
    log({ id: "d", employeeId: "emp-2", productionUnitQuantity: 3 }),
    log({ id: "e", workDate: "2026-09-02", productionUnitQuantity: 4 }),
    log({ id: "f", productionUnitQuantity: 2 }), // same type as "a" -> should sum
  ];

  it("sums only the target employee's non-voided logs for the given date", () => {
    const r = deriveEodTotals(logs, "emp-1", "2026-09-01");
    expect(r.totalUnits).toBe(17); // 10 + 5 + 2
    expect(r.activeLogs.map((l) => l.id)).toEqual(["a", "b", "f"]);
  });

  it("excludes voided logs, other employees and other work dates", () => {
    const r = deriveEodTotals(logs, "emp-1", "2026-09-01");
    const ids = r.activeLogs.map((l) => l.id);
    expect(ids).not.toContain("c"); // voided
    expect(ids).not.toContain("d"); // other employee
    expect(ids).not.toContain("e"); // other date
  });

  it("groups units by division with every division key present", () => {
    const r = deriveEodTotals(logs, "emp-1", "2026-09-01");
    expect(r.unitsByDivision).toEqual({
      creditops: 12,
      fundingops: 5,
      "bes-crm": 0,
      talentops: 0,
      general: 0,
    });
  });

  it("groups units by production unit type, summing repeated types", () => {
    const r = deriveEodTotals(logs, "emp-1", "2026-09-01");
    expect(r.unitsByType).toEqual({
      "Dispute Letters": 12,
      "Deals Processed": 5,
    });
  });

  it("returns zeroed totals when nothing matches", () => {
    const r = deriveEodTotals(logs, "emp-999", "2026-09-01");
    expect(r.totalUnits).toBe(0);
    expect(r.activeLogs).toEqual([]);
    expect(r.unitsByType).toEqual({});
    expect(Object.values(r.unitsByDivision).every((v) => v === 0)).toBe(true);
  });
});

describe("isEodMissing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is missing once the current hour reaches shift end + grace", () => {
    // shift ends 17:00, 2h grace -> cutoff 19:00
    expect(isEodMissing(null, 17, 2, 19)).toBe(true);
    expect(isEodMissing(null, 17, 2, 23)).toBe(true);
  });

  it("is not missing before the cutoff hour", () => {
    expect(isEodMissing(null, 17, 2, 18)).toBe(false);
    expect(isEodMissing(null, 17, 2, 9)).toBe(false);
  });

  it("is never missing once submitted, reviewed or approved", () => {
    expect(isEodMissing(submission("submitted"), 17, 2, 23)).toBe(false);
    expect(isEodMissing(submission("reviewed"), 17, 2, 23)).toBe(false);
    expect(isEodMissing(submission("approved"), 17, 2, 23)).toBe(false);
  });

  it("treats draft and needs_clarification like no submission", () => {
    expect(isEodMissing(submission("draft"), 17, 2, 20)).toBe(true);
    expect(isEodMissing(submission("needs_clarification"), 17, 2, 20)).toBe(
      true,
    );
    expect(isEodMissing(submission("draft"), 17, 2, 12)).toBe(false);
  });

  it("defaults currentHour to the wall clock (local hours)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 20, 0, 0));
    expect(isEodMissing(null)).toBe(true); // 20:00 >= 19:00 default cutoff
    vi.setSystemTime(new Date(2026, 8, 2, 10, 0, 0));
    expect(isEodMissing(null)).toBe(false);
  });

  it("wraps past midnight for a night shift", () => {
    // Shift ends 23:00 with 2h grace, so the EOD is overdue from 01:00.
    expect(isEodMissing(null, 23, 2, 1)).toBe(true);
    expect(isEodMissing(null, 23, 2, 6)).toBe(true);
    expect(isEodMissing(null, 23, 2, 22)).toBe(true);
    // Not yet overdue: still inside the grace window.
    expect(isEodMissing(null, 23, 2, 0)).toBe(false);
    // The shift-end hour itself is the new shift's window, not overdue.
    expect(isEodMissing(null, 23, 2, 23)).toBe(false);
  });

  it("still reports a submitted night-shift EOD as present", () => {
    expect(isEodMissing(submission("submitted"), 23, 2, 6)).toBe(false);
  });

  it("handles a cutoff landing exactly on midnight", () => {
    // 22:00 + 2h = 24:00 -> wraps to 00:00, overdue from midnight to 21:00.
    expect(isEodMissing(null, 22, 2, 0)).toBe(true);
    expect(isEodMissing(null, 22, 2, 21)).toBe(true);
    expect(isEodMissing(null, 22, 2, 22)).toBe(false);
  });
});

describe("seedProductionLogs", () => {
  it("has unique ids, no voided rows, and a single shared work date", () => {
    const ids = seedProductionLogs.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(seedProductionLogs.every((l) => !l.isVoided)).toBe(true);
    expect(new Set(seedProductionLogs.map((l) => l.workDate)).size).toBe(1);
    expect(seedProductionLogs[0].workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("derives the expected per-employee totals", () => {
    const date = seedProductionLogs[0].workDate;
    expect(deriveEodTotals(seedProductionLogs, "emp-1", date).totalUnits).toBe(
      22,
    );
    expect(deriveEodTotals(seedProductionLogs, "emp-2", date).totalUnits).toBe(
      36,
    );
    expect(
      deriveEodTotals(seedProductionLogs, "emp-2", date).unitsByType[
        "Dispute Letters"
      ],
    ).toBe(12);
  });
});
