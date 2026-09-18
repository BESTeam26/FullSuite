/**
 * What a division is CALLED.
 *
 * There are two "division" vocabularies in this product and they are not the
 * same list:
 *
 *   `departments.division`  creditops · fundingops · bes_crm · talentops ·
 *                           sales_marketing        — the ORG STRUCTURE
 *   timer divisions         creditops · fundingops · bes-crm · talentops ·
 *                           admin · meeting        — what you BOOK TIME to
 *
 * Note `bes_crm` against `bes-crm`. Reusing `DIVISION_LABELS` for an org
 * division therefore falls through to the raw key for exactly the two that
 * differ, which is how "bes_crm" and "sales_marketing" ended up as headings on
 * the Team Management tree. One map per vocabulary, named for the vocabulary.
 */
const ORG_DIVISION_LABELS: Record<string, string> = {
  creditops: "CreditOps",
  fundingops: "FundingOps",
  bes_crm: "BES CRM",
  talentops: "TalentOps",
  sales_marketing: "Sales & Marketing",
};

/**
 * Falls back to a readable version of the key rather than the key itself, so a
 * division added in the database reads as words on the day it appears instead
 * of waiting for a deploy.
 */
export function orgDivisionLabel(division: string | null | undefined): string | null {
  if (!division) return null;
  return ORG_DIVISION_LABELS[division]
    ?? division.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
