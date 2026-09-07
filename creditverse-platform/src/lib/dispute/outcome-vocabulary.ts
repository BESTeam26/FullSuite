/**
 * What happened to a disputed item, said no more strongly than the source
 * supports.
 *
 * The vocabulary this replaces had three words — Deleted, Updated, Verified —
 * and each of them claimed more than the platform could show:
 *
 *   "Deleted"  was written whenever an account appeared in one import and not
 *              the next. An import that failed to read an account produced it.
 *              So did a furnisher renaming itself.
 *   "Updated"  was written for any field movement, which reads to a client as
 *              "the dispute worked" whether or not the field moved toward what
 *              was asked for.
 *   "Verified" was written for no change, which reads as "a bureau checked and
 *              the reporting is accurate". It means neither.
 *
 * The distinction the whole module exists to hold:
 *
 *   BUREAU_CONFIRMED_DELETION   the result document says the item was removed
 *   NO_LONGER_OBSERVED          it is absent from a complete comparable report
 *
 * The first is somebody else's statement. The second is our own reading of two
 * files. They are never added together, and a reimport comparison can never
 * produce the first — which is why every outcome carries its source.
 *
 * Domain layer: pure, no data access, no React. `credit-report/chronology`
 * establishes what was observed; this module names what that means. It does
 * not re-compare snapshots (there is one comparison engine, and it is CR-3's).
 */

export type DisputeOutcome =
  | "bureau_confirmed_deletion"
  | "no_longer_observed"
  | "corrected"
  | "updated"
  | "unchanged"
  | "newly_reported"
  | "reappeared"
  | "unable_to_compare"
  | "ambiguous_match"
  | "result_not_available"
  | "legacy_reported_deleted"
  | "legacy_reported_updated"
  | "legacy_reported_verified";

export type OutcomeSource =
  | "cra_result_notice"
  | "reimport_comparison"
  | "operator_review"
  | "consumer_provided_result"
  | "other"
  | "legacy_manual_entry";

export interface OutcomeMeaning {
  outcome: DisputeOutcome;
  /** Internal label. Precise, for staff. */
  label: string;
  /**
   * What a client is told. Names the bureau and the report, and attributes an
   * observation to us rather than an action to them.
   */
  clientText: string;
  /** What the outcome does NOT establish. Shown beside it, never omitted. */
  doesNotEstablish: string | null;
  /** Sources that can legitimately produce this outcome. */
  allowedSources: OutcomeSource[];
  /** Groups a metric may sum. Outcomes in different groups never merge. */
  metricGroup:
    | "confirmed_removal"
    | "observed_absence"
    | "established_correction"
    | "change"
    | "no_change"
    | "new"
    | "return"
    | "not_comparable"
    | "legacy";
  legacy: boolean;
}

const REVIEWED: OutcomeSource[] = ["cra_result_notice", "operator_review", "consumer_provided_result"];
const ANY_LIVE: OutcomeSource[] = [...REVIEWED, "reimport_comparison", "other"];

export const OUTCOMES: Record<DisputeOutcome, OutcomeMeaning> = {
  bureau_confirmed_deletion: {
    outcome: "bureau_confirmed_deletion",
    label: "Deleted — confirmed by the bureau",
    clientText: "{bureau} confirmed this item was removed from your file.",
    doesNotEstablish: null,
    /* Never `reimport_comparison`: an absence is an absence. */
    allowedSources: REVIEWED,
    metricGroup: "confirmed_removal",
    legacy: false,
  },
  no_longer_observed: {
    outcome: "no_longer_observed",
    label: "No longer observed",
    clientText: "No longer observed on {bureau} in this report.",
    doesNotEstablish:
      "This is what the newest report shows. It is not a confirmation from {bureau} that the item was deleted.",
    allowedSources: ANY_LIVE,
    metricGroup: "observed_absence",
    legacy: false,
  },
  corrected: {
    outcome: "corrected",
    label: "Corrected",
    clientText: "{bureau} now reports {field} as {current}, which is what the dispute asked for.",
    doesNotEstablish: null,
    /* A diff cannot establish intent. Somebody reviews it. */
    allowedSources: REVIEWED,
    metricGroup: "established_correction",
    legacy: false,
  },
  updated: {
    outcome: "updated",
    label: "Changed",
    clientText: "{bureau} changed {field} from {previous} to {current}.",
    doesNotEstablish:
      "A change is not by itself a correction. We have not established that this is the change the dispute asked for.",
    allowedSources: ANY_LIVE,
    metricGroup: "change",
    legacy: false,
  },
  unchanged: {
    outcome: "unchanged",
    label: "No change observed",
    clientText: "No change observed on {bureau} for this item.",
    doesNotEstablish:
      "This does not mean the item was verified as accurate, that a reasonable investigation took place, or that the reporting complies with any requirement.",
    allowedSources: ANY_LIVE,
    metricGroup: "no_change",
    legacy: false,
  },
  newly_reported: {
    outcome: "newly_reported",
    label: "Newly reported",
    clientText: "This item appears on {bureau} in this report and was not in the previous one.",
    doesNotEstablish: null,
    allowedSources: ANY_LIVE,
    metricGroup: "new",
    legacy: false,
  },
  reappeared: {
    outcome: "reappeared",
    label: "Observed again",
    clientText: "This item is observed again on {bureau} after not appearing in the previous report.",
    /* Reinsertion has a legal meaning and conditions. Neither is established
       by an item coming back, so the neutral fact is all that is said. */
    doesNotEstablish:
      "Reappearing is not by itself improper. Whether it needs action is a review question, not a finding.",
    allowedSources: ANY_LIVE,
    metricGroup: "return",
    legacy: false,
  },
  unable_to_compare: {
    outcome: "unable_to_compare",
    label: "Unable to compare",
    clientText: "We could not compare this item between reports.",
    doesNotEstablish:
      "Nothing follows from this about the item. The reports could not be compared — usually a partial import or different bureau coverage.",
    allowedSources: ANY_LIVE,
    metricGroup: "not_comparable",
    legacy: false,
  },
  ambiguous_match: {
    outcome: "ambiguous_match",
    label: "Needs review — which account is this?",
    clientText: "This item needs review before we can say what happened to it.",
    doesNotEstablish:
      "The newer report holds an account that may or may not be the same one. Until someone decides, no outcome is claimed.",
    allowedSources: ANY_LIVE,
    metricGroup: "not_comparable",
    legacy: false,
  },
  result_not_available: {
    outcome: "result_not_available",
    label: "No result yet",
    clientText: "No result has been received for this item yet.",
    doesNotEstablish: null,
    allowedSources: ANY_LIVE,
    metricGroup: "not_comparable",
    legacy: false,
  },
  /* ── Legacy. Recorded before provenance existed; never upgraded. ─────── */
  legacy_reported_deleted: {
    outcome: "legacy_reported_deleted",
    label: "Reported deleted (legacy record)",
    clientText: "Recorded as deleted in an earlier record.",
    doesNotEstablish:
      "This was recorded by hand before we kept the source of a result. We cannot say which bureau confirmed it, or whether it was confirmed at all.",
    allowedSources: ["legacy_manual_entry"],
    metricGroup: "legacy",
    legacy: true,
  },
  legacy_reported_updated: {
    outcome: "legacy_reported_updated",
    label: "Reported updated (legacy record)",
    clientText: "Recorded as updated in an earlier record.",
    doesNotEstablish: "Recorded by hand before we kept the source of a result.",
    allowedSources: ["legacy_manual_entry"],
    metricGroup: "legacy",
    legacy: true,
  },
  legacy_reported_verified: {
    outcome: "legacy_reported_verified",
    label: "Reported verified (legacy record)",
    clientText: "Recorded as returned unchanged in an earlier record.",
    doesNotEstablish:
      "\"Verified\" here means the item came back unchanged. It is not a finding that the reporting is accurate.",
    allowedSources: ["legacy_manual_entry"],
    metricGroup: "legacy",
    legacy: true,
  },
};

/**
 * Legacy coarse counts, read as what they are. Deliberately a READ-time map:
 * the stored rows are never rewritten into stronger conclusions, because the
 * provenance that would justify one was never captured. Manufacturing it would
 * be worse than leaving the record coarse.
 */
export const LEGACY_OUTCOME_MAP = {
  deleted: "legacy_reported_deleted",
  updated: "legacy_reported_updated",
  verified: "legacy_reported_verified",
} as const satisfies Record<string, DisputeOutcome>;

export function isLegacyOutcome(outcome: DisputeOutcome): boolean {
  return OUTCOMES[outcome].legacy;
}

/** Whether a source may produce an outcome. The database enforces the two that matter. */
export function sourceAllows(outcome: DisputeOutcome, source: OutcomeSource): boolean {
  return OUTCOMES[outcome].allowedSources.includes(source);
}

export const SOURCE_LABELS: Record<OutcomeSource, string> = {
  cra_result_notice: "Bureau result notice",
  reimport_comparison: "Comparison of imported reports",
  operator_review: "Reviewed by staff",
  consumer_provided_result: "Provided by the client",
  other: "Other",
  legacy_manual_entry: "Recorded by hand (legacy)",
};

/**
 * The client-facing sentence, with the placeholders filled. A field or value
 * we do not have is left out rather than filled with a guess, so the sentence
 * degrades to a shorter true one instead of a longer invented one.
 */
export function describeOutcome(
  outcome: DisputeOutcome,
  facts: { bureau?: string; field?: string; previous?: string | null; current?: string | null } = {},
): string {
  const meaning = OUTCOMES[outcome];
  const bureau = facts.bureau ? BUREAU_NAMES[facts.bureau] ?? facts.bureau : "this bureau";
  let text = meaning.clientText.replace(/\{bureau\}/g, bureau);
  if (text.includes("{field}") || text.includes("{previous}") || text.includes("{current}")) {
    const haveAll = facts.field && facts.current;
    if (!haveAll) {
      /* Fall back to the shortest true statement rather than printing an
         empty placeholder or inventing a field name. */
      return outcome === "corrected"
        ? `${bureau} made the change the dispute asked for.`
        : `${bureau} changed this item.`;
    }
    text = text
      .replace(/\{field\}/g, facts.field!)
      .replace(/\{previous\}/g, facts.previous ?? "a previous value")
      .replace(/\{current\}/g, facts.current!);
  }
  return text;
}

export const BUREAU_NAMES: Record<string, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };

/**
 * Counts for a metric, grouped so nothing sums across a meaning boundary.
 * A caller wanting "deletions" must choose which of the two it means.
 */
export function tallyOutcomes(outcomes: DisputeOutcome[]): Record<OutcomeMeaning["metricGroup"], number> {
  const zero = {
    confirmed_removal: 0, observed_absence: 0, established_correction: 0, change: 0,
    no_change: 0, new: 0, return: 0, not_comparable: 0, legacy: 0,
  };
  for (const o of outcomes) zero[OUTCOMES[o].metricGroup] += 1;
  return zero;
}

/**
 * The outcome a snapshot comparison alone supports, given CR-3's observation
 * and CR-14's completeness. Deliberately conservative and deliberately narrow:
 * it can never return `bureau_confirmed_deletion` or `corrected`, because
 * neither is a thing two files can show.
 */
export function outcomeFromComparison(input: {
  observedInLater: boolean;
  laterReportComplete: boolean;
  bureauCoveredByBoth: boolean;
  nearMatchInLater: boolean;
  observedInEarlier: boolean;
  fieldChanged: boolean;
  absentFromEarlierButPresentBefore?: boolean;
}): DisputeOutcome {
  if (!input.laterReportComplete || !input.bureauCoveredByBoth) return "unable_to_compare";
  if (!input.observedInEarlier && input.observedInLater) {
    return input.absentFromEarlierButPresentBefore ? "reappeared" : "newly_reported";
  }
  if (!input.observedInLater) {
    if (input.nearMatchInLater) return "ambiguous_match";
    return "no_longer_observed";
  }
  return input.fieldChanged ? "updated" : "unchanged";
}
