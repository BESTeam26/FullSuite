/**
 * What each figure SmartCredit prints actually counts.
 *
 * The export states counts in two places with two different scopes, and they
 * are easy to mistake for each other:
 *
 *   summary page   "Inquiries (2 Years)"   per bureau, two-year window
 *   inquiry list   "We found 49 inquiries in the past 3 years"
 *                                          all bureaus, three-year window
 *
 * Reconciling the first against a parse of the second invents a shortfall of
 * whatever the difference happens to be. So every stated figure is read WITH
 * its window, its section and the source's own wording, and a comparison
 * happens only when metric and window match on both sides.
 *
 * Shared by both adapters. A scope rule that lived in one of them would be a
 * scope rule the other could contradict.
 */
import type { Bureau } from "@/lib/credit-classification";
import type { CountWindow, ReconciliationCheck } from "@/lib/credit-report/completeness";
import { WINDOW_LABEL } from "@/lib/credit-report/completeness";
import { normaliseLabel } from "./source-fields";

/** A metric the source counts, and the scope of the figure it prints. */
export interface StatedMetric {
  metric: string;
  /** The summary label, normalised. Absent for a figure read elsewhere. */
  label?: string;
  window: CountWindow;
  section: string;
  /** The source's own wording for what it counted. */
  definition: string;
  /** Whether a parse of the corresponding section can be compared to it. */
  comparableToSection: boolean;
}

/**
 * The summary table's per-bureau figures.
 *
 * `comparableToSection` is the judgement that matters. An account total covers
 * everything the report shows, and the account section lists everything the
 * report shows, so those two are the same population. A two-year inquiry count
 * is not the population the inquiry section lists, so it is marked
 * incomparable and BOTH figures are kept.
 */
export const SUMMARY_METRICS: StatedMetric[] = [
  { metric: "accounts", label: "total accounts", window: "all_shown", section: "Summary",
    definition: "Total Accounts", comparableToSection: true },
  { metric: "open_accounts", label: "open accounts", window: "all_shown", section: "Summary",
    definition: "Open Accounts", comparableToSection: false },
  { metric: "closed_accounts", label: "closed accounts", window: "all_shown", section: "Summary",
    definition: "Closed Accounts", comparableToSection: false },
  { metric: "delinquent", label: "delinquent", window: "all_shown", section: "Summary",
    definition: "Delinquent", comparableToSection: false },
  { metric: "derogatory", label: "derogatory", window: "all_shown", section: "Summary",
    definition: "Derogatory", comparableToSection: false },
  { metric: "balances", label: "balances", window: "all_shown", section: "Summary",
    definition: "Balances", comparableToSection: false },
  { metric: "payments", label: "payments", window: "all_shown", section: "Summary",
    definition: "Payments", comparableToSection: false },
  { metric: "public_records", label: "public records", window: "unstated", section: "Summary",
    definition: "Public Records", comparableToSection: true },
  /* THE ONE THIS MODULE EXISTS FOR. */
  { metric: "inquiries", label: "inquiries (2 years)", window: "2_years", section: "Summary",
    definition: "Inquiries (2 Years)", comparableToSection: false },
];

/** Every summary label the reader should pick up, in both formats' spellings. */
export const SUMMARY_LABELS: string[] = [
  ...SUMMARY_METRICS.flatMap((m) => (m.label ? [m.label] : [])),
  /* The HTML export writes the inquiry label with a lower-case "years" and
     the PDF capitalises it; both normalise to the same string, but the HTML
     also uses this shorter spelling in older exports. */
  "inquiries (2 year)",
  "inquiries",
];

export const metricForLabel = (label: string): StatedMetric | undefined =>
  SUMMARY_METRICS.find((m) => m.label === normaliseLabel(label));

/**
 * The key a check is stored under. The window is part of it wherever the
 * metric exists over more than one, so two scopes cannot collide on
 * `report_reconciliation`'s uniqueness constraint.
 */
export function checkKeyFor(metric: string, window: CountWindow): string {
  return window === "all_shown" || window === "unstated" ? metric : `${metric}@${window}`;
}

/**
 * A section's own stated total, e.g. "We found 49 inquiries in the past 3
 * years" over the inquiry listing.
 *
 * This is the figure that CAN be reconciled against a parse of that section,
 * because it is the section describing itself. The window is read from the
 * sentence rather than assumed — a report that says two years must not be
 * checked as three.
 */
export interface SectionTotal {
  metric: string;
  stated: number;
  window: CountWindow;
  definition: string;
}

const WINDOW_FROM_YEARS: Record<string, CountWindow> = {
  "2": "2_years", "3": "3_years", "7": "7_years", "10": "10_years",
};

/**
 * Read a "We found N <things> in the past M years" sentence.
 *
 * Returns nothing when the sentence is absent or its period is one we do not
 * have a window for — never a default window, because guessing the period is
 * the same mistake as ignoring it.
 */
export function readSectionTotal(text: string): SectionTotal | null {
  const m = /we found\s+(\d+)\s+(inquir\w+|public records?|accounts?)\s+in the past\s+(\d+)\s*years?/i.exec(text);
  if (!m) return null;
  const window = WINDOW_FROM_YEARS[m[3]];
  if (!window) return null;
  const noun = m[2].toLowerCase();
  const metric = noun.startsWith("inquir") ? "inquiries"
    : noun.startsWith("public") ? "public_records"
    : "accounts";
  return { metric, stated: Number(m[1]), window, definition: m[0].trim() };
}

/** A check for a stated figure that cannot be compared to what was parsed. */
export function notComparable(input: {
  bureau?: Bureau;
  metric: StatedMetric;
  stated: number;
  parsed: number;
  parsedWindow: CountWindow;
}): ReconciliationCheck {
  return {
    bureau: input.bureau,
    checkKey: checkKeyFor(input.metric.metric, input.metric.window),
    stated: input.stated,
    parsed: input.parsed,
    ok: false,
    comparable: false,
    window: input.metric.window,
    sourceSection: input.metric.section,
    sourceDefinition: input.metric.definition,
    reason:
      `The report states ${input.stated} for "${input.metric.definition}" — ${WINDOW_LABEL[input.metric.window]} ` +
      `— and what was read covers ${WINDOW_LABEL[input.parsedWindow]}. ` +
      `Both figures are kept and neither was compared to the other: they count different periods.`,
  };
}

/** A check for a like-for-like comparison. */
export function comparable(input: {
  bureau?: Bureau;
  metric: string;
  window: CountWindow;
  section: string;
  definition: string;
  stated: number | undefined;
  parsed: number;
  noun: string;
}): ReconciliationCheck {
  const { stated, parsed } = input;
  return {
    bureau: input.bureau,
    checkKey: checkKeyFor(input.metric, input.window),
    stated,
    parsed,
    ok: stated !== undefined && stated === parsed,
    window: input.window,
    sourceSection: input.section,
    sourceDefinition: input.definition,
    reason:
      stated === undefined
        ? `The report states no ${input.noun} count for this, so the parse could not be verified against it.`
        : stated === parsed
          ? undefined
          : `The report states ${stated} ${input.noun} (${input.definition}, ${WINDOW_LABEL[input.window]}) and ${parsed} were read. ` +
            `The ${Math.abs(stated - parsed)} not read are unread, not absent from the file.`,
  };
}
