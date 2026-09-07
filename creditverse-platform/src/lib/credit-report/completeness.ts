/**
 * What we know about what we know — and whether the parse can be trusted.
 *
 * ── A DATA-INTEGRITY GUARDRAIL, NOT AN OPERATOR GATE ───────────────────────
 *
 * Dee's doctrine, 2026-09-07, and it decides everything here. If the source
 * says 30 accounts and BES parsed 24:
 *
 *   • the import is PARTIAL and says so, with exactly what failed
 *   • the operator may inspect and work the 24 that parsed
 *   • the 6 that did not parse are NOT deleted, absent, or non-reporting
 *   • completeness-dependent analysis does not run
 *   • a reparse, a correction, or an authorised acceptance are all available
 *
 * A partial snapshot may be perfectly usable. BES simply stays honest that it
 * is partial. Nothing here requires an evidence upload, nothing here stops an
 * operator working, and nothing here belongs to an organization's dispute SOP.
 *
 * ── THE RULE THAT MAKES THE STATES WORTH HAVING ────────────────────────────
 *
 * A STATE IS NEVER UPGRADED BY ABSENCE.
 *
 * `parse_failed`, `blank_in_source` and `not_exposed_by_provider` are three
 * different failures with three different owners — us, the bureau, the
 * provider — and `explicit_not_reported` is a fourth thing again: the source
 * telling us it looked and found nothing. Collapsing any of them into the
 * others is how a parser bug comes to look like a bureau's silence.
 */
import type { Bureau } from "@/lib/credit-classification";

export type CompletenessState =
  | "present"
  | "explicit_not_reported"
  | "blank_in_source"
  | "bureau_not_present"
  | "not_exposed_by_provider"
  | "parse_failed"
  | "ambiguous"
  | "unknown";

export const COMPLETENESS_LABEL: Record<CompletenessState, string> = {
  present: "Reported",
  explicit_not_reported: "Source says none reported",
  blank_in_source: "Blank on the report",
  bureau_not_present: "This bureau does not report it",
  not_exposed_by_provider: "This provider does not expose it",
  parse_failed: "We could not read it",
  ambiguous: "Read, but not attributable",
  unknown: "Not determined",
};

export interface CompletenessFact {
  /** Absent for a fact about the whole report — e.g. a format exposing no DOFD. */
  bureau?: Bureau;
  fieldKey: string;
  state: CompletenessState;
  /** Required for every state but `present`. A state with no reason is a shrug. */
  reason?: string;
}

/** 'accounts' | 'public_records' | 'inquiries' | 'scores' | 'section:<name>' */
export interface ReconciliationCheck {
  bureau?: Bureau;
  checkKey: string;
  /** What the SOURCE stated. Undefined where the source states no count. */
  stated?: number;
  parsed: number;
  ok: boolean;
  reason?: string;
}

export type ImportQuality = "complete" | "partial" | "review_required";

export const QUALITY_LABEL: Record<ImportQuality, string> = {
  complete: "Complete",
  partial: "Partial",
  review_required: "Review required",
};

/**
 * The verdict, from the checks.
 *
 * Mirrors what `create_credit_report` derives in SQL, so the preview can show
 * it before anything is written. **The database's copy is the authoritative
 * one** — this exists so the operator is not surprised, not so the client can
 * decide.
 *
 *   review_required  a check could not be made at all (the source states no
 *                    count to compare), or a required section is missing
 *   partial          a check was made and the counts disagree
 *   complete         every check passed
 *
 * A check with no `stated` count is `review_required` rather than `partial`
 * on purpose: "we could not verify this" is a worse position than "we verified
 * it and we are six short", because the second at least bounds the problem.
 */
export function deriveQuality(checks: ReconciliationCheck[]): ImportQuality | null {
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) return "complete";
  const blocking = failed.filter((c) => c.stated === undefined || c.checkKey.startsWith("section:"));
  return blocking.length > 0 ? "review_required" : "partial";
}

/**
 * May completeness-dependent analysis run?
 *
 * Only on a complete snapshot. An analysis is completeness-dependent when its
 * conclusion changes if a tradeline is missing — an item "no longer observed",
 * a bureau "not reporting", an obsolescence date read off an absence. Six
 * unparsed accounts look exactly like six accounts the consumer does not have,
 * and that is the mistake this function exists to prevent.
 *
 * An authorised acceptance does NOT make this true. Acceptance records that a
 * person chose to work a partial snapshot; it does not make the snapshot
 * complete, and it must not quietly re-enable the analyses that need it to be.
 */
export function analysisMayRun(quality: ImportQuality | null | undefined): boolean {
  return quality === "complete";
}

/** The checks whose conclusions a partial snapshot cannot support. */
export const COMPLETENESS_DEPENDENT_RULES = [
  "BUREAU.MISSING_ON_ONE",
  "ITEM.REAPPEARED",
] as const;

export interface ImportQualityReport {
  quality: ImportQuality | null;
  checks: ReconciliationCheck[];
  /** Only the failures, for the operator to act on. */
  failures: ReconciliationCheck[];
  /** One line an operator can read without opening anything. */
  summary: string;
}

const NOUN: Record<string, string> = {
  accounts: "accounts",
  public_records: "public records",
  inquiries: "inquiries",
  scores: "scores",
};

const describe = (c: ReconciliationCheck): string => {
  const what = c.checkKey.startsWith("section:")
    ? `the ${c.checkKey.slice(8).replace(/_/g, " ")} section`
    : NOUN[c.checkKey] ?? c.checkKey;
  const who = c.bureau ? `${c.bureau} ` : "";
  if (c.stated === undefined) return `${who}${what}: the source states no count, so the parse could not be verified.`;
  const diff = c.stated - c.parsed;
  if (diff > 0) return `${who}${what}: ${c.stated} expected, ${c.parsed} parsed — ${diff} not read.`;
  if (diff < 0) return `${who}${what}: ${c.stated} expected, ${c.parsed} parsed — ${-diff} more than the source states.`;
  return `${who}${what}: counts agree but the check was marked failed.`;
};

export function buildQualityReport(checks: ReconciliationCheck[]): ImportQualityReport {
  const quality = deriveQuality(checks);
  const failures = checks.filter((c) => !c.ok);
  const summary =
    quality === null
      ? "No reconciliation was possible for this source."
      : quality === "complete"
        ? `Every check passed: ${checks.length} compared against the source's own counts.`
        : `${failures.length} of ${checks.length} checks did not reconcile. The snapshot is ${QUALITY_LABEL[quality].toLowerCase()} — the items that did parse are still workable, and nothing missing is treated as deleted or absent.`;
  return { quality, checks, failures, summary };
}

/** Explanations shown beside a state. Never a conclusion about a bureau. */
export function reasonFor(state: CompletenessState, fieldKey: string, provider: string): string {
  switch (state) {
    case "not_exposed_by_provider":
      return `${provider} does not expose ${fieldKey}. This says nothing about whether a bureau reports it.`;
    case "explicit_not_reported":
      return `The source states that ${fieldKey} is not reported.`;
    case "blank_in_source":
      return `${fieldKey} exists in the layout and was empty.`;
    case "bureau_not_present":
      return `This bureau reported nothing for ${fieldKey}.`;
    case "parse_failed":
      return `${fieldKey} was present and could not be read. This is our problem, not the bureau's.`;
    case "ambiguous":
      return `${fieldKey} was read, but the source did not say which bureau the value belongs to.`;
    case "unknown":
      return `No determination was made about ${fieldKey}.`;
    case "present":
      return "";
  }
}
