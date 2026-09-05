import { describe, expect, it } from "vitest";
import { effectivePolicy, toLenderCriteria, type CatalogueLender } from "./lender-catalogue";

const lender: CatalogueLender = {
  id: "l1", name: "Alpha Capital", lenderKind: "funder", organizationId: null, active: true,
  programs: [
    {
      id: "p1", name: "Term", productFamily: "business_funding", productSubtype: null, statesAllowed: [], active: true,
      policyVersions: [
        { version: 1, criteria: { min_credit_score: 600 }, sourceType: "lender_policy_sheet", sourceReference: null, effectiveFrom: "2026-01-01", effectiveUntil: "2026-06-30", lastVerifiedAt: "2026-01-05T00:00:00Z" },
        { version: 2, criteria: { min_credit_score: "640", min_amount: 10000, industries_excluded: ["cannabis", 7] }, sourceType: "lender_policy_sheet", sourceReference: "Aug sheet", effectiveFrom: "2026-07-01", effectiveUntil: null, lastVerifiedAt: "2026-08-20T00:00:00Z" },
      ],
    },
    { id: "p2", name: "No policy yet", productFamily: "mca", productSubtype: null, statesAllowed: [], active: true, policyVersions: [] },
    { id: "p3", name: "Retired", productFamily: "mca", productSubtype: null, statesAllowed: [], active: false, policyVersions: [] },
  ],
};

describe("lender catalogue → matching criteria", () => {
  it("uses the policy version in force on the matching day, not the newest row", () => {
    expect(effectivePolicy(lender.programs[0], "2026-03-01")?.version).toBe(1);
    expect(effectivePolicy(lender.programs[0], "2026-09-05")?.version).toBe(2);
    expect(effectivePolicy(lender.programs[0], "2025-12-31")).toBeNull();
  });
  it("carries version and verification date; skips programs without a policy or retired", () => {
    const rows = toLenderCriteria([lender], "2026-09-05");
    expect(rows.map((r) => r.id)).toEqual(["p1"]);
    expect(rows[0]).toMatchObject({ policyVersion: "v2", lastVerifiedAt: "2026-08-20T00:00:00Z", minCreditScore: 640, minAmount: 10000, industriesExcluded: ["cannabis"], maxAmount: null });
  });
  it("an inactive lender contributes nothing", () => {
    expect(toLenderCriteria([{ ...lender, active: false }], "2026-09-05")).toEqual([]);
  });
});
