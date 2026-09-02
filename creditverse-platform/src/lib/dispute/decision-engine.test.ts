import { describe, it, expect } from "vitest";
import {
  decideDisputePath,
  buildFactualDisputeRecord,
  type DisputeDecisionInput,
} from "./decision-engine";
import type { ClassifiedItem } from "@/lib/credit-classification";

const item = (o: Partial<ClassifiedItem> = {}): ClassifiedItem => ({
  id: "acct-1",
  name: "Midland Credit",
  kind: "Account",
  status: "Collection",
  bureaus: ["EQ", "EX", "TU"],
  category: "3rd-Party Collection",
  isNegative: true,
  isDerogatory: true,
  disposition: "dispute",
  aiReason: "",
  autoSelected: true,
  riskFlags: [],
  ...o,
});

const decide = (o: Partial<DisputeDecisionInput> = {}) =>
  decideDisputePath({ item: item(), round: 1, ...o });

describe("decideDisputePath", () => {
  it("routes identity theft to the §1681c-2 blocking pathway with human review", () => {
    const d = decide({ isIdentityTheft: true });
    expect(d.pathway).toBe("identity-theft-block");
    expect(d.state).toBe("identity-theft");
    expect(d.legalCitations).toEqual(["15 U.S.C. § 1681c-2"]);
    expect(d.humanReviewRequired).toBe(true);
  });

  it("treats 'consumer does not recognize account' as identity theft, but not undefined", () => {
    expect(decide({ consumerRecognizesAccount: false }).pathway).toBe("identity-theft-block");
    expect(decide({ consumerRecognizesAccount: undefined }).pathway).toBe("cra-accuracy");
  });

  it("identity theft outranks every other trigger", () => {
    const d = decide({
      isIdentityTheft: true,
      reinsertionDetected: true,
      wasPreviouslyDeleted: true,
      round: 3,
    });
    expect(d.pathway).toBe("identity-theft-block");
  });

  it("routes reinsertion only when the item was previously deleted AND reappeared", () => {
    const d = decide({ reinsertionDetected: true, wasPreviouslyDeleted: true });
    expect(d.pathway).toBe("reinsertion");
    expect(d.state).toBe("reimport");
    expect(d.legalCitations).toEqual([
      "15 U.S.C. § 1681i(a)(5)(B)",
      "15 U.S.C. § 1681i(a)(5)(C)",
    ]);
    expect(d.humanReviewRequired).toBe(false);
    // reappearance without a prior deletion is not a reinsertion
    expect(decide({ reinsertionDetected: true }).pathway).toBe("cra-accuracy");
  });

  it("uses the FCBA billing-error path only for Late Payment items with qualifying facts", () => {
    const late = decide({ item: item({ category: "Late Payment" }), hasBillingErrorFacts: true });
    expect(late.pathway).toBe("billing-error");
    expect(late.legalCitations).toEqual(["15 U.S.C. § 1666"]);

    const chargeOff = decide({ item: item({ category: "Charge-Off" }), hasBillingErrorFacts: true });
    expect(chargeOff.pathway).toBe("cra-accuracy");
  });

  it("requests the reinvestigation procedure when verified-but-contradicted at round 2+", () => {
    const d = decide({ round: 2, wasVerifiedPrior: true, evidenceContradictsVerification: true });
    expect(d.pathway).toBe("procedure-request");
    expect(d.state).toBe("procedure-request");
    expect(d.legalCitations).toEqual(["15 U.S.C. § 1681i(a)(6)", "15 U.S.C. § 1681i(a)(7)"]);
  });

  it("escalates with new information when verified-but-contradicted at round 1", () => {
    const base = { round: 1, wasVerifiedPrior: true, evidenceContradictsVerification: true };
    const without = decide(base);
    expect(without.pathway).toBe("cra-reinvestigation-escalation");
    expect(without.state).toBe("escalation-new-info");
    expect(without.legalCitations).toContain("Reg V 12 C.F.R. § 1022.43");
    expect(without.flags).not.toContain("New evidence attached — supports non-frivolous escalation");

    const withNew = decide({ ...base, hasNewEvidence: true });
    expect(withNew.flags).toContain("New evidence attached — supports non-frivolous escalation");
  });

  it("never reaches the potential-compliance-failure branch", () => {
    // NOTE: possible bug — the "Round 3+ and prior disputes failed" branch
    // requires wasVerifiedPrior && evidenceContradictsVerification, but the
    // earlier verified-but-contradicted branch returns first for every round
    // >= 2, so this input yields "procedure-request" instead of
    // "potential-compliance-failure" and never sets humanReviewRequired.
    const d = decide({
      round: 3,
      priorDisputeCount: 2,
      wasVerifiedPrior: true,
      evidenceContradictsVerification: true,
      hasEvidence: true,
    });
    expect(d.pathway).toBe("procedure-request");
    expect(d.state).not.toBe("potential-compliance-failure");
    expect(d.humanReviewRequired).toBe(false);
  });

  it("goes direct to the furnisher at round 3+ with the Reg V CRO caveat", () => {
    const d = decide({ round: 3 });
    expect(d.pathway).toBe("furnisher-direct");
    expect(d.legalCitations).toEqual(["15 U.S.C. § 1681s-2", "Reg V 12 C.F.R. § 1022.43"]);
    expect(d.flags[0]).toMatch(/Reg V CRO exception/);
    expect(d.humanReviewRequired).toBe(false);
  });

  it("defaults to a CRA accuracy dispute, guarding against evidence-less filings", () => {
    const withEvidence = decide({ hasEvidence: true });
    expect(withEvidence.pathway).toBe("cra-accuracy");
    expect(withEvidence.legalCitations).toEqual(["15 U.S.C. § 1681e(b)", "15 U.S.C. § 1681i"]);
    expect(withEvidence.flags).toEqual([]);
    expect(withEvidence.opening).toMatch(/error table/);

    const noEvidence = decide({ hasEvidence: false });
    expect(noEvidence.pathway).toBe("cra-accuracy");
    expect(noEvidence.flags).toHaveLength(2);
    expect(noEvidence.flags[0]).toMatch(/frivolous-dispute guardrail/);
    expect(noEvidence.opening).toMatch(/gathering the specific field/);
  });
});

describe("buildFactualDisputeRecord", () => {
  it("builds one error-table row per populated field, marking evidence Pending when none attached", () => {
    const rec = buildFactualDisputeRecord({
      item: item({ balance: "$1,200", dofd: "03/2024", status: "Collection" }),
      round: 1,
      hasEvidence: false,
    });
    expect(rec.errorTable.map((e) => e.field)).toEqual([
      "Balance",
      "Date of First Delinquency",
      "Account status",
    ]);
    expect(rec.errorTable.every((e) => e.evidence === "Pending")).toBe(true);
    expect(rec.evidenceAttached).toBe(false);
    expect(rec.consumerAttestation).toBe(false);
  });

  it("omits rows for missing fields and carries the decision through", () => {
    const rec = buildFactualDisputeRecord({
      item: item({ balance: undefined, dofd: undefined, status: "Collection" }),
      round: 3,
      hasEvidence: true,
    });
    expect(rec.errorTable).toHaveLength(1);
    expect(rec.errorTable[0].evidence).toBe("Attached documentation");
    expect(rec.pathway).toBe("furnisher-direct");
    expect(rec.evidenceAttached).toBe(true);
  });

  it("caps prior dispute history at two rounds and reflects verification result", () => {
    const none = buildFactualDisputeRecord({ item: item(), round: 1 });
    expect(none.priorDisputeHistory).toEqual([]);

    const one = buildFactualDisputeRecord({ item: item(), round: 2, priorDisputeCount: 1 });
    expect(one.priorDisputeHistory).toHaveLength(1);
    expect(one.priorDisputeHistory[0].result).toBe("Pending");

    const many = buildFactualDisputeRecord({
      item: item(),
      round: 5,
      priorDisputeCount: 5,
      wasVerifiedPrior: true,
    });
    expect(many.priorDisputeHistory).toHaveLength(2);
    expect(many.priorDisputeHistory.every((h) => h.result === "Verified / no change")).toBe(true);
  });
});
