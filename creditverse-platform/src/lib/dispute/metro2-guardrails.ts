// Metro 2 Intelligence — Guardrails & Specialized Analysis
// Truth Gate, FCBA eligibility, breach/identity-theft guardrail, and the
// corrected permissible-purpose inquiry analysis (replaces the dangerous
// "absence of written authorization = unauthorized inquiry" rule).

import type { AnomalyClassification } from "./metro2-taxonomy";

// ─── Truth Gate — required before every letter ─────────────────────────────────

export interface TruthGateAttestation {
  consumerRecognizesAccount: "yes" | "no" | "unsure" | null;
  specificInfoBelievedInaccurate: string;
  reasonForBelief: string;
  supportingDocuments: string[];
  identityTheftCertification?: string;
}

export interface TruthGateResult {
  passed: boolean;
  blocks: string[];
  requiredForFiling: string[];
}

/**
 * The Truth Gate runs before any letter is generated. It enforces CROA's
 * prohibition on counseling consumers to make untrue or misleading statements.
 */
export function evaluateTruthGate(
  attestation: TruthGateAttestation,
): TruthGateResult {
  const blocks: string[] = [];
  const requiredForFiling: string[] = [];

  if (attestation.consumerRecognizesAccount === null) {
    blocks.push(
      "Consumer must confirm whether they recognize the account before any dispute is filed.",
    );
  }

  if (!attestation.specificInfoBelievedInaccurate.trim()) {
    blocks.push(
      "The specific information believed to be inaccurate must be identified.",
    );
  }

  if (!attestation.reasonForBelief.trim()) {
    blocks.push("The reason for the belief must be stated.");
  }

  if (attestation.supportingDocuments.length === 0) {
    requiredForFiling.push(
      "At least one supporting document strengthens the dispute and avoids a frivolous finding.",
    );
  }

  // Identity theft requires a certification — never inferred
  if (attestation.consumerRecognizesAccount === "no") {
    if (!attestation.identityTheftCertification?.trim()) {
      blocks.push(
        "Identity theft pathway requires a consumer certification that they did not open, authorize, use, or receive goods/services from the transaction.",
      );
    }
    requiredForFiling.push("FTC identity theft report (IdentityTheft.gov)");
    requiredForFiling.push("Proof of identity");
    requiredForFiling.push(
      "Identification of the allegedly fraudulent information",
    );
  }

  return {
    passed: blocks.length === 0,
    blocks,
    requiredForFiling,
  };
}

// ─── Permissible-Purpose Inquiry Analysis (corrected §1681b model) ─────────────

export type PermissiblePurposeFinding =
  | "authorized-application"
  | "account-review"
  | "collection-activity"
  | "insurance"
  | "employment"
  | "written-instructions"
  | "no-clear-purpose"
  | "needs-investigation";

export interface InquiryAnalysisInput {
  consumerRecognizesInquiry: "yes" | "no" | "unsure";
  companyName?: string;
  hadCreditApplication?: boolean;
  existingAccount?: boolean;
  accountReview?: boolean;
  collectionActivity?: boolean;
  insurance?: boolean;
  employment?: boolean;
  writtenInstructions?: boolean;
}

export interface InquiryAnalysisResult {
  finding: PermissiblePurposeFinding;
  classification: AnomalyClassification;
  observation: string;
  legalContext: string[];
  recommendedRoute: string;
  flags: string[];
}

/**
 * Corrected inquiry analysis. §1681b contains MANY permissible purposes;
 * written authorization is required only in some situations. Accusing a
 * lender without confirming the facts can create a materially false dispute.
 */
export function analyzeInquiry(
  input: InquiryAnalysisInput,
): InquiryAnalysisResult {
  const flags: string[] = [];
  const legalContext: string[] = ["15 U.S.C. § 1681b"];

  if (input.consumerRecognizesInquiry === "yes" || input.hadCreditApplication) {
    flags.push(
      "Consumer recognizes the inquiry or confirms a credit application",
    );
    return {
      finding: "authorized-application",
      classification: "consistent",
      observation:
        "The inquiry appears tied to a credit application the consumer initiated.",
      legalContext,
      recommendedRoute:
        "Do not dispute — a credit application is a permissible purpose under §1681b.",
      flags,
    };
  }

  if (input.existingAccount || input.accountReview) {
    flags.push("Inquiry tied to an existing account review");
    return {
      finding: "account-review",
      classification: "consistent",
      observation:
        "The inquiry appears to be an account review of an existing relationship.",
      legalContext,
      recommendedRoute:
        "Do not dispute — account review is a permissible purpose.",
      flags,
    };
  }

  if (input.collectionActivity) {
    return {
      finding: "collection-activity",
      classification: "consistent",
      observation: "The inquiry appears tied to collection activity.",
      legalContext,
      recommendedRoute:
        "Do not dispute on permissible-purpose grounds — collection is a permissible purpose.",
      flags,
    };
  }

  if (input.insurance) {
    return {
      finding: "insurance",
      classification: "consistent",
      observation: "Insurance underwriting is a permissible purpose.",
      legalContext,
      recommendedRoute: "Do not dispute.",
      flags,
    };
  }

  if (input.employment) {
    return {
      finding: "employment",
      classification: "consistent",
      observation:
        "Employment screening (with appropriate authorization) is a permissible purpose.",
      legalContext,
      recommendedRoute: "Do not dispute.",
      flags,
    };
  }

  if (input.writtenInstructions) {
    return {
      finding: "written-instructions",
      classification: "consistent",
      observation:
        "Consumer provided written instructions — a permissible purpose.",
      legalContext,
      recommendedRoute: "Do not dispute.",
      flags,
    };
  }

  if (input.consumerRecognizesInquiry === "unsure") {
    flags.push(
      "Consumer unsure — investigate before accusing the lender of accessing without permissible purpose",
    );
    flags.push(
      "Accusing a lender without confirming the facts can create a materially false dispute",
    );
    return {
      finding: "needs-investigation",
      classification: "observed-difference",
      observation:
        "The consumer does not recall the inquiry. Investigation is required before any permissible-purpose challenge.",
      legalContext,
      recommendedRoute:
        "Investigate the company and any application/account relationship before disputing.",
      flags,
    };
  }

  // No clear purpose found
  flags.push("No identifiable permissible purpose — potential §1681b issue");
  flags.push(
    "Confirm facts before asserting the inquiry lacked a permissible purpose",
  );
  return {
    finding: "no-clear-purpose",
    classification: "potential-fcra-reg-v-issue",
    observation: "No permissible purpose has been identified for this inquiry.",
    legalContext,
    recommendedRoute:
      "Factual dispute citing §1681b — only after confirming no application/account relationship exists.",
    flags,
  };
}

// ─── FCBA Eligibility Check (corrected §1666) ──────────────────────────────────

export interface FcbaEligibilityInput {
  isLatePayment: boolean;
  hasPaymentConfirmation: boolean;
  within60DayWindow: boolean;
  openEndCredit: boolean;
  consumerWasActuallyLate?: boolean;
}

export interface FcbaEligibilityResult {
  eligible: boolean;
  classification: AnomalyClassification;
  observation: string;
  legalContext: string[];
  flags: string[];
}

/**
 * FCBA §1666 is NOT a universal late-payment removal tool. It applies only to
 * qualifying open-end billing errors within the 60-day window. "I was late but
 * want it removed" does NOT qualify.
 */
export function checkFcbaEligibility(
  input: FcbaEligibilityInput,
): FcbaEligibilityResult {
  const flags: string[] = [];
  const legalContext: string[] = [
    "15 U.S.C. § 1666",
    "Reg Z 12 C.F.R. § 1026.13",
  ];

  if (!input.isLatePayment) {
    return {
      eligible: false,
      classification: "consistent",
      observation: "Not a late-payment item — FCBA not applicable.",
      legalContext,
      flags: ["FCBA only applies to qualifying billing errors"],
    };
  }

  if (input.consumerWasActuallyLate && !input.hasPaymentConfirmation) {
    flags.push(
      "Consumer was actually late — FCBA does not convert a real late payment into a billing error",
    );
    return {
      eligible: false,
      classification: "consistent",
      observation:
        "The consumer was actually late. FCBA is not a mechanism for removing accurate late payments.",
      legalContext,
      flags,
    };
  }

  if (!input.openEndCredit) {
    flags.push(
      "FCBA applies to open-end credit (e.g., credit cards), not all account types",
    );
    return {
      eligible: false,
      classification: "consistent",
      observation:
        "This account does not appear to be open-end credit. FCBA may not apply.",
      legalContext,
      flags,
    };
  }

  if (!input.hasPaymentConfirmation) {
    flags.push("No payment confirmation — cannot establish a billing error");
    return {
      eligible: false,
      classification: "potential-anomaly",
      observation:
        "A billing-error claim requires evidence that a payment was not properly credited.",
      legalContext,
      flags,
    };
  }

  if (!input.within60DayWindow) {
    flags.push(
      "Written notice must reach the creditor within 60 days of the statement containing the error",
    );
    return {
      eligible: false,
      classification: "potential-anomaly",
      observation:
        "The 60-day FCBA notice window has passed for this statement.",
      legalContext,
      flags,
    };
  }

  flags.push(
    "Qualifying FCBA billing error — payment confirmation within 60-day window on open-end credit",
  );
  return {
    eligible: true,
    classification: "evidence-supported-inaccuracy",
    observation:
      "The creditor's statement failed to reflect a documented payment within the 60-day FCBA window. This is a qualifying billing error.",
    legalContext,
    flags,
  };
}

// ─── Breach / Identity-Theft Guardrail ─────────────────────────────────────────

export interface BreachGuardrailResult {
  canUseIdentityTheftPathway: boolean;
  observation: string;
  flags: string[];
}

/**
 * A breach is RISK CONTEXT, not proof that a particular tradeline resulted from
 * identity theft. The AI must NEVER manufacture an identity-theft allegation
 * from breach exposure alone. CROA prohibits counseling untrue statements.
 */
export function evaluateBreachGuardrail(input: {
  breachExposure?: boolean;
  consumerRecognizesAccount: "yes" | "no" | "unsure";
  consumerConfirmedUnauthorizedTransaction?: boolean;
  hasIdentityTheftReport?: boolean;
}): BreachGuardrailResult {
  const flags: string[] = [];

  if (input.breachExposure && input.consumerRecognizesAccount !== "no") {
    flags.push(
      "Breach exposure is risk context, not proof this account is fraudulent",
    );
    flags.push(
      "Never manufacture an identity-theft allegation from breach exposure alone",
    );
    return {
      canUseIdentityTheftPathway: false,
      observation:
        "The consumer was exposed to a data breach, but exposure does not prove this specific account resulted from identity theft. Use the breach as context for fraud monitoring, not as a dispute basis.",
      flags,
    };
  }

  if (
    input.consumerRecognizesAccount === "no" &&
    input.consumerConfirmedUnauthorizedTransaction &&
    input.hasIdentityTheftReport
  ) {
    flags.push(
      "Consumer confirmed unauthorized transaction + identity theft report on file",
    );
    return {
      canUseIdentityTheftPathway: true,
      observation:
        "The consumer does not recognize the account, has confirmed the transaction was unauthorized, and has filed an identity theft report. The §1681c-2 blocking pathway may apply.",
      flags,
    };
  }

  if (
    input.consumerRecognizesAccount === "no" &&
    !input.consumerConfirmedUnauthorizedTransaction
  ) {
    flags.push(
      "Consumer does not recognize the account but has not confirmed the transaction was unauthorized",
    );
    flags.push(
      "Investigate before routing to the identity-theft blocking pathway",
    );
    return {
      canUseIdentityTheftPathway: false,
      observation:
        "The consumer does not recognize the account, but the identity-theft pathway requires a confirmation that the transaction was unauthorized plus an identity theft report.",
      flags,
    };
  }

  return {
    canUseIdentityTheftPathway: false,
    observation: "No identity-theft pathway trigger detected.",
    flags,
  };
}
