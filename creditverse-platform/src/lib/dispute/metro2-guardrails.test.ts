/**
 * The guardrails are the last code that decides whether a dispute may be made
 * at all, and until now they had no tests. These are written to prove the
 * REFUSALS, not the permissions — a guardrail earns its place by the letters
 * it stops, and every one of these functions can suppress, permit or classify
 * a dispute action.
 *
 * Two invariants are asserted repeatedly and deliberately:
 *
 *   UNKNOWN NEVER BECOMES A VIOLATION. "The consumer does not recall this" is
 *   an instruction to investigate, never a § 1681b finding.
 *
 *   NOTHING IS EVER CLASSIFIED "established-violation". The taxonomy has the
 *   value; no guardrail may produce it.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeInquiry,
  checkFcbaEligibility,
  evaluateBreachGuardrail,
  evaluateTruthGate,
  type FcbaEligibilityInput,
  type InquiryAnalysisInput,
  type TruthGateAttestation,
} from "./metro2-guardrails";

/* A complete, passing attestation. Each test spoils exactly one thing. */
const goodAttestation = (over: Partial<TruthGateAttestation> = {}): TruthGateAttestation => ({
  consumerRecognizesAccount: "yes",
  specificInfoBelievedInaccurate: "The balance is reported as $1,400.",
  reasonForBelief: "I paid the account in full in March and hold the receipt.",
  supportingDocuments: ["payoff-letter.pdf"],
  ...over,
});

const inquiry = (over: Partial<InquiryAnalysisInput> = {}): InquiryAnalysisInput => ({
  consumerRecognizesInquiry: "no",
  ...over,
});

const fcba = (over: Partial<FcbaEligibilityInput> = {}): FcbaEligibilityInput => ({
  isLatePayment: true,
  hasPaymentConfirmation: true,
  within60DayWindow: true,
  openEndCredit: true,
  ...over,
});

describe("evaluateTruthGate", () => {
  it("passes a complete attestation", () => {
    const r = evaluateTruthGate(goodAttestation());
    expect(r.passed).toBe(true);
    expect(r.blocks).toEqual([]);
  });

  it("blocks when the consumer has not said whether they recognize the account", () => {
    const r = evaluateTruthGate(goodAttestation({ consumerRecognizesAccount: null }));
    expect(r.passed).toBe(false);
    expect(r.blocks.join(" ")).toMatch(/recognize the account/i);
  });

  it("blocks when nothing specific is identified as inaccurate", () => {
    expect(evaluateTruthGate(goodAttestation({ specificInfoBelievedInaccurate: "" })).passed).toBe(false);
  });

  it("blocks on whitespace as firmly as on an empty string", () => {
    const r = evaluateTruthGate(goodAttestation({ specificInfoBelievedInaccurate: "   ", reasonForBelief: "\n\t" }));
    expect(r.passed).toBe(false);
    expect(r.blocks).toHaveLength(2);
  });

  it("blocks when no reason for the belief is given", () => {
    expect(evaluateTruthGate(goodAttestation({ reasonForBelief: "" })).passed).toBe(false);
  });

  /* Missing evidence is a warning, not a refusal. A consumer may hold a true
     belief with nothing in hand, and CROA forbids untrue statements — not
     undocumented ones. */
  it("does NOT block for missing documents, but says they are needed", () => {
    const r = evaluateTruthGate(goodAttestation({ supportingDocuments: [] }));
    expect(r.passed).toBe(true);
    expect(r.blocks).toEqual([]);
    expect(r.requiredForFiling.join(" ")).toMatch(/supporting document/i);
  });

  it("blocks the identity-theft pathway until the consumer certifies it", () => {
    const r = evaluateTruthGate(goodAttestation({ consumerRecognizesAccount: "no" }));
    expect(r.passed).toBe(false);
    expect(r.blocks.join(" ")).toMatch(/identity theft/i);
  });

  it("never infers the identity-theft certification from a blank one", () => {
    expect(evaluateTruthGate(goodAttestation({ consumerRecognizesAccount: "no", identityTheftCertification: "   " })).passed).toBe(false);
  });

  it("allows the identity-theft pathway once certified, and lists what filing needs", () => {
    const r = evaluateTruthGate(goodAttestation({
      consumerRecognizesAccount: "no",
      identityTheftCertification: "I did not open, authorize or use this account.",
    }));
    expect(r.passed).toBe(true);
    expect(r.requiredForFiling.join(" ")).toMatch(/IdentityTheft\.gov/);
    expect(r.requiredForFiling.join(" ")).toMatch(/Proof of identity/);
  });

  it("does not demand an identity-theft certification from someone who is merely unsure", () => {
    const r = evaluateTruthGate(goodAttestation({ consumerRecognizesAccount: "unsure" }));
    expect(r.passed).toBe(true);
    expect(r.requiredForFiling.join(" ")).not.toMatch(/IdentityTheft\.gov/);
  });

  it("reports every block at once rather than one at a time", () => {
    const r = evaluateTruthGate({
      consumerRecognizesAccount: null,
      specificInfoBelievedInaccurate: "",
      reasonForBelief: "",
      supportingDocuments: [],
    });
    expect(r.blocks).toHaveLength(3);
    expect(r.passed).toBe(false);
  });
});

describe("analyzeInquiry — the § 1681b permissible-purpose tree", () => {
  it("treats a recognized inquiry as permissible and says do not dispute", () => {
    const r = analyzeInquiry(inquiry({ consumerRecognizesInquiry: "yes" }));
    expect(r.finding).toBe("authorized-application");
    expect(r.classification).toBe("consistent");
    expect(r.recommendedRoute).toMatch(/do not dispute/i);
  });

  /* A confirmed application outranks a faulty memory. Someone who applied for
     credit and forgot has still given permission. */
  it("a confirmed credit application outranks not recognizing the company", () => {
    const r = analyzeInquiry(inquiry({ consumerRecognizesInquiry: "no", hadCreditApplication: true }));
    expect(r.finding).toBe("authorized-application");
    expect(r.classification).toBe("consistent");
  });

  it.each([
    ["existingAccount", { existingAccount: true }, "account-review"],
    ["accountReview", { accountReview: true }, "account-review"],
    ["collectionActivity", { collectionActivity: true }, "collection-activity"],
    ["insurance", { insurance: true }, "insurance"],
    ["employment", { employment: true }, "employment"],
    ["writtenInstructions", { writtenInstructions: true }, "written-instructions"],
  ] as const)("%s is a permissible purpose and is never disputed", (_label, over, finding) => {
    const r = analyzeInquiry(inquiry({ consumerRecognizesInquiry: "no", ...over }));
    expect(r.finding).toBe(finding);
    expect(r.classification).toBe("consistent");
    expect(r.recommendedRoute.toLowerCase()).toContain("do not dispute");
  });

  /* THE RULE THAT MATTERS MOST. Not remembering an inquiry is not evidence
     that it lacked a permissible purpose. */
  it("UNSURE becomes an investigation, never a § 1681b finding", () => {
    const r = analyzeInquiry(inquiry({ consumerRecognizesInquiry: "unsure" }));
    expect(r.finding).toBe("needs-investigation");
    expect(r.classification).toBe("observed-difference");
    expect(r.classification).not.toBe("potential-fcra-reg-v-issue");
    expect(r.recommendedRoute).toMatch(/investigate/i);
    expect(r.flags.join(" ")).toMatch(/materially false dispute/i);
  });

  it("a permissible purpose still wins even when the consumer is unsure", () => {
    const r = analyzeInquiry(inquiry({ consumerRecognizesInquiry: "unsure", insurance: true }));
    expect(r.finding).toBe("insurance");
    expect(r.classification).toBe("consistent");
  });

  it("reaches a potential § 1681b issue only when no purpose exists at all", () => {
    const r = analyzeInquiry(inquiry({ consumerRecognizesInquiry: "no" }));
    expect(r.finding).toBe("no-clear-purpose");
    expect(r.classification).toBe("potential-fcra-reg-v-issue");
    expect(r.flags.join(" ")).toMatch(/confirm facts before asserting/i);
    expect(r.recommendedRoute).toMatch(/only after confirming/i);
  });

  it("cites § 1681b on every path, and never calls anything an established violation", () => {
    const inputs: InquiryAnalysisInput[] = [
      { consumerRecognizesInquiry: "yes" },
      { consumerRecognizesInquiry: "no" },
      { consumerRecognizesInquiry: "unsure" },
      { consumerRecognizesInquiry: "no", accountReview: true },
      { consumerRecognizesInquiry: "no", collectionActivity: true },
      { consumerRecognizesInquiry: "no", employment: true },
      { consumerRecognizesInquiry: "no", insurance: true },
      { consumerRecognizesInquiry: "no", writtenInstructions: true },
    ];
    for (const i of inputs) {
      const r = analyzeInquiry(i);
      expect(r.legalContext).toContain("15 U.S.C. § 1681b");
      expect(r.classification).not.toBe("established-violation");
    }
  });
});

describe("checkFcbaEligibility — § 1666 is not a late-payment eraser", () => {
  it("does not apply to anything that is not a late payment", () => {
    const r = checkFcbaEligibility(fcba({ isLatePayment: false }));
    expect(r.eligible).toBe(false);
    expect(r.classification).toBe("consistent");
  });

  /* The refusal the whole function exists for. */
  it("refuses 'I was late but want it removed'", () => {
    const r = checkFcbaEligibility(fcba({ consumerWasActuallyLate: true, hasPaymentConfirmation: false }));
    expect(r.eligible).toBe(false);
    expect(r.observation).toMatch(/not a mechanism for removing accurate late payments/i);
  });

  it("does not apply to closed-end credit", () => {
    const r = checkFcbaEligibility(fcba({ openEndCredit: false }));
    expect(r.eligible).toBe(false);
    expect(r.flags.join(" ")).toMatch(/open-end credit/i);
  });

  /* Missing evidence is an anomaly to chase, not a finding to assert. */
  it("treats a missing payment confirmation as needing evidence, not as an error", () => {
    const r = checkFcbaEligibility(fcba({ hasPaymentConfirmation: false }));
    expect(r.eligible).toBe(false);
    expect(r.classification).toBe("potential-anomaly");
    expect(r.classification).not.toBe("evidence-supported-inaccuracy");
  });

  it("refuses once the 60-day notice window has passed", () => {
    const r = checkFcbaEligibility(fcba({ within60DayWindow: false }));
    expect(r.eligible).toBe(false);
    expect(r.observation).toMatch(/60-day/);
  });

  it("qualifies only with all four facts together", () => {
    const r = checkFcbaEligibility(fcba());
    expect(r.eligible).toBe(true);
    expect(r.classification).toBe("evidence-supported-inaccuracy");
    expect(r.legalContext).toContain("15 U.S.C. § 1666");
    expect(r.legalContext).toContain("Reg Z 12 C.F.R. § 1026.13");
  });

  /**
   * Documented deliberately, because it looks like a contradiction and is not:
   * a consumer who WAS late in one month may still hold proof of a payment
   * that another month's statement failed to credit. The guard at the top of
   * the function is written `consumerWasActuallyLate && !hasPaymentConfirmation`
   * on purpose — documentary evidence outranks a self-report. Anyone changing
   * this should change it knowingly.
   */
  it("lets a payment confirmation outrank the consumer's own admission of lateness", () => {
    const r = checkFcbaEligibility(fcba({ consumerWasActuallyLate: true, hasPaymentConfirmation: true }));
    expect(r.eligible).toBe(true);
  });

  it("never produces an established violation on any path", () => {
    const paths: Partial<FcbaEligibilityInput>[] = [
      { isLatePayment: false },
      { consumerWasActuallyLate: true, hasPaymentConfirmation: false },
      { openEndCredit: false },
      { hasPaymentConfirmation: false },
      { within60DayWindow: false },
      {},
    ];
    for (const p of paths) {
      expect(checkFcbaEligibility(fcba(p)).classification).not.toBe("established-violation");
    }
  });
});

describe("evaluateBreachGuardrail — a breach is context, never proof", () => {
  /* The refusal this guardrail exists for. */
  it("refuses the identity-theft pathway on breach exposure alone", () => {
    const r = evaluateBreachGuardrail({ breachExposure: true, consumerRecognizesAccount: "yes" });
    expect(r.canUseIdentityTheftPathway).toBe(false);
    expect(r.flags.join(" ")).toMatch(/never manufacture an identity-theft allegation/i);
  });

  it("refuses it on breach exposure plus uncertainty", () => {
    const r = evaluateBreachGuardrail({ breachExposure: true, consumerRecognizesAccount: "unsure" });
    expect(r.canUseIdentityTheftPathway).toBe(false);
    expect(r.observation).toMatch(/does not prove this specific account/i);
  });

  it("opens the pathway only on all three facts: not recognized, confirmed unauthorized, report filed", () => {
    const r = evaluateBreachGuardrail({
      breachExposure: true,
      consumerRecognizesAccount: "no",
      consumerConfirmedUnauthorizedTransaction: true,
      hasIdentityTheftReport: true,
    });
    expect(r.canUseIdentityTheftPathway).toBe(true);
    expect(r.observation).toMatch(/1681c-2/);
  });

  it("refuses when the consumer does not recognize the account but has not confirmed it was unauthorized", () => {
    const r = evaluateBreachGuardrail({ consumerRecognizesAccount: "no" });
    expect(r.canUseIdentityTheftPathway).toBe(false);
    expect(r.flags.join(" ")).toMatch(/investigate before routing/i);
  });

  /**
   * Known weakness, asserted so it cannot change unnoticed: with the
   * unauthorized transaction confirmed but NO identity theft report, the gate
   * correctly stays shut — but the message says "no trigger detected" rather
   * than naming the missing report. The gate is right; the wording is not
   * helpful, and is recorded in ENGINE_INVENTORY.md as a follow-up.
   */
  it("stays shut without an identity theft report, though it does not say why", () => {
    const r = evaluateBreachGuardrail({
      consumerRecognizesAccount: "no",
      consumerConfirmedUnauthorizedTransaction: true,
      hasIdentityTheftReport: false,
    });
    expect(r.canUseIdentityTheftPathway).toBe(false);
    expect(r.observation).toMatch(/no identity-theft pathway trigger/i);
  });

  it("is shut by default when nothing at all is known", () => {
    const r = evaluateBreachGuardrail({ consumerRecognizesAccount: "unsure" });
    expect(r.canUseIdentityTheftPathway).toBe(false);
  });

  it("never opens the pathway without an explicit confirmation, on any combination", () => {
    for (const breachExposure of [true, false, undefined]) {
      for (const consumerRecognizesAccount of ["yes", "no", "unsure"] as const) {
        for (const consumerConfirmedUnauthorizedTransaction of [true, false, undefined]) {
          for (const hasIdentityTheftReport of [true, false, undefined]) {
            const r = evaluateBreachGuardrail({
              breachExposure,
              consumerRecognizesAccount,
              consumerConfirmedUnauthorizedTransaction,
              hasIdentityTheftReport,
            });
            if (r.canUseIdentityTheftPathway) {
              expect(consumerRecognizesAccount).toBe("no");
              expect(consumerConfirmedUnauthorizedTransaction).toBe(true);
              expect(hasIdentityTheftReport).toBe(true);
            }
          }
        }
      }
    }
  });
});
