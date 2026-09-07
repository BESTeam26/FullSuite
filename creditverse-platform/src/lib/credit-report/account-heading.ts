/**
 * What an account's heading may say about its number.
 *
 * The heading is the first thing a reviewer reads:
 *
 *     UNITED AUTO CREDIT C • ****0002
 *
 * and it has to be true even when the three bureaus disagree about what the
 * number is. So there is no "master" account number anywhere in BES — the
 * per-bureau observation holds what each bureau showed, and this decides what
 * one line is allowed to claim.
 *
 * NOTHING HERE RECONSTRUCTS A FULL ACCOUNT NUMBER. Not from two partial masks,
 * not from a longer one plus a shorter one. A masked number is masked because
 * the source chose to mask it, and combining fragments to defeat that would be
 * both a fabrication and a disclosure.
 */
import type { Bureau } from "@/lib/credit-classification";

export interface BureauAccountNumber {
  bureau: Bureau;
  /** Exactly as that bureau's column showed it. Absent means absent. */
  masked?: string;
}

export type AccountNumberDisplay =
  | { kind: "shared"; text: string }
  | { kind: "single"; text: string; bureau: Bureau }
  | { kind: "varies"; text: "Account # varies by bureau" }
  | { kind: "absent"; text: "Account # not shown" };

/** The visible digits, which is the only part worth comparing. */
const digitsOf = (masked: string) => masked.replace(/[^0-9]/g, "");

/**
 * The heading's account-number half.
 *
 *   all reporting bureaus share the visible suffix → that masked number
 *   only one bureau exposes one                   → that masked number
 *   suffixes differ                               → "varies by bureau"
 *   none exposes one                              → "not shown"
 *
 * "Share" compares the visible DIGITS, not the mask: `****0002` and `XXXX0002`
 * are the same account number formatted twice, and calling that a difference
 * would put "varies by bureau" on a heading where nothing varies.
 */
export function describeAccountNumber(values: BureauAccountNumber[]): AccountNumberDisplay {
  const exposed = values.filter((v) => v.masked && digitsOf(v.masked));
  if (exposed.length === 0) return { kind: "absent", text: "Account # not shown" };
  if (exposed.length === 1) {
    return { kind: "single", text: exposed[0].masked!, bureau: exposed[0].bureau };
  }
  const distinct = new Set(exposed.map((v) => digitsOf(v.masked!)));
  if (distinct.size > 1) return { kind: "varies", text: "Account # varies by bureau" };
  return { kind: "shared", text: exposed[0].masked! };
}

/** "UNITED AUTO CREDIT C • ****0002" — the whole heading. */
export function accountHeading(name: string, values: BureauAccountNumber[]): string {
  return `${name} • ${describeAccountNumber(values).text}`;
}

/**
 * The signals an account may be matched on across imports and bureaus.
 *
 * Never the account number alone. A masked number is short, often shared
 * across a creditor's portfolio, and legitimately changes on a re-issue or a
 * refinance — so matching on it alone merges accounts that are not the same
 * and splits accounts that are. Four weak signals together beat one strong-
 * looking one.
 */
export interface MatchSignals {
  creditorName: string;
  /** Visible digits only, and only where a bureau showed them. */
  maskedSuffix?: string;
  accountType?: string;
  openDate?: string;
}

export function matchSignals(
  name: string,
  values: { account_number_masked?: string; account_type?: string; open_date?: string }[],
): MatchSignals {
  const suffixes = new Set(
    values.map((v) => digitsOf(v.account_number_masked ?? "")).filter(Boolean),
  );
  return {
    creditorName: name.trim().toLowerCase(),
    /* Only when the bureaus agree. A disputed suffix is not a match signal —
       it is the thing being disputed. */
    maskedSuffix: suffixes.size === 1 ? [...suffixes][0] : undefined,
    accountType: values.find((v) => v.account_type)?.account_type?.trim().toLowerCase(),
    openDate: values.find((v) => v.open_date)?.open_date,
  };
}
