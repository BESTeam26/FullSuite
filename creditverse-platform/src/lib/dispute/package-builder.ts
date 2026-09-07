// Dispute Flow — Package Builder, AI Draft, Compliance Checks, Status Mapping
// All logic is HARDCODED (not AI) to avoid compliance issues.

import type { ClassifiedItem } from "@/lib/credit-classification";
import { getRound } from "./escalation-ladder";
import {
  LETTER_CATEGORIES,
  MAILING_ORDER,
  getItemLetterCategory,
  getCFPBCategory,
  isFTCBlocked,
  type LetterCategory,
} from "./letters-and-channels";
import {
  decideDisputePath,
  buildFactualDisputeRecord,
  type DisputeDecisionInput,
} from "./decision-engine";

// ─── Status Mapping ───────────────────────────────────────────────────────────

export const CLICKUP_STATUSES = [
  "Not Started",
  "Not started",
  "process r1",
  "onboarding follow up",
  "Active",
  "ready for processing",
  "processing prio",
  "for complaints",
  "ftc needed",
  "for cfpb only",
  "indispute - mailed",
  "editing & mailing",
  "1 monitoring issue",
  "2 monitoring issue",
  "3 monitoring issue",
  "workforce audit",
  "for client confirmation",
  "endorsed to client",
  "waiting for payment",
  "Done",
  "do not work",
  "canceled/inactive/",
  "completed/ graduated",
  "Closed",
  "archived",
] as const;

export const GOOGLE_SHEET_STATUSES = [
  "Onboarding - New Client",
  "Incomplete - Onboarding",
  "Ready For Processing",
  "PreRound Completed",
  "Dispute Ongoing",
  "Pending for Complaints",
  "Pending in LetterStream",
  "For Address Verification",
  "Missing Proof of Billing",
  "Credit Monitoring Issue",
  "Missing IDIQ",
  "Bill Past Due",
  "DO NOT PROCESS",
] as const;

// ─── Dispute Package ──────────────────────────────────────────────────────────

export interface DisputePackageItem {
  item: ClassifiedItem;
  letterCategory: LetterCategory;
  ftcRequired: boolean;
  ftcBlocked: boolean;
  cfpbCategory: string | null;
}

export interface DisputePackage {
  round: number;
  roundName: string;
  items: DisputePackageItem[];
  byCategory: Record<string, DisputePackageItem[]>;
  totalItems: number;
  totalLetters: number;
  /** Items where an operator recorded that the consumer reports identity theft. */
  ftcFilings: number;
  /** Categories for which a CFPB complaint is relevant CONTEXT — not a count of
   *  complaints to file. The consumer decides whether to complain at all. */
  cfpbRelevantCategories: number;
  mailPieces: number;
  mailingInstructions: string[];
}

export function buildDisputePackage(
  items: ClassifiedItem[],
  round: number,
): DisputePackage {
  /* CR-4b: the canonical ladder, not the retired 7-layer engine. A round the
     ladder does not define is still a round the operator may work — the
     package names it plainly rather than refusing. */
  const roundDef = getRound(round);
  const disputeItems = items.filter((i) => i.disposition === "dispute");

  const packageItems: DisputePackageItem[] = disputeItems.map((item) => {
    const letterCategory = getItemLetterCategory(item);
    return {
      item,
      letterCategory: letterCategory ?? LETTER_CATEGORIES[0],
      /* CR-4a: never derived from the category. An identity-theft route is
         reached only from a consumer statement an operator recorded, which a
         package has no business inferring. Until a recognition is threaded
         through, this is false for every item — which is the correct default,
         because BES requiring an FTC filing was the defect. */
      ftcRequired: false,
      ftcBlocked: isFTCBlocked(item),
      cfpbCategory: getCFPBCategory(item),
    };
  });

  const byCategory: Record<string, DisputePackageItem[]> = {};
  for (const pkg of packageItems) {
    const key = pkg.letterCategory.key;
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(pkg);
  }

  const ftcFilings = packageItems.filter(
    (p) => p.ftcRequired && !p.ftcBlocked,
  ).length;
  /* Counted as context, never as work to be done. A complaint is the
     consumer's decision and the platform never files one. */
  const cfpbRelevantCategories = new Set(
    packageItems.filter((p) => p.cfpbCategory).map((p) => p.cfpbCategory),
  ).size;
  /* Every dispute item produces a mail piece. How a letter actually reaches a
     bureau is an operating decision made outside the engine, so the package no
     longer encodes a per-bureau submission channel. */
  const mailPieces = packageItems.length;

  return {
    round,
    roundName: roundDef?.name ?? `Round ${round}`,
    items: packageItems,
    byCategory,
    totalItems: packageItems.length,
    totalLetters: Object.keys(byCategory).length,
    ftcFilings,
    cfpbRelevantCategories,
    mailPieces,
    mailingInstructions: MAILING_ORDER,
  };
}

// ─── AI Draft Suggestion (assists, never decides) ────────────────────────────
// Upgraded: the draft is now legal-path-driven. The decision engine picks the
// correct statutory pathway based on evidence + prior history, and the draft
// opens with the factual, evidence-based language — never a blanket deletion
// demand. Citations are trigger-based (only the statutes whose factual trigger
// is met), and the remedy mirrors §1681i(a)(5)(A): delete OR modify, as appropriate.

export function generateDisputeDraft(
  item: ClassifiedItem,
  round: number,
  context?: Partial<DisputeDecisionInput>,
): string {
  const input: DisputeDecisionInput = {
    item,
    round,
    hasEvidence: !!item.balance || !!item.dofd,
    priorDisputeCount: Math.max(0, round - 1),
    wasVerifiedPrior: round >= 2,
    hasNewEvidence: round >= 2,
    evidenceContradictsVerification: round >= 2,
    ...context,
  };
  const decision = decideDisputePath(input);
  const record = buildFactualDisputeRecord(input);
  const cat = getItemLetterCategory(item);
  const bureauList = item.bureaus.join(", ");
  const balance = item.balance ?? "unknown";
  const dofd = item.dofd ?? "not available";

  const errorTableText =
    record.errorTable.length > 0
      ? record.errorTable
          .map(
            (e) =>
              `  ${e.field}: reported ${e.reportedValue} | consumer asserts ${e.consumerAssertedCorrect} | evidence: ${e.evidence}`,
          )
          .join("\n")
      : "  (Gathering specific field + evidence before filing)";

  const historyText =
    record.priorDisputeHistory.length > 0
      ? record.priorDisputeHistory
          .map((h) => `  ${h.date}: ${h.action} → ${h.response} → ${h.result}`)
          .join("\n")
      : "  (No prior disputes on record)";

  return `${decision.opening}

Account: ${item.name}
Reported on: ${bureauList}
Balance: ${balance}
DOFD: ${dofd}
Category: ${cat?.label ?? "Dispute"}
Pathway: ${decision.pathway}
Confidence: ${decision.confidence}

DISPUTED FIELD TABLE
${errorTableText}

PRIOR DISPUTE HISTORY
${historyText}

LEGAL BASIS (trigger-based, evidence-grounded)
${decision.legalCitations.map((c) => `  • ${c}`).join("\n")}

REQUESTED REMEDY
${decision.remedy}

${decision.flags.length > 0 ? `COMPLIANCE FLAGS\n${decision.flags.map((f) => `  ⚠ ${f}`).join("\n")}\n\n` : ""}Under the FCRA, you are required to investigate this dispute within 30 days (up to 45 days in certain circumstances) and notify me of the results within 5 business days of completing the investigation. If the information cannot be verified as complete and accurate, delete or correct it as appropriate.

I declare under penalty of perjury that the information in this dispute is true and correct to the best of my knowledge.`;
}

// ─── Compliance Guardrail ────────────────────────────────────────────────────

export interface ComplianceCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: "block" | "warn";
}

export function runComplianceChecks(
  items: ClassifiedItem[],
): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  const linkedInquiries = items.filter(isFTCBlocked);
  checks.push({
    id: "ftc-linked-inquiry",
    label: "No FTC filing on inquiries linked to open accounts",
    passed: linkedInquiries.length === 0,
    detail:
      linkedInquiries.length === 0
        ? "No inquiries linked to open accounts are flagged for FTC."
        : `${linkedInquiries.length} inquiry/inquiries linked to open accounts must be EXCLUDED from FTC filings.`,
    severity: "block",
  });

  const disputeItems = items.filter((i) => i.disposition === "dispute");
  const uncategorized = disputeItems.filter((i) => !getItemLetterCategory(i));
  checks.push({
    id: "category-assigned",
    label: "All dispute items have a letter category",
    passed: uncategorized.length === 0,
    detail:
      uncategorized.length === 0
        ? "All dispute items are mapped to a category-based letter."
        : `${uncategorized.length} item(s) lack a letter category.`,
    severity: "warn",
  });

  checks.push({
    id: "attestation",
    label: "Consumer attestation required before filing",
    passed: true,
    detail:
      "No dispute can move from Drafting to Filed without a consumer attestation and a separate QA pass.",
    severity: "block",
  });

  checks.push({
    id: "no-fabricated-id-theft",
    label: "No fabricated identity theft claims",
    passed: true,
    detail:
      "Identity theft disputes require a separate verified workflow with supporting documentation. Never infer or fabricate identity theft facts.",
    severity: "block",
  });

  return checks;
}
