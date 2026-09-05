/**
 * Lender Scorecard — descriptive historical outcomes per lender, computed from
 * recorded submissions and lender decisions. Deterministic; no model, no
 * prediction, no recommendation. Every rate carries its sample ("4 of 12") and
 * a sample-size caution, because a lender with two submissions can show 100%
 * by chance. Sorting is a display order, never a ranking label.
 */
export interface OutcomeDeal {
  id: string;
  lenderId: string | null;
  lenderName: string;
  amount: number;
  status: string;                 // funding_deal_status text
  submittedAt: string | null;
  fundedAt: string | null;
  decisions: { decision: string; decidedAt: string }[];
}

export type SampleCaution = "limited" | "small" | null;
export interface LenderScore {
  lenderKey: string;
  lenderName: string;
  submissions: number;
  offers: number;
  funded: number;
  declined: number;
  /** null when there are no submissions — never 0% out of nothing. */
  offerRate: number | null;
  fundingRate: number | null;
  /** Median calendar days from submission to the first recorded decision; null without at least one measurable pair. */
  medianResponseDays: number | null;
  responseSample: number;
  fundedVolume: number;
  caution: SampleCaution;
}

const OFFER_DECISIONS = new Set(["approved", "conditional"]);
const OFFER_STATUSES = new Set(["Offer Received", "Funded"]);
const SUBMITTED_STATUSES_EXCLUDED = new Set(["Draft"]);

export function sampleCaution(submissions: number): SampleCaution {
  if (submissions < 5) return "limited";
  if (submissions < 15) return "small";
  return null;
}

export const CAUTION_LABEL: Record<Exclude<SampleCaution, null>, string> = { limited: "Limited sample", small: "Small sample" };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const dayDiff = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));

/** One row per lender. A deal counts as a submission once it has left Draft. */
export function scoreLenders(deals: OutcomeDeal[]): LenderScore[] {
  const groups = new Map<string, OutcomeDeal[]>();
  for (const d of deals) {
    if (SUBMITTED_STATUSES_EXCLUDED.has(d.status)) continue;
    const key = d.lenderId ?? `name:${d.lenderName.trim().toLowerCase()}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(d);
  }
  const rows: LenderScore[] = [];
  for (const [lenderKey, ds] of groups) {
    const submissions = ds.length;
    const offers = ds.filter((d) => OFFER_STATUSES.has(d.status) || d.decisions.some((x) => OFFER_DECISIONS.has(x.decision))).length;
    const funded = ds.filter((d) => d.status === "Funded").length;
    const declined = ds.filter((d) => d.status === "Declined" || d.decisions.some((x) => x.decision === "declined")).length;
    const responses = ds
      .filter((d) => d.submittedAt && d.decisions.length > 0)
      .map((d) => dayDiff(d.submittedAt!, [...d.decisions].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))[0].decidedAt));
    rows.push({
      lenderKey,
      lenderName: ds[0].lenderName,
      submissions, offers, funded, declined,
      offerRate: submissions ? offers / submissions : null,
      fundingRate: submissions ? funded / submissions : null,
      medianResponseDays: median(responses),
      responseSample: responses.length,
      fundedVolume: ds.filter((d) => d.status === "Funded").reduce((sum, d) => sum + d.amount, 0),
      caution: sampleCaution(submissions),
    });
  }
  return rows;
}

export type ScorecardSort = "funded_volume" | "submissions" | "funding_rate" | "offer_rate" | "response" | "name";
export const SORT_LABEL: Record<ScorecardSort, string> = {
  funded_volume: "Highest funded volume", submissions: "Most submissions", funding_rate: "Funding rate", offer_rate: "Offer rate", response: "Fastest median response", name: "Name",
};

/** A display order. Ties fall back to name so the order is stable and explainable. */
export function sortScores(rows: LenderScore[], by: ScorecardSort): LenderScore[] {
  const num = (v: number | null) => (v === null ? Number.NEGATIVE_INFINITY : v);
  const cmp: Record<ScorecardSort, (a: LenderScore, b: LenderScore) => number> = {
    funded_volume: (a, b) => b.fundedVolume - a.fundedVolume,
    submissions: (a, b) => b.submissions - a.submissions,
    funding_rate: (a, b) => num(b.fundingRate) - num(a.fundingRate),
    offer_rate: (a, b) => num(b.offerRate) - num(a.offerRate),
    response: (a, b) => (a.medianResponseDays ?? Number.POSITIVE_INFINITY) - (b.medianResponseDays ?? Number.POSITIVE_INFINITY),
    name: () => 0,
  };
  return [...rows].sort((a, b) => cmp[by](a, b) || a.lenderName.localeCompare(b.lenderName));
}

export const formatRate = (rate: number | null, numerator: number, denominator: number) =>
  rate === null ? { pct: "—", sample: "no submissions" } : { pct: `${Math.round(rate * 100)}%`, sample: `${numerator}/${denominator}` };
