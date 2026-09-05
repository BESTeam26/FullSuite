import { describe, expect, it } from "vitest";
import { lookbackPeriods, missingRequests, resolveRequirements, ruleInForce, type RequirementRule } from "./requirement-resolver";

const base: Omit<RequirementRule, "id" | "documentType" | "partyKind"> = {
  version: 1, active: true, productFamily: "business_funding", productSubtype: null, lenderId: null, programId: null,
  requirement: "required", condition: {}, lookbackMonths: null, effectiveFrom: "2026-01-01", effectiveUntil: null,
};
const rules: RequirementRule[] = [
  { ...base, id: "r-bank", documentType: "bank_statement", partyKind: "business", lookbackMonths: 3 },
  { ...base, id: "r-id", documentType: "government_id", partyKind: "person" },
  { ...base, id: "r-owner-pfs", documentType: "owner_financial_statement", partyKind: "owner_guarantor", condition: { min_ownership_pct: 20 } },
  { ...base, id: "r-tax-big", documentType: "business_tax_return", partyKind: "business", requirement: "conditional", condition: { min_amount: 150000 } },
  { ...base, id: "r-lender-x", documentType: "processing_statement", partyKind: "business", lenderId: "lender-x", lookbackMonths: 3 },
  { ...base, id: "r-acq", documentType: "purchase_agreement", partyKind: "business", condition: { scenario: { acquisition: true } } },
  { ...base, id: "r-old", documentType: "sba_form_1919", partyKind: "business", effectiveFrom: "2025-01-01", effectiveUntil: "2026-06-01" },
  { ...base, id: "r-mca", documentType: "voided_check", partyKind: "business", productFamily: "mca" },
];
const parties = [
  { id: "biz", kind: "business", ownershipPct: null },
  { id: "p1", kind: "person", ownershipPct: null },
  { id: "own-60", kind: "owner_guarantor", ownershipPct: 60 },
  { id: "own-10", kind: "owner_guarantor", ownershipPct: 10 },
];
const app = { productFamily: "business_funding", requestedAmount: 75_000, state: "TX", entityType: "LLC", scenario: {} };

describe("requirement resolver", () => {
  it("lookback periods are the complete months before the matching month, newest first", () => {
    expect(lookbackPeriods("2026-09-05", 3)).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(lookbackPeriods("2026-01-15", 2)).toEqual(["2025-12", "2025-11"]);
  });
  it("a rule is in force between its effective dates and only while active", () => {
    expect(ruleInForce(rules[6], "2026-03-01")).toBe(true);
    expect(ruleInForce(rules[6], "2026-06-01")).toBe(false);
    expect(ruleInForce({ ...rules[0], active: false }, "2026-09-05")).toBe(false);
  });
  it("expands periodic documents, scopes owner rules by ownership, skips other products, lenders and expired rules", () => {
    const out = resolveRequirements({ rules, application: app, parties, asOf: "2026-09-05" });
    const types = out.map((r) => `${r.documentType}${r.period ? "@" + r.period : ""}${r.partyId ? "#" + r.partyId : ""}`).sort();
    expect(types).toEqual([
      "bank_statement@2026-06#biz", "bank_statement@2026-07#biz", "bank_statement@2026-08#biz",
      "government_id#p1",
      "owner_financial_statement#own-60",
    ]);
    // Conditional tax returns only above the amount band; acquisition documents only with the scenario flag.
    const big = resolveRequirements({ rules, application: { ...app, requestedAmount: 200_000, scenario: { acquisition: true } }, parties, asOf: "2026-09-05" });
    expect(big.some((r) => r.documentType === "business_tax_return" && r.requirement === "conditional")).toBe(true);
    expect(big.some((r) => r.documentType === "purchase_agreement")).toBe(true);
  });
  it("lender-specific rules apply only when preparing for that lender", () => {
    const generic = resolveRequirements({ rules, application: app, parties, asOf: "2026-09-05" });
    expect(generic.some((r) => r.documentType === "processing_statement")).toBe(false);
    const forX = resolveRequirements({ rules, application: app, parties, asOf: "2026-09-05", lenderId: "lender-x" });
    expect(forX.filter((r) => r.documentType === "processing_statement")).toHaveLength(3);
  });
  it("missingRequests leaves out what the file already asks for", () => {
    const resolved = resolveRequirements({ rules, application: app, parties, asOf: "2026-09-05" });
    const missing = missingRequests(resolved, [{ documentType: "bank_statement", partyId: "biz", period: "2026-08" }, { documentType: "government_id", partyId: "p1", period: null }]);
    expect(missing.map((r) => r.documentType + (r.period ?? "")).sort()).toEqual(["bank_statement2026-06", "bank_statement2026-07", "owner_financial_statement"]);
  });
  it("without a product family nothing resolves — the application decides the package, not a default", () => {
    expect(resolveRequirements({ rules, application: { ...app, productFamily: null }, parties, asOf: "2026-09-05" })).toEqual([]);
  });
});
