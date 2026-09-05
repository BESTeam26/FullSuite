import { describe, expect, it } from "vitest";
import { fundingDepartmentStatuses, fundingHandoffEntryStatus, isOpenFundingStatus, nextFundingDepartment } from "./funding-department-domain";

describe("funding department status", () => {
  it("vocabulary and hand-off entry per department", () => {
    expect(fundingDepartmentStatuses("Stipulations")).toEqual(["NOT STARTED", "OUTSTANDING", "SATISFIED"]);
    expect(fundingHandoffEntryStatus("Stipulations")).toBe("OUTSTANDING");
    expect(fundingHandoffEntryStatus("Readiness Review")).toBe("IN REVIEW");
    expect(nextFundingDepartment("Offers")).toBe("Funded Deals");
    expect(nextFundingDepartment("Funded Deals")).toBeNull();
  });
  it("closed statuses mean no open work", () => {
    expect(isOpenFundingStatus("SATISFIED")).toBe(false);
    expect(isOpenFundingStatus("OUTSTANDING")).toBe(true);
  });
});
