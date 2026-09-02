// FICO Score Potential Engine
// Hardcoded scoring logic (NOT AI) based on the published FICO scoring factor
// weights. This is a SMART ANALYSIS, not a recommendation or guarantee. Every
// output is explainable and must be human-verified before acting on it.
//
// FICO factor weights (publicly documented):
//   Payment History ........ 35%
//   Amounts Owed (Utilization) 30%
//   Length of Credit History . 15%
//   Credit Mix .............. 10%
//   New Credit / Inquiries ... 10%
//
// Design principle: a discrepancy or negative does NOT auto-equal a violation.
// The engine estimates the realistic ceiling for THIS profile if all
// inaccurate negatives were corrected/removed AND utilization were optimized,
// then flags whether the bigger lever is REPAIR (removing derogatory marks) or
// BUILD (thin file, few accounts, short history).

import type { ClassifiedItem } from "@/lib/credit-classification";

export type Bureau = "EQ" | "EX" | "TU";

export interface FactorScore {
  key: "payment" | "utilization" | "history" | "mix" | "inquiries";
  label: string;
  weight: number; // 0..1
  /** 0 (worst) .. 100 (best) — how well this factor is currently performing */
  current: number;
  /** 0 (worst) .. 100 (best) — realistic ceiling if profile were optimized */
  ceiling: number;
  /** points contributed to current estimate */
  currentPoints: number;
  /** points contributed to ceiling estimate */
  ceilingPoints: number;
  status: "excellent" | "good" | "fair" | "poor";
  note: string;
}

export interface BureauAnalysis {
  bureau: Bureau;
  label: string;
  currentEstimate: number;
  ceilingEstimate: number;
  gap: number;
  factors: FactorScore[];
}

export interface ProfileAssessment {
  primaryLever: "REPAIR" | "BUILD" | "BALANCED";
  leverReason: string;
  thinFile: boolean;
  openPositiveCount: number;
  closedPositiveCount: number;
  derogatoryCount: number;
  totalAccounts: number;
  oldestAccountYears: number;
  avgAccountYears: number;
  utilizationPct: number;
  hasRevolving: boolean;
  hasInstallment: boolean;
  hasMortgage: boolean;
}

export interface ScorePotentialResult {
  bureaus: BureauAnalysis[];
  averageCurrent: number;
  averageCeiling: number;
  averageGap: number;
  assessment: ProfileAssessment;
  disclaimer: string;
}

const BASE_SCORE = 300;
const MAX_SCORE = 850;
const RANGE = MAX_SCORE - BASE_SCORE; // 550

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function statusFromScore(s: number): FactorScore["status"] {
  if (s >= 85) return "excellent";
  if (s >= 70) return "good";
  if (s >= 50) return "fair";
  return "poor";
}

function parseBalance(b?: string): number {
  if (!b) return 0;
  const n = Number(b.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function yearsSince(dateStr?: string): number {
  if (!dateStr) return 0;
  const m = dateStr.match(/(\d{1,2})\/(\d{4})/);
  if (!m) return 0;
  const d = new Date(Number(m[2]), Number(m[1]) - 1);
  const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, diff);
}

/**
 * Payment History factor (35%).
 * Penalized by: late payments, collections, charge-offs, public records,
 * repossessions, foreclosures. Severity scales with recency & count.
 */
function scorePayment(items: ClassifiedItem[]): {
  current: number;
  ceiling: number;
  note: string;
} {
  const negatives = items.filter((i) => i.isDerogatory);
  const lates = items.filter((i) => i.category === "Late Payment");
  const collections = items.filter(
    (i) => i.category === "3rd-Party Collection",
  );
  const chargeoffs = items.filter((i) => i.category === "Charge-Off");
  const publicRec = items.filter((i) => i.category === "Public Record");
  const severe = items.filter(
    (i) => i.category === "Repossession" || i.category === "Foreclosure",
  );

  let penalty = 0;
  penalty += lates.length * 6;
  penalty += collections.length * 10;
  penalty += chargeoffs.length * 12;
  penalty += publicRec.length * 18;
  penalty += severe.length * 20;

  // recency bump — older DOFD hurts less
  negatives.forEach((i) => {
    const yrs = yearsSince(i.dofd);
    if (yrs > 0 && yrs < 2) penalty += 3; // very recent derogatory
  });

  const current = clamp(100 - penalty);
  // Ceiling assumes inaccurate derogatory marks are corrected/removed.
  // Accurate recent lates still weigh, so ceiling is not a perfect 100.
  const remainingAccurate = Math.min(lates.length, 1) * 4; // assume 1 accurate late may remain
  const ceiling = clamp(100 - remainingAccurate);

  let note = "No derogatory marks detected.";
  if (publicRec.length)
    note = `${publicRec.length} public record(s) heavily impacting payment history.`;
  else if (severe.length)
    note = `${severe.length} severe derogatory item(s) (repo/foreclosure).`;
  else if (chargeoffs.length)
    note = `${chargeoffs.length} charge-off(s) on file.`;
  else if (collections.length)
    note = `${collections.length} collection account(s) detected.`;
  else if (lates.length) note = `${lates.length} late payment(s) detected.`;

  return { current, ceiling, note };
}

/**
 * Utilization factor (30%).
 * Based on revolving balances vs limits. We approximate from open revolving
 * accounts; if limits are unknown we infer a conservative estimate.
 */
function scoreUtilization(items: ClassifiedItem[]): {
  current: number;
  ceiling: number;
  utilizationPct: number;
  note: string;
} {
  const revolving = items.filter(
    (i) =>
      i.kind === "Account" &&
      norm(i.subtype || "").includes("revolving") &&
      norm(i.status).includes("open"),
  );

  if (revolving.length === 0) {
    return {
      current: 60,
      ceiling: 95,
      utilizationPct: 0,
      note: "No open revolving accounts — utilization cannot be scored. Building revolving credit is a lever.",
    };
  }

  // Approximate limits: if balance is low relative to typical, assume a limit.
  // In a real system these come from the report's credit limit field.
  let totalBalance = 0;
  let totalLimit = 0;
  revolving.forEach((i) => {
    const bal = parseBalance(i.balance);
    totalBalance += bal;
    // Conservative inferred limit: assume ~$5,000 per open revolving card if
    // not otherwise available (placeholder heuristic for the demo layer).
    totalLimit += 5000;
  });

  const utilizationPct = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

  // FICO utilization bands (ideal < 10%)
  let current: number;
  if (utilizationPct <= 9) current = 95;
  else if (utilizationPct <= 29) current = 80;
  else if (utilizationPct <= 49) current = 62;
  else if (utilizationPct <= 74) current = 45;
  else current = 28;

  // Ceiling = pay down to < 9%
  const ceiling = 95;

  let note = `Utilization ~${Math.round(utilizationPct)}% across ${revolving.length} open revolving account(s).`;
  if (utilizationPct > 30)
    note +=
      " High utilization is a major, fast lever — paying down can lift the score within a billing cycle.";

  return { current, ceiling, utilizationPct, note };
}

/**
 * Length of credit history (15%).
 * Based on oldest account age and average age of accounts.
 */
function scoreHistory(items: ClassifiedItem[]): {
  current: number;
  ceiling: number;
  oldestYears: number;
  avgYears: number;
  note: string;
} {
  const accounts = items.filter((i) => i.kind === "Account");
  const ages = accounts.map((i) => yearsSince(i.openDate)).filter((a) => a > 0);
  const oldestYears = ages.length ? Math.max(...ages) : 0;
  const avgYears = ages.length
    ? ages.reduce((a, b) => a + b, 0) / ages.length
    : 0;

  let current: number;
  if (oldestYears >= 10) current = 90;
  else if (oldestYears >= 7) current = 78;
  else if (oldestYears >= 5) current = 66;
  else if (oldestYears >= 3) current = 52;
  else if (oldestYears >= 2) current = 40;
  else current = 28;

  // Ceiling grows with time but is bounded — history only improves by aging.
  // Ceiling assumes no new accounts added (which would lower avg age).
  const ceiling = clamp(current + 12);

  let note = `Oldest account ${oldestYears.toFixed(1)} yrs, avg ${avgYears.toFixed(1)} yrs.`;
  if (oldestYears < 2)
    note += " Very thin history — building age is a long-term lever.";
  else if (oldestYears < 5)
    note += " Short-to-moderate history; avoid opening many new accounts.";

  return { current, ceiling, oldestYears, avgYears, note };
}

/**
 * Credit mix (10%). Rewards a healthy blend of revolving + installment + mortgage.
 */
function scoreMix(items: ClassifiedItem[]): {
  current: number;
  ceiling: number;
  hasRevolving: boolean;
  hasInstallment: boolean;
  hasMortgage: boolean;
  note: string;
} {
  const sub = (i: ClassifiedItem) => norm(i.subtype || "");
  const hasRevolving = items.some((i) => sub(i).includes("revolving"));
  const hasInstallment = items.some(
    (i) =>
      sub(i).includes("auto") ||
      sub(i).includes("loan") ||
      sub(i).includes("secured"),
  );
  const hasMortgage = items.some((i) => sub(i).includes("mortgage"));

  const mixCount = [hasRevolving, hasInstallment, hasMortgage].filter(
    Boolean,
  ).length;
  let current = 50 + mixCount * 15; // 50, 65, 80, 95
  current = clamp(current);

  // Ceiling: adding a missing responsible credit type can help, but we cap.
  const ceiling = clamp(95);

  const missing: string[] = [];
  if (!hasRevolving) missing.push("revolving");
  if (!hasInstallment) missing.push("installment");
  if (!hasMortgage) missing.push("mortgage");

  let note = `${mixCount}/3 credit types present.`;
  if (missing.length)
    note += ` Missing: ${missing.join(", ")}. Adding responsibly can diversify mix.`;

  return { current, ceiling, hasRevolving, hasInstallment, hasMortgage, note };
}

/**
 * New credit / inquiries (10%). Penalized by recent hard inquiries.
 */
function scoreInquiries(items: ClassifiedItem[]): {
  current: number;
  ceiling: number;
  note: string;
} {
  const inquiries = items.filter((i) => i.kind === "Inquiry");
  const count = inquiries.length;
  let current: number;
  if (count === 0) current = 95;
  else if (count <= 2) current = 82;
  else if (count <= 4) current = 68;
  else if (count <= 6) current = 55;
  else current = 40;

  // Inquiries age off after 24 months and stop affecting score after 12.
  const ceiling = clamp(current + 10);

  let note = `${count} hard inquiry/inquiries on file.`;
  if (count > 4) note += " Multiple recent inquiries can signal risk.";

  return { current, ceiling, note };
}

function norm(s: string) {
  return (s || "").toLowerCase();
}

function buildFactors(items: ClassifiedItem[]): {
  factors: Omit<FactorScore, "currentPoints" | "ceilingPoints">[];
  meta: {
    utilizationPct: number;
    oldestYears: number;
    avgYears: number;
    hasRevolving: boolean;
    hasInstallment: boolean;
    hasMortgage: boolean;
  };
} {
  const payment = scorePayment(items);
  const util = scoreUtilization(items);
  const history = scoreHistory(items);
  const mix = scoreMix(items);
  const inq = scoreInquiries(items);

  const weights = {
    payment: 0.35,
    utilization: 0.3,
    history: 0.15,
    mix: 0.1,
    inquiries: 0.1,
  };

  const factors: Omit<FactorScore, "currentPoints" | "ceilingPoints">[] = [
    {
      key: "payment",
      label: "Payment History",
      weight: weights.payment,
      current: payment.current,
      ceiling: payment.ceiling,
      status: statusFromScore(payment.current),
      note: payment.note,
    },
    {
      key: "utilization",
      label: "Amounts Owed (Utilization)",
      weight: weights.utilization,
      current: util.current,
      ceiling: util.ceiling,
      status: statusFromScore(util.current),
      note: util.note,
    },
    {
      key: "history",
      label: "Length of Credit History",
      weight: weights.history,
      current: history.current,
      ceiling: history.ceiling,
      status: statusFromScore(history.current),
      note: history.note,
    },
    {
      key: "mix",
      label: "Credit Mix",
      weight: weights.mix,
      current: mix.current,
      ceiling: mix.ceiling,
      status: statusFromScore(mix.current),
      note: mix.note,
    },
    {
      key: "inquiries",
      label: "New Credit / Inquiries",
      weight: weights.inquiries,
      current: inq.current,
      ceiling: inq.ceiling,
      status: statusFromScore(inq.current),
      note: inq.note,
    },
  ];

  return {
    factors,
    meta: {
      utilizationPct: util.utilizationPct,
      oldestYears: history.oldestYears,
      avgYears: history.avgYears,
      hasRevolving: mix.hasRevolving,
      hasInstallment: mix.hasInstallment,
      hasMortgage: mix.hasMortgage,
    },
  };
}

function factorToPoints(f: {
  current: number;
  ceiling: number;
  weight: number;
}) {
  // FICO scores range from 300 to 850 (a 550 point range). Each factor contributes
  // its weighted portion of that 550 point range on top of the 300 base score.
  // 550 * weight gives the max points for this factor (e.g. 35% of 550 = 192.5 pts).
  const maxFactorPoints = RANGE * f.weight;
  const currentPoints = Math.round((f.current / 100) * maxFactorPoints);
  const ceilingPoints = Math.round((f.ceiling / 100) * maxFactorPoints);
  return { currentPoints, ceilingPoints };
}

/**
 * Main entry: analyze a classified report and return the FICO score-potential
 * breakdown per bureau plus a repair-vs-build assessment.
 */
export function analyzeScorePotential(
  items: ClassifiedItem[],
): ScorePotentialResult {
  const bureauList: Bureau[] = ["EQ", "EX", "TU"];

  const bureaus: BureauAnalysis[] = bureauList.map((b) => {
    // Filter items present on this bureau; if none, fall back to all (thin file).
    const bureauItems = items.filter((i) => i.bureaus.includes(b));
    const used = bureauItems.length ? bureauItems : items;

    const { factors, meta } = buildFactors(used);

    const withPoints = factors.map((f) => {
      const { currentPoints, ceilingPoints } = factorToPoints(f);
      return { ...f, currentPoints, ceilingPoints };
    });

    const currentEstimate =
      BASE_SCORE + withPoints.reduce((s, f) => s + f.currentPoints, 0);
    const ceilingEstimate =
      BASE_SCORE + withPoints.reduce((s, f) => s + f.ceilingPoints, 0);

    return {
      bureau: b,
      label: b === "EQ" ? "Equifax" : b === "EX" ? "Experian" : "TransUnion",
      currentEstimate,
      ceilingEstimate,
      gap: ceilingEstimate - currentEstimate,
      factors: withPoints,
    };
  });

  const averageCurrent = Math.round(
    bureaus.reduce((s, b) => s + b.currentEstimate, 0) / bureaus.length,
  );
  const averageCeiling = Math.round(
    bureaus.reduce((s, b) => s + b.ceilingEstimate, 0) / bureaus.length,
  );
  const averageGap = averageCeiling - averageCurrent;

  // Profile assessment — repair vs build
  const openPositive = items.filter((i) => i.disposition === "open-positive");
  const closedPositive = items.filter(
    (i) => i.disposition === "closed-positive",
  );
  const derogatory = items.filter((i) => i.isDerogatory);
  const allAccounts = items.filter((i) => i.kind === "Account");
  const ages = allAccounts
    .map((i) => yearsSince(i.openDate))
    .filter((a) => a > 0);
  const oldestAccountYears = ages.length ? Math.max(...ages) : 0;
  const avgAccountYears = ages.length
    ? ages.reduce((a, b) => a + b, 0) / ages.length
    : 0;

  const { meta } = buildFactors(items);
  const thinFile = allAccounts.length <= 2 || oldestAccountYears < 2;

  let primaryLever: ProfileAssessment["primaryLever"] = "BALANCED";
  let leverReason =
    "Profile has a mix of repair opportunities and build potential.";

  const repairSignal = derogatory.length;
  const buildSignal =
    (thinFile ? 3 : 0) +
    (openPositive.length === 0 ? 2 : 0) +
    (meta.utilizationPct === 0 && !meta.hasRevolving ? 2 : 0);

  if (repairSignal > buildSignal + 1) {
    primaryLever = "REPAIR";
    leverReason = `${derogatory.length} derogatory item(s) are the dominant drag. Correcting inaccurate negatives is the highest-leverage move.`;
  } else if (buildSignal > repairSignal + 1) {
    primaryLever = "BUILD";
    leverReason =
      "Thin file or limited positive history. Adding and responsibly managing new credit will move the score more than disputes alone.";
  } else {
    primaryLever = "BALANCED";
    leverReason =
      "Both repair and build actions are needed. Removing inaccurate negatives AND adding positive history/utilization control will compound.";
  }

  const assessment: ProfileAssessment = {
    primaryLever,
    leverReason,
    thinFile,
    openPositiveCount: openPositive.length,
    closedPositiveCount: closedPositive.length,
    derogatoryCount: derogatory.length,
    totalAccounts: allAccounts.length,
    oldestAccountYears,
    avgAccountYears,
    utilizationPct: meta.utilizationPct,
    hasRevolving: meta.hasRevolving,
    hasInstallment: meta.hasInstallment,
    hasMortgage: meta.hasMortgage,
  };

  const disclaimer =
    "Smart analysis based on hardcoded FICO factor weights — not a guarantee, prediction, or recommendation. Estimates require human verification and do not constitute legal or financial advice. Actual FICO scores are calculated by the bureaus and may differ.";

  return {
    bureaus,
    averageCurrent,
    averageCeiling,
    averageGap,
    assessment,
    disclaimer,
  };
}
