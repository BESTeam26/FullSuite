/**
 * What SmartCredit's own labels mean — shared by every format it publishes in.
 *
 * The HTML export and the PDF export are the same report rendered twice. They
 * print the same 22 fields with slightly different wording ("Account #" in the
 * HTML, "Account Number" in the PDF; the HTML puts a colon on most labels and
 * the PDF does not), and if each adapter carried its own mapping the two would
 * drift apart one label at a time. So the mapping lives here, once, and both
 * adapters read it. That is what makes "the same report in either format
 * normalises to the same canonical data" a testable claim rather than a hope.
 *
 * Nothing in this file infers. A label not listed is reported as unmapped
 * rather than matched loosely, because a wrong field is worse than a missing
 * one on a document people dispute from.
 */
import type { BureauValueInput } from "@/lib/credit-report/import-parser";
import type { Bureau } from "@/lib/credit-classification";

/** Normalise a source label: case, whitespace, trailing colon. */
export const normaliseLabel = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ").replace(/:$/, "");

/**
 * Source label → canonical field. Both formats' spellings are listed
 * explicitly; there is no fuzzy match and no stemming.
 */
export const SOURCE_FIELD_MAP: Record<string, keyof BureauValueInput> = {
  /* The account number is spelled differently in each format. */
  "account #": "account_number_masked",
  "account number": "account_number_masked",

  "account type": "account_type",
  /* A consumer report prints a translated word ("Individual"), not an ECOA
     code, so the raw wording is kept and named as raw. */
  "account description": "responsibility_raw",
  "account rating": "account_rating",
  "account status": "status",
  "payment status": "payment_status",
  "balance owed": "balance_cents",
  "high balance": "high_balance_cents",
  "credit limit": "credit_limit_cents",
  "past due amount": "past_due_cents",
  "payment amount": "monthly_payment_cents",
  "term length": "term_months",
  "date opened": "open_date",
  "closed date": "date_closed",
  "last payment": "date_last_payment",
  "date of last activity": "date_last_active",
  "date reported": "account_information_date",
  "last verified": "last_verified",
  "payment frequency": "payment_frequency",
  "dispute status": "dispute_status",
  "creditor type": "creditor_type",
  "creditor remarks": "remarks",
};

/**
 * Labels the source prints that are NOT stored as reported values.
 *
 * `utilization` is the important one: the PDF prints it, and it is arithmetic
 * on balance and limit rather than something a bureau reported. Storing it
 * would make a derived number look like a furnished one, and a later balance
 * correction would leave a stale percentage sitting beside it.
 */
export const DERIVED_LABELS = new Set(["utilization"]);

export const MONEY_FIELDS = new Set<keyof BureauValueInput>([
  "balance_cents", "high_balance_cents", "credit_limit_cents",
  "past_due_cents", "monthly_payment_cents",
  "liability_cents", "asset_cents", "exempt_cents",
]);

export const BUREAU_BY_NAME: Record<string, Bureau> = {
  transunion: "TU", experian: "EX", equifax: "EQ",
};

export const MONTH_ABBREVIATIONS = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/* ─────────────────────────────────────────────────────────────────────────
 * The four states a cell can be in, and why they must stay four
 *
 * Dee's requirement, and it is the difference between a dispute worth
 * sending and a false one:
 *
 *   NONE REPORTED   the source looked and says there is nothing
 *   —— / ––         this bureau's column is empty for this field
 *   (empty)         the cell rendered nothing at all
 *   $0 / 0          a reported value that happens to be zero
 *
 * Collapsing the last into the first three would let "balance $0" read as
 * "no balance reported". Collapsing any of the first three into each other
 * would put a blank cell and a bureau's silence under one name.
 * ───────────────────────────────────────────────────────────────────────── */

export type CellState =
  | "value"
  | "explicit_none_reported"
  | "not_reported_by_bureau"
  | "blank";

/** The source's own "nothing here" wording. */
const NONE_REPORTED = /^none\s+reported$/i;
/**
 * Both dash glyphs the exports use. The HTML and the PDF do not agree on
 * which one they print — the real PDF carries 1,476 em-dash pairs and 162
 * en-dash pairs — so both are recognised and neither is treated as text.
 */
const DASHES = /^[—–‒‐-]{1,4}$/;

export function classifyCell(raw: string | null | undefined): CellState {
  const text = (raw ?? "").trim();
  if (!text) return "blank";
  if (NONE_REPORTED.test(text)) return "explicit_none_reported";
  if (DASHES.test(text)) return "not_reported_by_bureau";
  return "value";
}

/* ─────────────────────────────────────────────────────────────────────────
 * The payment-history legend, as the provider declares it
 *
 * Taken from the `payment-history-legend` block the HTML export prints in its
 * own document — the provider's own key, not our interpretation of colours.
 *
 * `6` is deliberately absent. The real export uses `status-6` on 16 cells and
 * does NOT list it in its legend. The obvious reading is 180 days, and that
 * is exactly why it is not written down here: a plausible guess about a
 * delinquency severity is still a guess, and it would be printed to a
 * consumer as fact. An undeclared code stays undeclared.
 * ───────────────────────────────────────────────────────────────────────── */

export interface PaymentStatusMeaning {
  /** The glyph the provider prints in the cell. */
  badge: string;
  /** The provider's own words for it. */
  meaning: string;
}

export const PAYMENT_STATUS_LEGEND: Record<string, PaymentStatusMeaning> = {
  U: { badge: "", meaning: "Unknown" },
  C: { badge: "OK", meaning: "Current" },
  "1": { badge: "30", meaning: "30 Days Late" },
  "2": { badge: "60", meaning: "60 Days Late" },
  "3": { badge: "90", meaning: "90 Days Late" },
  "4": { badge: "120", meaning: "120 Days Late" },
  "5": { badge: "150", meaning: "150+ Days Late" },
  "7": { badge: "PP", meaning: "Payment Plan" },
  "8": { badge: "RF", meaning: "Repossession Foreclosure" },
  "9": { badge: "CO", meaning: "Collection Chargeoff" },
};

/** The badge glyph → code, so a format that prints the glyph can be read. */
export const BADGE_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(PAYMENT_STATUS_LEGEND)
    .filter(([, m]) => m.badge)
    .map(([code, m]) => [m.badge.toLowerCase(), code]),
);

/**
 * Whether the provider's legend declares a code. `status-6` returns false, and
 * a caller must record the raw code with an undetermined meaning rather than
 * translating it.
 */
export function legendDeclares(code: string): boolean {
  return code in PAYMENT_STATUS_LEGEND;
}

/* ─────────────────────────────────────────────────────────────────────────
 * What the PDF export renders visually but does not label
 *
 * The PDF is a browser print of the same page. Printing keeps the field grid
 * intact — every label, every value, every column header — and it keeps the
 * payment-history marks too, but only as GRAPHICS. Checked against a real
 * 36-page export rather than assumed:
 *
 *   the marks     drawn as filled rectangles, recoverable from the page's
 *                 drawing operators, with NO machine-readable status label
 *                 anywhere in the text layer — zero occurrences of OK, PP,
 *                 RF or any delinquency glyph
 *   the legend    the block that declares what a mark means does not print,
 *                 and the colours live in external stylesheets the saved
 *                 page does not inline
 *
 * The month row DOES print, with the provider's own year markers, so the
 * chronology survives intact. What is absent is the mapping from a cell's
 * colour to a payment status, and neither supplied document states it.
 *
 * So the adapter dates every month, keeps the observed fill as provenance —
 * a reviewer can see which cell was unreadable and what it looked like — and
 * leaves the meaning undetermined. Reading a colour as a delinquency
 * severity would mean publishing our own inference to a consumer on the
 * strength of a stylesheet we were never given, and it would break silently
 * the first time the provider restyled.
 * ───────────────────────────────────────────────────────────────────────── */

/** Rendered by the print, but carrying no machine-readable label. */
export const PDF_EXPORT_UNLABELLED = [
  "payment_history_status",
  "payment_history_legend",
] as const;

/** Fields no SmartCredit format exposes, in any export. */
export const SMARTCREDIT_NOT_EXPOSED = [
  "dofd", "score_model", "inquiry_type", "account_type_detail",
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * How a dated payment-history mark is written down
 *
 * `YYYY-MM:status`, one string per month. The date travels WITH the status,
 * so a month is never located by its position in an array — which is the
 * failure the encoding exists to prevent. In the real export TransUnion's
 * history row starts in August and Experian's starts in September; index 0
 * means a different month for each, and reading them positionally puts every
 * mark in the wrong month for one of the two.
 *
 * `?` is the status of a month that was read but whose mark the format did
 * not carry. It is deliberately not `U` — the provider's legend declares `U`
 * as "Unknown", meaning the BUREAU reported nothing that month, which is a
 * statement about the file. `?` is a statement about our reading of it.
 * ───────────────────────────────────────────────────────────────────────── */

export const UNDETERMINED_STATUS = "?";

export const encodeHistoryMark = (year: number, month: number, status: string | null): string =>
  `${year}-${String(month).padStart(2, "0")}:${status ?? UNDETERMINED_STATUS}`;

export interface DatedHistoryMark {
  year: number;
  month: number;
  /** Null where the format did not carry the mark. */
  status: string | null;
}

export function decodeHistoryMark(encoded: string): DatedHistoryMark | null {
  const m = /^(\d{4})-(\d{2}):(.*)$/.exec(encoded.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!(month >= 1 && month <= 12)) return null;
  const status = m[3];
  return { year, month, status: status === UNDETERMINED_STATUS || status === "" ? null : status };
}
