/**
 * The dispute reason catalogue — Dee's 2024 Metro 2 / factual disputing
 * library, encoded as data.
 *
 * WHY DATA AND NOT CODE: a reason is wording, and wording changes when the
 * law moves, when a bureau starts rejecting a phrase, or when Dee finds
 * something that works better. Encoding it as a catalogue means the selector
 * below never changes — it picks by rule — while the words are editable.
 *
 * WHAT PICKS ONE: the item's category, the CONDITIONS actually detected in the
 * imported report (not typed by an agent), the round, and the escalation tier
 * the organization chose. Nothing here is chosen by a model.
 *
 * ── The claim tiers, and why they exist ──────────────────────────────────
 *
 * Dee's library runs from measured to very aggressive, and both ends are
 * legitimate: a consumer may argue forcefully in their own dispute. What
 * creates liability for a *credit repair organization* is narrower and
 * specific (CROA, 15 U.S.C. § 1679b):
 *
 *   • guaranteeing or implying a result;
 *   • advising a consumer to state something the organization knows or should
 *     know is untrue;
 *   • misrepresenting the service.
 *
 * So the gate is not "how angry is this letter". It is:
 *
 *   1. Does it promise an outcome?                      → never allowed
 *   2. Does it assert a fact about this consumer?        → allowed only when
 *      (identity theft, breach impact, "never late",        the consumer has
 *      "I contacted them and they produced nothing")        attested to it
 *   3. Does it state a legal conclusion as settled?      → allowed as the
 *      ("this is a willful violation")                      consumer's own
 *                                                            demand, flagged
 *                                                            for human review
 *
 * That is why each entry carries `requiresAttestation` and `claimTier` rather
 * than being blocked by a word list. A phrase list cannot tell the difference
 * between a consumer who really was a breach victim and one who was not.
 */
import type { NegativeCategory } from "@/lib/credit-classification";

/** Everything the catalogue can be written against, including the ones the
 *  classifier calls something broader. */
export type ReasonSubject =
  | NegativeCategory
  | "Personal Information"
  | "Address"
  | "Name"
  | "Employer"
  | "Bankruptcy"
  | "Child Support"
  | "Medical Collection"
  | "Unknown Collection";

/**
 * Conditions are FACTS DETECTED IN THE REPORT, or facts the consumer has
 * attested to. Never an agent's opinion, and never inferred from a name.
 */
export type ReasonCondition =
  /* Cross-bureau comparisons — computed from the imported snapshot */
  | "deleted_from_other_bureaus"
  | "single_bureau_only"
  | "balance_inconsistent"
  | "dates_inconsistent"
  | "status_inconsistent"
  | "payment_history_inconsistent"
  /* Internal contradictions within one bureau's own record */
  | "paid_status_but_late_marks"
  | "charge_off_with_balance"
  | "collection_with_past_due"
  | "discharged_with_balance"
  | "current_but_late_mark"
  | "severe_late_without_prior_30"
  | "dola_before_open_date"
  | "data_missing_or_deficient"
  | "balance_above_high_credit"
  /* Account shape */
  | "auto_loan"
  | "student_loan"
  | "medical"
  | "open_revolving"
  | "single_late_mark"
  | "multiple_late_marks"
  /* Procedural history — from our own record of what we sent and got back */
  | "prior_dispute_unanswered"
  | "not_notated_as_disputed"
  | "reinserted_after_deletion"
  | "verification_not_produced"
  /* Consumer attestations — signed, never assumed */
  | "attested_identity_theft"
  | "attested_breach_impact"
  | "attested_never_late"
  | "attested_not_mine"
  | "attested_no_written_consent"
  | "attested_requested_proof_none_given"
  | "attested_collector_still_contacting";

/** How hard the letter pushes. The organization chooses; the round suggests. */
export type EscalationTier = "initial" | "firm" | "aggressive";

/**
 * How it sounds, which is a separate axis from how hard it pushes.
 *
 * Dee's "AGGRESSIVE ATTACK" and "SOME HEAVY ASS WORDS" columns are not another
 * tier and not a destination — they are the register: a real person, annoyed,
 * writing about their own report. A firm letter can be plain and an aggressive
 * one can still be measured, so the two are chosen independently.
 *
 * The rule that keeps them apart: `voice` governs TONE, `claimTier` governs
 * what may be ASSERTED. Being annoyed is never the compliance question.
 */
export type Voice = "plain" | "frustrated";

/**
 * What kind of claim the wording makes — this, not a banned-word list, is what
 * the gate reasons about.
 */
export type ClaimTier =
  /** Points at a discrepancy the report itself shows. Always safe. */
  | "observed_discrepancy"
  /** Asks the bureau to verify or produce records. Always safe. */
  | "procedural_demand"
  /** States a fact about this consumer's own history or identity. */
  | "consumer_asserted_fact"
  /** States a legal conclusion. The consumer's demand, not our finding. */
  | "legal_conclusion";

export interface DisputeReason {
  id: string;
  /** Null for a BES default; set for an organization's own wording. */
  organizationId?: string | null;
  isActive: boolean;
  subject: ReasonSubject;
  tier: EscalationTier;
  /** Every one of these must hold for the entry to be offered. */
  requires: ReasonCondition[];
  /** Offered from this round onward. */
  fromRound: number;
  claimTier: ClaimTier;
  /** Register. Independent of tier: how it sounds, not how hard it pushes. */
  voice: Voice;
  /**
   * The attestations the consumer must have signed before this wording may be
   * used. Empty means the report alone supports it.
   */
  requiresAttestation: ReasonCondition[];
  /** Statutes the wording relies on, for the citation check. */
  citations: string[];
  /** Higher wins when several entries match. */
  weight: number;
  /** What the person picking sees in a list. */
  label: string;
  /** The wording itself. `{{placeholders}}` are filled by letter-merge. */
  body: string;
}

export const REASON_CATALOGUE_VERSION = "2024.1-dee";
