// Next Best Action Engine — turns the repair-vs-build lever into a prioritized
// checklist with estimated point impact. Hardcoded logic (NOT AI). Estimates
// are derived from the FICO factor gaps computed by the score-potential engine.
// Every estimate is a SMART ANALYSIS, not a guarantee or recommendation.

import type { ClassifiedItem } from "@/lib/credit-classification";
import {
  analyzeScorePotential,
  type ScorePotentialResult,
} from "@/lib/score-potential";

export type ActionCategory = "REPAIR" | "BUILD" | "MAINTAIN";

export interface NextBestAction {
  id: string;
  category: ActionCategory;
  title: string;
  detail: string;
  /** estimated point impact on the 3-bureau average ceiling */
  impact: number;
  /** how fast this action can reflect in the score */
  timeframe: "Immediate" | "1-2 cycles" | "3-6 months" | "Long-term";
  priority: 1 | 2 | 3 | 4 | 5;
  done: boolean;
  factor: string;
}

function parseBalance(b?: string): number {
  if (!b) return 0;
  const n = Number(b.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

/**
 * Build a prioritized action checklist from the score-potential analysis.
 * Actions are ranked by estimated impact (highest first).
 */
export function buildNextBestActions(items: ClassifiedItem[]): {
  actions: NextBestAction[];
  analysis: ScorePotentialResult;
} {
  const analysis = analyzeScorePotential(items);
  const a = analysis.assessment;
  const actions: NextBestAction[] = [];

  // --- REPAIR actions (from factor gaps) ---

  // 1. Derogatory marks
  if (a.derogatoryCount > 0) {
    const paymentFactor = analysis.bureaus[0].factors.find(
      (f) => f.key === "payment",
    );
    const gap = paymentFactor
      ? Math.round((paymentFactor.ceiling - paymentFactor.current) * 0.35 * 5.5)
      : 0;
    actions.push({
      id: "dispute-derogatory",
      category: "REPAIR",
      title: `Dispute inaccurate derogatory marks (${a.derogatoryCount} on file)`,
      detail:
        "Identify and dispute only items with a factual, evidence-backed basis. Removing inaccurate negatives is the single largest repair lever.",
      impact: Math.max(15, gap),
      timeframe: "1-2 cycles",
      priority: 1,
      done: false,
      factor: "Payment History (35%)",
    });
  }

  // 2. Utilization paydown
  if (a.utilizationPct > 9) {
    const utilFactor = analysis.bureaus[0].factors.find(
      (f) => f.key === "utilization",
    );
    const gap = utilFactor
      ? Math.round((utilFactor.ceiling - utilFactor.current) * 0.3 * 5.5)
      : 0;
    const target =
      a.utilizationPct > 49 ? "below 30%, then under 9%" : "under 9%";
    actions.push({
      id: "pay-down-revolving",
      category: a.utilizationPct > 49 ? "REPAIR" : "BUILD",
      title: `Pay down revolving balances to ${target}`,
      detail: `Current utilization ~${Math.round(a.utilizationPct)}%. Utilization is the fastest-moving FICO factor — paying down can reflect within a single billing cycle.`,
      impact: Math.max(10, gap),
      timeframe: "Immediate",
      priority: 2,
      done: false,
      factor: "Amounts Owed (30%)",
    });
  }

  // 3. Inquiries
  const inquiries = items.filter((i) => i.kind === "Inquiry");
  if (inquiries.length > 4) {
    actions.push({
      id: "pause-inquiries",
      category: "MAINTAIN",
      title: "Pause new credit applications for 12 months",
      detail: `${inquiries.length} hard inquiries on file. Inquiries age off score impact after 12 months and disappear after 24.`,
      impact: 6,
      timeframe: "3-6 months",
      priority: 5,
      done: false,
      factor: "New Credit (10%)",
    });
  }

  // --- BUILD actions (thin file) ---

  // 4. Secured card
  if (!a.hasRevolving || a.openPositiveCount === 0) {
    actions.push({
      id: "open-secured-card",
      category: "BUILD",
      title: "Open one secured credit card",
      detail:
        "Thin file with no open revolving accounts. A secured card reported to all three bureaus establishes a positive payment line. Keep utilization under 9%.",
      impact: a.thinFile ? 25 : 15,
      timeframe: "3-6 months",
      priority: a.thinFile ? 1 : 3,
      done: false,
      factor: "Credit Mix + Payment History",
    });
  }

  // 5. Credit-builder loan
  if (!a.hasInstallment) {
    actions.push({
      id: "credit-builder-loan",
      category: "BUILD",
      title: "Add a credit-builder loan",
      detail:
        "No installment accounts on file. A credit-builder loan diversifies credit mix and adds a positive installment payment history.",
      impact: a.thinFile ? 12 : 8,
      timeframe: "3-6 months",
      priority: a.thinFile ? 2 : 4,
      done: false,
      factor: "Credit Mix (10%)",
    });
  }

  // 6. Authorized user
  if (a.thinFile && a.oldestAccountYears < 2) {
    actions.push({
      id: "authorized-user",
      category: "BUILD",
      title: "Become an authorized user on a seasoned account",
      detail:
        "Being added as an authorized user to a long-standing, low-utilization card can import that account's positive history and age onto your file.",
      impact: 10,
      timeframe: "1-2 cycles",
      priority: 3,
      done: false,
      factor: "Length of History (15%)",
    });
  }

  // 7. Keep oldest open
  if (a.oldestAccountYears >= 2 && a.oldestAccountYears < 7) {
    actions.push({
      id: "keep-oldest-open",
      category: "MAINTAIN",
      title: "Keep oldest accounts open to age history",
      detail: `Oldest account is ${a.oldestAccountYears.toFixed(1)} years. Closing seasoned accounts shortens average age and lowers this factor.`,
      impact: 5,
      timeframe: "Long-term",
      priority: 5,
      done: false,
      factor: "Length of History (15%)",
    });
  }

  // Sort by priority then impact
  actions.sort((x, y) => x.priority - y.priority || y.impact - x.impact);

  return { actions, analysis };
}

export { parseBalance };
