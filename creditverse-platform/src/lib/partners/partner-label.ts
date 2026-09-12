/**
 * How a Partner is written, everywhere a Partner is written.
 *
 * Dee, 2026-09-13:
 *
 *   "When we present partner on all modules or projects let's have it like
 *    this — Prime Capital Group · Parker Cathcart … some agents know Jesse but
 *    some agents know the company name. This way we're building a memory about
 *    the partner and the businesses we're supporting."
 *
 * Which is a real operational problem, not a cosmetic one: two agents can be
 * looking at the same account and not know it, because one of them only ever
 * hears the person's name and the other only ever sees the company's. One
 * person can also be behind several businesses — Jesse Roldan is both BizHub
 * Financial and It'sNetworkTime — so the company has to lead and the person
 * has to follow, never the other way round.
 *
 * ── THE RULES ───────────────────────────────────────────────────────────────
 *
 * The BUSINESS always leads. It is the canonical Partner and the sort key
 * (A→Z, locked 2026-09-11), so putting the person first would reorder every
 * list in the platform and file two of Jesse's companies apart.
 *
 * The person is added only when they add something. "Jensen · Jensen" tells
 * nobody anything, and a partner with no contact recorded yet must read as the
 * company rather than as the company followed by an empty separator.
 *
 * Nothing here decides WHO the contact is — that is the primary
 * `partner_contacts` row, and the legacy `outsourcing_groups.partner_name` is
 * the fallback for partners imported before contacts existed.
 */

/** The separator Dee used. A middle dot, not a hyphen — a hyphen reads as part of a company name. */
export const PARTNER_SEP = "·";

const clean = (value: string | null | undefined): string => (value ?? "").trim().replace(/\s+/g, " ");

/** Case- and punctuation-insensitive, so "K&A Consulting" and "K & A consulting" are one name. */
const sameName = (a: string, b: string): boolean =>
  a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface PartnerNames {
  /** The canonical Partner — the business. */
  business: string | null | undefined;
  /** The primary contact, when there is one. */
  contact?: string | null;
}

/**
 * `Business · Person`, or just the business when the person adds nothing.
 *
 * Returns the business alone when there is no contact, when the contact is the
 * same name as the business, or when the contact is blank.
 */
export function partnerLabel({ business, contact }: PartnerNames): string {
  const company = clean(business);
  const person = clean(contact);
  if (!company) return person;
  if (!person || sameName(company, person)) return company;
  return `${company} ${PARTNER_SEP} ${person}`;
}

/**
 * The two halves, for surfaces that want to style them differently — a pane
 * that dims the person, a table that puts them in their own column.
 *
 * `person` is null under exactly the conditions `partnerLabel` drops it, so
 * the two can never disagree about whether there is a person to show.
 */
export function partnerNameParts({ business, contact }: PartnerNames): {
  company: string;
  person: string | null;
} {
  const company = clean(business);
  const person = clean(contact);
  return {
    company: company || person,
    person: company && person && !sameName(company, person) ? person : null,
  };
}
