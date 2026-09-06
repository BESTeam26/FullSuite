// Build Credit Engine — guided credit-building flows for thin-file profiles.
// Hardcoded logic (NOT AI). Provides secured-card, credit-builder-loan, and
// authorized-user flows with utilization targets and on-time-payment tracking.
// Smart analysis, not a guarantee or recommendation.

import type { ClassifiedItem } from "@/lib/credit-classification";
import { analyzeScorePotential } from "@/lib/score-potential";

export type BuildFlowType =
  "secured-card" | "credit-builder-loan" | "authorized-user";

export interface BuildFlow {
  id: BuildFlowType;
  title: string;
  icon: string;
  summary: string;
  steps: BuildStep[];
  utilizationTarget: number;
  estimatedImpact: number;
  timeframe: string;
  recommended: boolean;
}

export interface BuildStep {
  id: string;
  label: string;
  detail: string;
  done: boolean;
}

export interface OnTimePayment {
  month: string;
  status: "paid" | "pending" | "missed";
}

export interface BuildCreditState {
  flows: BuildFlow[];
  isThinFile: boolean;
  utilizationTarget: number;
  /** Null when no open revolving account states a credit limit. */
  currentUtilization: number | null;
  /**
   * Month-by-month payment history. Empty until an import captures it: the
   * report's payment grid is not among the fields the CSV and PDF parsers
   * read, and inventing six green ticks for every client — which this used to
   * do — is worse than an empty strip that says so.
   */
  onTimePayments: OnTimePayment[];
  /** Null while payment history is not captured. */
  onTimeRate: number | null;
  totalAccounts: number;
  openPositiveCount: number;
}

/**
 * Determine which build flows are recommended based on the profile.
 */
export function buildCreditState(items: ClassifiedItem[]): BuildCreditState {
  const analysis = analyzeScorePotential(items);
  const a = analysis.assessment;

  const isThinFile = a.thinFile;
  const hasRevolving = a.hasRevolving;
  const hasInstallment = a.hasInstallment;

  const flows: BuildFlow[] = [
    {
      id: "secured-card",
      title: "Secured Credit Card",
      icon: "CreditCard",
      summary:
        "Open a secured card reported to all three bureaus. Keep utilization under 9% and pay in full each month to build a positive payment line.",
      utilizationTarget: 9,
      estimatedImpact: isThinFile ? 25 : 15,
      timeframe: "3-6 months",
      recommended: !hasRevolving || isThinFile,
      steps: [
        {
          id: "sc-1",
          label: "Apply for a secured card",
          detail:
            "Choose a card reporting to EQ, EX, and TU. Typical deposit $200-$500.",
          done: false,
        },
        {
          id: "sc-2",
          label: "Keep balance under 9% of limit",
          detail:
            "On a $300 limit, keep the statement balance under $27. Utilization is the fastest-moving FICO factor.",
          done: false,
        },
        {
          id: "sc-3",
          label: "Set autopay for the minimum",
          detail:
            "Never miss a payment — payment history is 35% of the FICO score.",
          done: false,
        },
        {
          id: "sc-4",
          label: "Let the statement post, then pay in full",
          detail:
            "A small reported balance with full payment builds both utilization and payment history.",
          done: false,
        },
      ],
    },
    {
      id: "credit-builder-loan",
      title: "Credit-Builder Loan",
      icon: "Landmark",
      summary:
        "A credit-builder loan holds the loan amount in a locked savings account while you make payments. It diversifies credit mix and adds installment history.",
      utilizationTarget: 0,
      estimatedImpact: isThinFile ? 12 : 8,
      timeframe: "3-6 months",
      recommended: !hasInstallment,
      steps: [
        {
          id: "cb-1",
          label: "Apply for a credit-builder loan",
          detail:
            "Common providers: Self, local credit unions. Loan amounts $300-$1,000.",
          done: false,
        },
        {
          id: "cb-2",
          label: "Set up automatic monthly payments",
          detail:
            "On-time installment payments build the payment-history factor.",
          done: false,
        },
        {
          id: "cb-3",
          label: "Complete the full term",
          detail:
            "At the end you receive the saved funds — a positive installment tradeline remains on file.",
          done: false,
        },
      ],
    },
    {
      id: "authorized-user",
      title: "Authorized User",
      icon: "UserPlus",
      summary:
        "Being added as an authorized user to a long-standing, low-utilization card can import that account's positive history and age onto your file.",
      utilizationTarget: 9,
      estimatedImpact: 10,
      timeframe: "1-2 cycles",
      recommended: isThinFile && a.oldestAccountYears < 2,
      steps: [
        {
          id: "au-1",
          label: "Identify a trusted primary cardholder",
          detail:
            "The account should be 2+ years old with a clean payment history and low utilization.",
          done: false,
        },
        {
          id: "au-2",
          label: "Request to be added as an authorized user",
          detail:
            "Confirm the issuer reports authorized-user accounts to all three bureaus.",
          done: false,
        },
        {
          id: "au-3",
          label: "Verify the account appears on all 3 reports",
          detail:
            "Check the next report pull — the seasoned history should import onto your file.",
          done: false,
        },
      ],
    },
  ];

  /* Payment history: nothing to show until an import captures the report's
     payment grid. This used to return six hard-coded months — five paid, one
     pending — for every client, which is a claim about someone's payment
     record made from no data at all. */
  const onTimePayments: OnTimePayment[] = [];
  const onTimeRate: number | null = null;

  return {
    flows,
    isThinFile,
    utilizationTarget: 9,
    currentUtilization: a.utilizationPct === null ? null : Math.round(a.utilizationPct),
    onTimePayments,
    onTimeRate,
    totalAccounts: a.totalAccounts,
    openPositiveCount: a.openPositiveCount,
  };
}
