/**
 * What the operator recorded the consumer as saying about an account.
 *
 * This module exists because of one live defect: BES told staff that a federal
 * identity-theft report at IdentityTheft.gov was "Required for third-party
 * collections". An account type is not evidence of identity theft, the FTC
 * warns specifically against false identity-theft reports used as a
 * credit-repair tactic, and filing one is a false statement to a federal
 * agency.
 *
 * ── THE DISTINCTION THIS MODULE PROTECTS ───────────────────────────────────
 *
 *   CONSUMER ASSERTION      "the consumer says they did not open this"
 *   BES VERIFIED FACT       something BES established
 *
 * BES may record and repeat the first, in the consumer's voice, attributed and
 * dated. It may never promote it into the second. That is why the state below
 * is `consumer_reports_identity_theft` and not `identity_theft_confirmed`: the
 * name has to keep saying who is speaking, because a name like "confirmed"
 * invites every later reader to forget.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ──────────────────────────────
 *
 * It does not gate anything on a document. Evidence lives outside BES as often
 * as inside it — a phone call, a client's confirmation, a note from a previous
 * round, a file in the company's own drive. BES guides; the organization
 * decides its own SOP; the operator remains responsible for the facts.
 *
 * Nothing here is inferred. There is no path from a category, a status, a
 * balance or a breach to any of these states. A person selects one.
 */
import type { ClassifiedItem } from "@/lib/credit-classification";

/**
 * The four answers an operator may record. Deliberately not a boolean and
 * deliberately not defaulted — "we have not asked yet" is a real answer and
 * must not read as "recognized".
 */
export type AccountRecognition =
  | "consumer_reports_identity_theft"
  | "consumer_does_not_recognize"
  | "account_recognized"
  | "needs_further_review";

export const RECOGNITION_LABEL: Record<AccountRecognition, string> = {
  consumer_reports_identity_theft: "Consumer reports identity theft",
  consumer_does_not_recognize: "Consumer does not recognize account",
  account_recognized: "Account is recognized",
  needs_further_review: "Needs further review",
};

/**
 * How a recorded answer must be described anywhere it is read back.
 *
 * Every one of these is in the consumer's voice or the operator's, never in
 * BES's. "The consumer reports…" survives being quoted out of context;
 * "identity theft" does not.
 */
export const RECOGNITION_PROVENANCE: Record<AccountRecognition, string> = {
  consumer_reports_identity_theft:
    "Consumer statement, recorded by the operator. Not independently verified by BES.",
  consumer_does_not_recognize:
    "Consumer statement, recorded by the operator. Not a claim of identity theft.",
  account_recognized: "Consumer statement, recorded by the operator.",
  needs_further_review: "No consumer answer recorded yet.",
};

/** Where a recorded fact came from. Never upgraded by anything downstream. */
export type StatementProvenance = "consumer_statement" | "operator_recorded_statement";

export interface RecordedRecognition {
  recognition: AccountRecognition;
  provenance: StatementProvenance;
  /** Who recorded it, and when. A statement without an author is not a record. */
  recordedBy?: string;
  recordedAt?: string;
  /** How the operator heard it — a call, the portal, an email. Free text, optional. */
  how?: string;
}

/**
 * What BES says about an account before anybody has answered.
 *
 * Education, not instruction. It names what the account type does NOT
 * establish, and points at the organization's own process rather than at a
 * federal form.
 */
export const IDENTITY_THEFT_EDUCATION =
  "This account type alone does not establish identity theft. If the consumer states that the " +
  "account resulted from identity theft, follow your organization's identity-theft dispute SOP.";

/**
 * Whether that education is worth showing for this item.
 *
 * True for the categories a consumer most often does not recognise — which is
 * exactly where the old rule did its damage by treating "unfamiliar" as
 * "fraudulent". Showing the education here is the correction; it carries no
 * requirement and no routing.
 */
export function shouldShowIdentityTheftEducation(item: ClassifiedItem): boolean {
  return item.category === "3rd-Party Collection" || item.category === "Inquiry";
}

/**
 * May BES surface the identity-theft route for this item?
 *
 * ONLY when an operator has recorded that the consumer reports identity theft.
 * Never from the item. The parameter is the recorded answer, not the account,
 * and that is the whole point of the function.
 */
export function identityTheftRouteAvailable(recognition: AccountRecognition | undefined): boolean {
  return recognition === "consumer_reports_identity_theft";
}

export interface RecognitionGuidance {
  /** Shown to the operator. Educational; never an instruction to file anything. */
  message: string;
  /** Steps BES suggests. Suggestions — an organization's SOP decides. */
  suggestions: string[];
  /** True only where the consumer has reported identity theft. */
  identityTheftRouteAvailable: boolean;
  /**
   * Set only when the route is available. Offered as a resource the CONSUMER
   * may use, never as a step BES requires of the operator.
   */
  consumerResourceUrl?: string;
}

/**
 * What BES offers, given what the operator recorded.
 *
 * No branch returns a requirement, and no branch asks for a file.
 */
export function guidanceFor(
  item: ClassifiedItem,
  recognition: AccountRecognition | undefined,
): RecognitionGuidance {
  switch (recognition) {
    case "consumer_reports_identity_theft":
      return {
        message:
          "Recorded: the consumer reports this account resulted from identity theft. That is the " +
          "consumer's statement — BES has not verified it. Follow your organization's " +
          "identity-theft dispute SOP.",
        suggestions: [
          "Your organization's SOP may require an identity theft report, a police report or a signed affidavit.",
          "The § 1681c-2 block route rests on the consumer's own report and identification.",
          "IdentityTheft.gov is where a consumer creates an FTC identity theft report, if they choose to.",
        ],
        identityTheftRouteAvailable: true,
        consumerResourceUrl: "https://www.identitytheft.gov/",
      };

    /* The state the old rule collapsed into identity theft. Kept separate on
       purpose: an unrecognised tradeline is far more often a trading name, a
       purchased debt or an old account than it is fraud. */
    case "consumer_does_not_recognize":
      return {
        message:
          "Recorded: the consumer does not recognize this account. This is not a claim of identity " +
          "theft, and BES does not treat it as one.",
        suggestions: [
          "Consider checking whether the creditor reports under a different trading name.",
          "Consider whether the debt was sold or transferred from an account the consumer does know.",
          "A factual dispute may proceed on the consumer's statement alone.",
        ],
        identityTheftRouteAvailable: false,
      };

    case "account_recognized":
      return {
        message: "Recorded: the consumer recognizes this account.",
        suggestions: [
          "Dispute specific fields the consumer says are wrong — balance, dates, status, payment history.",
        ],
        identityTheftRouteAvailable: false,
      };

    case "needs_further_review":
    case undefined:
    default:
      return {
        message: shouldShowIdentityTheftEducation(item)
          ? IDENTITY_THEFT_EDUCATION
          : "Record what the consumer says about this account when you have asked them.",
        suggestions: [
          "Ask the consumer whether they recognize this account before choosing a dispute route.",
        ],
        identityTheftRouteAvailable: false,
      };
  }
}
