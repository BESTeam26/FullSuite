/**
 * Rounds 1 to 12 — the case, built.
 *
 * Dee: "build a case from round 1 to round 12 aggressively. All dispute rounds
 * should be escalated with the dispute steps and escalation rounds."
 *
 * ── The rule that shapes everything below ───────────────────────────────────
 *
 * A ROUND IS EARNED BY THE RECORD, NOT BY COUNTING.
 *
 * The BES dispute specification is blunt about it: "Don't label every letter an
 * escalation" and "build strength from the factual record, not from louder
 * language." So each round declares what must ALREADY BE TRUE before it can be
 * entered, and `availableRound()` computes the highest round the case has
 * actually reached. A file cannot arrive at round 7 by sending seven letters;
 * it arrives there by accumulating seven rounds' worth of unanswered facts.
 *
 * This is what makes aggression credible. Round 9 is devastating because it
 * carries eight documented failures, each with a date. Round 9 sent on day two
 * is noise, and the bureau treats it as noise.
 *
 * ── What escalates ──────────────────────────────────────────────────────────
 *
 * Not the volume. Four things, in order:
 *
 *   1. WHO is being written to — the bureau, then the furnisher, then that
 *      furnisher's compliance function, then its executive office, then a
 *      regulator, then counsel.
 *   2. WHAT IS BEING ASKED FOR — correction, then the method of verification,
 *      then the furnisher's own records, then an explanation of a procedural
 *      failure, then a remedy.
 *   3. WHAT THE RECORD PROVES — every round inherits the last one's unanswered
 *      questions, with dates. That accumulation is the leverage.
 *   4. WHICH STATUTE IS IN PLAY — and only when the facts reach it. §1681n
 *      willfulness is not a round number; it is a finding, and it needs a
 *      record and a human.
 *
 * Two rounds are gated on the CONSUMER's authorization, not ours: a regulatory
 * complaint and anything pre-litigation. The specification forbids threatening
 * a filing the consumer has not authorized or does not intend, and a threat we
 * cannot carry out is worse than no threat at all.
 */

export type Recipient =
  | "cra"
  | "furnisher"
  | "furnisher_compliance"
  | "furnisher_executive"
  | "collector"
  | "regulator_cfpb"
  | "regulator_state"
  | "regulator_ftc"
  | "counsel";

/** What must already be true in the case record to enter a round. */
export type EntryRequirement =
  | "confirmed_finding"
  | "prior_cra_result"
  | "still_reported_after_result"
  | "mov_requested"
  | "mov_not_produced"
  | "direct_dispute_sent"
  | "furnisher_window_elapsed"
  | "two_cra_cycles_same_field"
  | "our_notice_documented"
  | "no_dispute_notation"
  | "deleted_then_reinserted"
  | "no_reinsertion_notice"
  | "compliance_contact_exhausted"
  | "consumer_authorised_regulator"
  | "cfpb_response_inadequate"
  | "willfulness_record"
  | "consumer_authorised_legal"
  | "human_review_complete";

export interface RoundDefinition {
  number: number;
  name: string;
  /** One line a person can read on a queue card. */
  focus: string;
  recipients: Recipient[];
  /** All of these must hold. This is the gate, and it is not advisory. */
  requires: EntryRequirement[];
  /** What this round asks for that no earlier round asked for. */
  asksFor: string[];
  /** Cited only when the facts of this round actually reach the provision. */
  legalBasis: string[];
  /** A person signs this round off before it leaves. */
  humanReview: boolean;
  /** The consumer must say yes, not merely be told. */
  consumerAuthorisation: boolean;
}

export const ESCALATION_LADDER: RoundDefinition[] = [
  {
    number: 1,
    name: "Factual dispute to the bureau",
    focus: "State the error precisely and ask for the specific correction it calls for.",
    recipients: ["cra"],
    requires: ["confirmed_finding"],
    asksFor: [
      "Correction of the exact field that is wrong, or deletion only where the whole tradeline is unsupported",
      "Written results of the reinvestigation",
    ],
    legalBasis: ["15 U.S.C. § 1681i(a)", "15 U.S.C. § 1681e(b)"],
    humanReview: false,
    consumerAuthorisation: false,
  },
  {
    number: 2,
    name: "Method of verification",
    focus: "The bureau said verified. Ask how.",
    recipients: ["cra"],
    requires: ["prior_cra_result", "still_reported_after_result"],
    asksFor: [
      "A description of the procedure used to verify the disputed field",
      "The business contacted, and the date and manner of contact",
    ],
    /* §1681i(a)(7) gets a DESCRIPTION of the procedure. It does not entitle
       anyone to the underlying paperwork, and asking as though it does invites
       a refusal that costs the round. */
    legalBasis: ["15 U.S.C. § 1681i(a)(6)(B)(iii)", "15 U.S.C. § 1681i(a)(7)"],
    humanReview: false,
    consumerAuthorisation: false,
  },
  {
    number: 3,
    name: "Direct dispute to the furnisher",
    focus: "Go to the source of the data instead of the messenger.",
    recipients: ["furnisher", "collector"],
    requires: ["prior_cra_result", "mov_requested"],
    asksFor: [
      "The furnisher's own investigation of the specific field",
      "Correction at source, reported to every bureau it furnishes to",
    ],
    /* Reg V sets what a direct dispute must contain and where it must go. A
       direct dispute that misses those requirements can be dismissed without
       an investigation, which wastes the round. */
    legalBasis: ["15 U.S.C. § 1681s-2(b)", "12 C.F.R. § 1022.43"],
    humanReview: false,
    consumerAuthorisation: false,
  },
  {
    number: 4,
    name: "Furnisher compliance officer",
    focus: "The furnisher's investigation did not fix it. Escalate inside the furnisher.",
    recipients: ["furnisher_compliance"],
    requires: ["direct_dispute_sent", "furnisher_window_elapsed"],
    asksFor: [
      "Review by the compliance function rather than the servicing queue",
      "The records that substantiate the field at the time it was furnished",
    ],
    /* 12 C.F.R. § 1022.41(d): integrity means the information is substantiated
       by the furnisher's own records AT THE TIME IT IS FURNISHED. That is the
       question this round asks, and it is a fair one. */
    legalBasis: ["12 C.F.R. § 1022.41(d)", "12 C.F.R. § 1022.42", "15 U.S.C. § 1681s-2(a)"],
    humanReview: true,
    consumerAuthorisation: false,
  },
  {
    number: 5,
    name: "Bureau procedural failure",
    focus: "Two cycles, the same unresolved field. The procedure itself is the issue now.",
    recipients: ["cra"],
    requires: ["two_cra_cycles_same_field", "still_reported_after_result"],
    asksFor: [
      "What changed in the procedure between the two reinvestigations",
      "Why the same field survived both",
    ],
    legalBasis: ["15 U.S.C. § 1681e(b)", "15 U.S.C. § 1681i(a)(4)"],
    humanReview: true,
    consumerAuthorisation: false,
  },
  {
    number: 6,
    name: "Dispute notation",
    focus: "We gave notice. The account is still reported without a dispute marker.",
    recipients: ["furnisher", "collector"],
    requires: ["our_notice_documented", "no_dispute_notation"],
    asksFor: ["The account marked as disputed for as long as the dispute is open"],
    /* Two different provisions depending on WHO is reporting: a furnisher's
       duty to notify, and a collector's duty not to communicate credit
       information while omitting that the debt is disputed. Applying the
       collector provision to an original creditor is a common and costly
       mistake. */
    legalBasis: ["15 U.S.C. § 1681s-2(a)(3)", "15 U.S.C. § 1692e(8)"],
    humanReview: true,
    consumerAuthorisation: false,
  },
  {
    number: 7,
    name: "Reinsertion",
    focus: "It was deleted. It came back. Nobody said so.",
    recipients: ["cra"],
    requires: ["deleted_then_reinserted", "no_reinsertion_notice"],
    asksFor: [
      "The certification the furnisher gave before the item was reinserted",
      "The notice that should have arrived within five business days",
    ],
    legalBasis: ["15 U.S.C. § 1681i(a)(5)(B)"],
    humanReview: true,
    consumerAuthorisation: false,
  },
  {
    number: 8,
    name: "Executive office",
    focus: "Compliance is exhausted. Put it in front of someone who owns the outcome.",
    recipients: ["furnisher_executive"],
    requires: ["compliance_contact_exhausted", "still_reported_after_result"],
    asksFor: [
      "An owner for the correction, by name",
      "A date by which the record will be accurate",
    ],
    legalBasis: ["15 U.S.C. § 1681s-2(b)", "12 C.F.R. § 1022.42"],
    humanReview: true,
    consumerAuthorisation: false,
  },
  {
    number: 9,
    name: "CFPB complaint",
    focus: "The documented record goes to the regulator — with the consumer's say-so.",
    recipients: ["regulator_cfpb"],
    requires: ["consumer_authorised_regulator", "compliance_contact_exhausted"],
    asksFor: ["A response through the CFPB portal, with the full correspondence record attached"],
    legalBasis: ["12 U.S.C. § 5493(b)(3)"],
    humanReview: true,
    consumerAuthorisation: true,
  },
  {
    number: 10,
    name: "State regulator and FTC",
    focus: "The CFPB response did not resolve it. Widen the audience.",
    recipients: ["regulator_state", "regulator_ftc"],
    requires: ["cfpb_response_inadequate", "consumer_authorised_regulator"],
    asksFor: ["State-level review, and an FTC record of the reporting conduct"],
    legalBasis: ["15 U.S.C. § 1681s"],
    humanReview: true,
    consumerAuthorisation: true,
  },
  {
    number: 11,
    name: "Pre-litigation notice",
    focus: "The record now shows a pattern. Say so, once, accurately.",
    recipients: ["cra", "furnisher"],
    requires: ["willfulness_record", "consumer_authorised_legal", "human_review_complete"],
    asksFor: ["A final opportunity to correct before the consumer takes advice"],
    /* Willfulness is a FINDING, not a round number. It needs repeated notice
       of the same specific error, responses that did not address it, and a
       person who has read the whole file. The specification forbids alleging
       it without that record, and a wrong allegation is the one thing that
       turns a strong file into a weak one. */
    legalBasis: ["15 U.S.C. § 1681n", "15 U.S.C. § 1681o"],
    humanReview: true,
    consumerAuthorisation: true,
  },
  {
    number: 12,
    name: "Referral to counsel",
    focus: "Hand the file over. This is not a letter.",
    recipients: ["counsel"],
    requires: ["willfulness_record", "consumer_authorised_legal", "human_review_complete"],
    asksFor: ["A complete, dated file: every letter, every response, every unresolved field"],
    legalBasis: ["15 U.S.C. § 1681p"],
    humanReview: true,
    consumerAuthorisation: true,
  },
];

export function getRound(number: number): RoundDefinition | null {
  return ESCALATION_LADDER.find((r) => r.number === number) ?? null;
}

/** What the case record actually establishes. Facts, not intentions. */
export type CaseRecord = Partial<Record<EntryRequirement, boolean>>;

export interface RoundAvailability {
  round: RoundDefinition;
  available: boolean;
  /** Requirements not yet met — what the file still has to earn. */
  missing: EntryRequirement[];
}

/** Every round, and whether the record has earned it. */
export function roundAvailability(record: CaseRecord): RoundAvailability[] {
  return ESCALATION_LADDER.map((round) => {
    const missing = round.requires.filter((r) => !record[r]);
    return { round, available: missing.length === 0, missing };
  });
}

/**
 * The furthest round the record supports.
 *
 * Deliberately NOT "the highest available round": the ladder is not strictly
 * ordered by prerequisite, so round 7 (reinsertion) can be earned while round
 * 5 is not. What matters is the strongest position the file can actually take
 * today, and it may be none — a file with nothing confirmed has not earned
 * round 1 either.
 */
export function availableRound(record: CaseRecord): RoundDefinition | null {
  const earned = roundAvailability(record).filter((r) => r.available);
  return earned.length > 0 ? earned[earned.length - 1].round : null;
}

/**
 * Why a round is not open yet, in words a person can act on. Returned rather
 * than thrown, because "you cannot send this yet, and here is what is missing"
 * is a useful answer and an error is not.
 */
export const REQUIREMENT_LABELS: Record<EntryRequirement, string> = {
  confirmed_finding: "at least one confirmed error in the report",
  prior_cra_result: "a reinvestigation result actually received from the bureau",
  still_reported_after_result: "the item still on the report after that result",
  mov_requested: "a method-of-verification request already sent",
  mov_not_produced: "no description of the procedure received",
  direct_dispute_sent: "a direct dispute already sent to the furnisher",
  furnisher_window_elapsed: "the furnisher's investigation window elapsed",
  two_cra_cycles_same_field: "two reinvestigations leaving the same field wrong",
  our_notice_documented: "our notice of the dispute, with its date",
  no_dispute_notation: "the account still reported without a dispute marker",
  deleted_then_reinserted: "the item deleted and later returned",
  no_reinsertion_notice: "no notice of the reinsertion within five business days",
  compliance_contact_exhausted: "the furnisher's compliance function contacted without resolution",
  consumer_authorised_regulator: "the consumer's authorisation to file with a regulator",
  cfpb_response_inadequate: "a CFPB response that did not resolve it",
  willfulness_record: "repeated notice of the same error with responses that did not address it",
  consumer_authorised_legal: "the consumer's authorisation to take legal steps",
  human_review_complete: "a person has read the whole file and signed it off",
};
