import { describe, expect, it } from "vitest";
import { asDivision } from "./eod";
import { deriveEodTotals, type ProductionLog } from "@/lib/eod-production-engine";

const log = (divisionId: ProductionLog["divisionId"], qty: number, voided = false): ProductionLog => ({
  id: `${divisionId}-${qty}-${voided}`, employeeId: "e", employeeName: "E", divisionId,
  productionUnitType: divisionId, productionUnitQuantity: qty, actions: "", workDate: "2026-09-04",
  completedAt: "2026-09-04T10:00:00Z", isVoided: voided,
});

describe("EOD reconciliation across services", () => {
  it("maps every production service onto an engine division, BES CRM included", () => {
    expect(asDivision("creditops")).toBe("creditops");
    expect(asDivision("fundingops")).toBe("fundingops");
    expect(asDivision("talentops")).toBe("talentops");
    expect(asDivision("bes_crm")).toBe("bes-crm");
    expect(asDivision("something_else")).toBe("general");
  });

  it("totals by service agree with the row sum, voided rows excluded", () => {
    const rows = [
      log(asDivision("creditops"), 2), log(asDivision("fundingops"), 1),
      log(asDivision("bes_crm"), 1), log(asDivision("talentops"), 3), log(asDivision("fundingops"), 5, true),
    ];
    const t = deriveEodTotals(rows, "e", "2026-09-04");
    expect(t.totalUnits).toBe(7);
    expect(t.unitsByDivision).toEqual({ creditops: 2, fundingops: 1, "bes-crm": 1, talentops: 3, general: 0 });
    expect(t.activeLogs).toHaveLength(4);
  });
});
