/**
 * Account Status codes and the balances they require.
 *
 * From Appendix 1 of the BES Metro 2 defect catalogue. This is the sharpest
 * hardcodable material in everything uploaded, because the relationships are
 * arithmetic rather than argument: status 13 means paid or closed with a zero
 * balance, so a status 13 reporting $1,400 is not a matter of opinion.
 *
 * Why this belongs in code and the wording does not: the catalogue's own
 * closing rule is "select only the defects that are actually visible or
 * documented". A rule engine can tell whether a field is populated and whether
 * two numbers agree. It cannot tell whether a sentence sounds right. So the
 * checks live here and the letter language stays editable.
 *
 * ── The line this file will not cross ───────────────────────────────────────
 *
 * Section Q of the catalogue lists what looks like a defect and is not, and
 * every rule below is written to stay on the right side of it. In particular:
 * a consumer report usually shows a translated LABEL ("Paid, was charge-off"),
 * not the raw code. Inferring code 64 from that label and then asserting a
 * code-level violation is exactly the false positive the specification warns
 * about, so an inferred code produces an APPARENT finding and a displayed one
 * can produce a confirmed one.
 */

export interface StatusCode {
  code: string;
  meaning: string;
  /** Current Balance must be zero for this status to be coherent. */
  requiresZeroBalance: boolean;
  /** Amount Past Due must be zero. */
  requiresZeroPastDue: boolean;
  /** A Payment Rating must accompany the status. */
  requiresPaymentRating: boolean;
  /** Days past due this status asserts, when it asserts a range. */
  daysPastDue?: [number, number];
  note?: string;
}

export const ACCOUNT_STATUS_CODES: StatusCode[] = [
  { code: "05", meaning: "Account transferred", requiresZeroBalance: true, requiresZeroPastDue: true, requiresPaymentRating: false,
    note: "Becoming obsolete from April 2022; a transferred balance and past due were required to be zero under the old code." },
  { code: "11", meaning: "Current, 0-29 days past due", requiresZeroBalance: false, requiresZeroPastDue: true, requiresPaymentRating: false,
    note: "A closed revolving or line account carrying a balance should also show the applicable closure code." },
  { code: "13", meaning: "Paid or closed, zero balance", requiresZeroBalance: true, requiresZeroPastDue: true, requiresPaymentRating: true },
  { code: "61", meaning: "Paid, was voluntary surrender", requiresZeroBalance: true, requiresZeroPastDue: true, requiresPaymentRating: true },
  { code: "62", meaning: "Paid, was collection", requiresZeroBalance: true, requiresZeroPastDue: true, requiresPaymentRating: true },
  { code: "63", meaning: "Paid, was repossession", requiresZeroBalance: true, requiresZeroPastDue: true, requiresPaymentRating: true },
  { code: "64", meaning: "Paid, was charge-off", requiresZeroBalance: true, requiresZeroPastDue: true, requiresPaymentRating: true,
    note: "The Original Charge-off Amount legitimately remains populated." },
  { code: "65", meaning: "Paid, foreclosure was started", requiresZeroBalance: true, requiresZeroPastDue: true, requiresPaymentRating: true },
  { code: "71", meaning: "30-59 days past due", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false, daysPastDue: [30, 59] },
  { code: "78", meaning: "60-89 days past due", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false, daysPastDue: [60, 89] },
  { code: "80", meaning: "90-119 days past due", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false, daysPastDue: [90, 119] },
  { code: "82", meaning: "120-149 days past due", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false, daysPastDue: [120, 149] },
  { code: "83", meaning: "150-179 days past due", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false, daysPastDue: [150, 179] },
  { code: "84", meaning: "180 or more days past due", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false, daysPastDue: [180, 9999] },
  { code: "88", meaning: "Government claim filed", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: true },
  { code: "89", meaning: "Deed in lieu", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: true,
    note: "Should not later be followed by status 97." },
  { code: "93", meaning: "Collection", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false,
    note: "A collection may legitimately carry a balance and an amount past due." },
  { code: "94", meaning: "Foreclosure completed", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: true,
    note: "Should not later be followed by status 97." },
  { code: "95", meaning: "Voluntary surrender", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: true,
    note: "Not for an ordinary lease termination." },
  { code: "96", meaning: "Repossession", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false,
    note: "Deficiency treatment must match what the collateral sale produced." },
  { code: "97", meaning: "Charge-off", requiresZeroBalance: false, requiresZeroPastDue: false, requiresPaymentRating: false,
    note: "Scheduled Payment should be zero; balance, past due, Original Charge-off Amount, DOFD and last payment must align." },
];

const BY_CODE = new Map(ACCOUNT_STATUS_CODES.map((s) => [s.code, s]));
export const statusByCode = (code: string): StatusCode | undefined => BY_CODE.get(code.trim());

/**
 * A report usually prints a label, not a code. This maps the labels that map
 * cleanly and REFUSES the ones that do not, because a wrong inference here
 * produces a confident letter about a code the bureau never sent.
 */
const LABEL_TO_CODE: [RegExp, string][] = [
  [/^paid[,/ ]+(was )?charge[- ]?off/i, "64"],
  [/^paid[,/ ]+(was )?collection/i, "62"],
  [/^paid[,/ ]+(was )?repossession/i, "63"],
  [/^paid[,/ ]+(was )?voluntary surrender/i, "61"],
  [/^(paid|closed)\b.*zero balance/i, "13"],
  [/^charge[- ]?off$/i, "97"],
  [/^collection$/i, "93"],
  [/^repossession$/i, "96"],
  [/^voluntary surrender$/i, "95"],
  [/^foreclosure completed/i, "94"],
  [/^deed in lieu/i, "89"],
  [/^current\b/i, "11"],
  [/^(account )?transferred/i, "05"],
];

export interface CodeResolution {
  code: string | null;
  /** True when the report printed a code; false when we inferred it. */
  displayed: boolean;
}

/** Resolve a status to a code, saying honestly whether it was inferred. */
export function resolveStatusCode(displayedCode: string | undefined, label: string | undefined): CodeResolution {
  if (displayedCode && BY_CODE.has(displayedCode.trim())) {
    return { code: displayedCode.trim(), displayed: true };
  }
  const text = (label ?? "").trim();
  for (const [pattern, code] of LABEL_TO_CODE) {
    if (pattern.test(text)) return { code, displayed: false };
  }
  return { code: null, displayed: false };
}

export interface StatusCheckInput {
  displayedCode?: string;
  statusLabel?: string;
  balance?: number;
  pastDue?: number;
  paymentRating?: string;
  /** Days past due the report states, when it states any. */
  reportedDaysPastDue?: number;
}

export interface StatusDefect {
  rule: string;
  observation: string;
  /** Inferred codes can never produce a confirmed defect. */
  confirmed: boolean;
}

/**
 * The arithmetic checks. Each one names the rule it comes from so a reviewer
 * can look it up, and none of them fires on a code we merely guessed.
 */
export function checkStatusConsistency(input: StatusCheckInput): StatusDefect[] {
  const { code, displayed } = resolveStatusCode(input.displayedCode, input.statusLabel);
  if (!code) return [];
  const spec = statusByCode(code);
  if (!spec) return [];

  const out: StatusDefect[] = [];
  const bal = input.balance;
  const due = input.pastDue;
  const say = (rule: string, observation: string) => out.push({ rule, observation, confirmed: displayed });

  if (spec.requiresZeroBalance && bal !== undefined && bal > 0) {
    say(`Status ${code}`, `Status ${code} means "${spec.meaning}", which requires a zero balance. The report shows ${bal}.`);
  }
  if (spec.requiresZeroPastDue && due !== undefined && due > 0) {
    say(`Status ${code}`, `Status ${code} means "${spec.meaning}", which requires no amount past due. The report shows ${due}.`);
  }
  if (spec.requiresPaymentRating && !(input.paymentRating ?? "").trim()) {
    say(`Status ${code}`, `Status ${code} requires a Payment Rating, and none is reported.`);
  }
  /* The severity of the status has to match the days actually past due. */
  if (spec.daysPastDue && input.reportedDaysPastDue !== undefined) {
    const [lo, hi] = spec.daysPastDue;
    if (input.reportedDaysPastDue < lo || input.reportedDaysPastDue > hi) {
      say(`Status ${code}`,
        `Status ${code} asserts ${lo}-${hi === 9999 ? "180+" : hi} days past due, and the report states ${input.reportedDaysPastDue}.`);
    }
  }
  return out;
}
