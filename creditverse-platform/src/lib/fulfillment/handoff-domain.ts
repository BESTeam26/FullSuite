/**
 * CreditOps ⇄ FundingOps hand-off — the deterministic rules (proposal:
 * ARCHITECTURE_PROPOSAL_FUNDING_READINESS_HANDOFF.md). Pure functions: the
 * screens ask, the database RPCs enforce. Names and emails never decide
 * anything here; links are ids (rule 4).
 */
export type FundingHandoffStatus = "Credit Readiness";
export const CREDIT_READINESS_STATUS: FundingHandoffStatus = "Credit Readiness";

/** Funding statuses from which a client may be sent to CreditOps for readiness. */
export const SENDABLE_FUNDING_STATUSES: readonly string[] = ["Onboarding", "Readiness Review", "Declined"];

/** Funding status a qualified client returns to. */
export const RETURN_FUNDING_STATUS = "Readiness Review";

export interface HandoffContext {
  fundingStatus: string;
  linkedFulfillmentClientId: string | null;
  creditOpsEntitled: boolean;
  fundingOpsEntitled: boolean;
}

export type HandoffDecision = { allowed: true } | { allowed: false; reason: string };

export function canSendToCreditOps(ctx: HandoffContext): HandoffDecision {
  if (!ctx.creditOpsEntitled) return { allowed: false, reason: "This organization is not entitled to CreditOps." };
  if (ctx.fundingStatus === CREDIT_READINESS_STATUS) return { allowed: false, reason: "Already in credit readiness." };
  if (!SENDABLE_FUNDING_STATUSES.includes(ctx.fundingStatus))
    return { allowed: false, reason: `A client in "${ctx.fundingStatus}" is past readiness; funding work continues in FundingOps.` };
  return { allowed: true };
}

export function canReturnToFundingOps(ctx: HandoffContext): HandoffDecision {
  if (!ctx.fundingOpsEntitled) return { allowed: false, reason: "This organization is not entitled to FundingOps." };
  if (!ctx.linkedFulfillmentClientId) return { allowed: false, reason: "No linked CreditOps client." };
  if (ctx.fundingStatus !== CREDIT_READINESS_STATUS)
    return { allowed: false, reason: "The funding client is not in credit readiness." };
  return { allowed: true };
}
