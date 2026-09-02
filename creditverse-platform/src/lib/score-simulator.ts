// Score Simulator — applies hypothetical actions to a credit profile and
// recomputes the FICO ceiling live. Hardcoded logic (NOT AI). Estimates are
// SMART ANALYSIS, not guarantees.

import type { ClassifiedItem } from "@/lib/credit-classification";
import {
  analyzeScorePotential,
  type ScorePotentialResult,
} from "@/lib/score-potential";

export type SimActionType =
  | "pay-off-revolving"
  | "pay-off-partial"
  | "remove-collection"
  | "remove-all-derogatory"
  | "remove-late"
  | "open-card"
  | "open-installment"
  | "add-authorized-user"
  | "remove-inquiries";

export interface SimAction {
  id: string;
  type: SimActionType;
  label: string;
  detail: string;
  /** for partial paydown, the dollar amount */
  amount?: number;
  enabled: boolean;
}

export interface SimResult {
  analysis: ScorePotentialResult;
  delta: number;
}

let simCounter = 0;
export const makeSimAction = (
  type: SimActionType,
  label: string,
  detail: string,
  amount?: number,
): SimAction => ({
  id: `sim-${simCounter++}`,
  type,
  label,
  detail,
  amount,
  enabled: false,
});

/** Default palette of hypothetical actions offered in the simulator. */
export function defaultSimActions(items: ClassifiedItem[]): SimAction[] {
  const revolving = items.filter(
    (i) =>
      i.kind === "Account" &&
      (i.subtype || "").toLowerCase().includes("revolving") &&
      i.status.toLowerCase().includes("open"),
  );
  const collections = items.filter(
    (i) => i.category === "3rd-Party Collection" || i.category === "Charge-Off",
  );
  const lates = items.filter((i) => i.category === "Late Payment");
  const inquiries = items.filter((i) => i.kind === "Inquiry");
  const derogatory = items.filter((i) => i.isDerogatory);

  const totalRevolvingBalance = revolving.reduce(
    (s, i) => s + Number((i.balance || "$0").replace(/[^0-9.]/g, "")) || 0,
    0,
  );

  const list: SimAction[] = [];

  if (totalRevolvingBalance > 0) {
    list.push(
      makeSimAction(
        "pay-off-revolving",
        "Pay off all revolving balances",
        `Pay down ~$${totalRevolvingBalance.toLocaleString()} to 0% utilization`,
      ),
    );
    list.push(
      makeSimAction(
        "pay-off-partial",
        "Pay down $2,000 of revolving debt",
        "Reduce revolving utilization by $2,000",
        2000,
      ),
    );
  }

  if (collections.length > 0) {
    list.push(
      makeSimAction(
        "remove-collection",
        `Remove 1 collection/charge-off`,
        "Hypothetical: one inaccurate collection is deleted",
      ),
    );
  }

  if (derogatory.length > 1) {
    list.push(
      makeSimAction(
        "remove-all-derogatory",
        `Remove all ${derogatory.length} derogatory marks`,
        "Hypothetical: every inaccurate derogatory item is corrected/removed",
      ),
    );
  }

  if (lates.length > 0) {
    list.push(
      makeSimAction(
        "remove-late",
        "Remove 1 late payment",
        "Hypothetical: one inaccurate late notation is removed",
      ),
    );
  }

  list.push(
    makeSimAction(
      "open-card",
      "Open a new secured card",
      "Adds a revolving account with a $300 limit, $0 balance",
    ),
  );
  list.push(
    makeSimAction(
      "open-installment",
      "Add a credit-builder loan",
      "Adds an installment account to diversify credit mix",
    ),
  );
  list.push(
    makeSimAction(
      "add-authorized-user",
      "Become an authorized user",
      "Imports a 6-year seasoned revolving account with low utilization",
    ),
  );

  if (inquiries.length > 0) {
    list.push(
      makeSimAction(
        "remove-inquiries",
        `Remove ${inquiries.length} hard inquiries`,
        "Hypothetical: all unauthorized inquiries are removed",
      ),
    );
  }

  return list;
}

function cloneItems(items: ClassifiedItem[]): ClassifiedItem[] {
  return items.map((i) => ({ ...i }));
}

/**
 * Apply the enabled hypothetical actions to a copy of the items and recompute
 * the score-potential analysis. Returns the new analysis + delta vs baseline.
 */
export function simulate(
  items: ClassifiedItem[],
  actions: SimAction[],
  baseline: ScorePotentialResult,
): SimResult {
  let sim = cloneItems(items);

  const enabled = actions.filter((a) => a.enabled);

  for (const act of enabled) {
    switch (act.type) {
      case "pay-off-revolving":
        sim = sim.map((i) =>
          i.kind === "Account" &&
          (i.subtype || "").toLowerCase().includes("revolving")
            ? { ...i, balance: "$0" }
            : i,
        );
        break;

      case "pay-off-partial": {
        let remaining = act.amount ?? 2000;
        sim = sim.map((i) => {
          if (remaining <= 0) return i;
          if (
            i.kind === "Account" &&
            (i.subtype || "").toLowerCase().includes("revolving")
          ) {
            const bal =
              Number((i.balance || "$0").replace(/[^0-9.]/g, "")) || 0;
            const pay = Math.min(bal, remaining);
            remaining -= pay;
            return { ...i, balance: `$${bal - pay}` };
          }
          return i;
        });
        break;
      }

      case "remove-collection": {
        const idx = sim.findIndex(
          (i) =>
            i.category === "3rd-Party Collection" ||
            i.category === "Charge-Off",
        );
        if (idx >= 0) sim.splice(idx, 1);
        break;
      }

      case "remove-all-derogatory":
        sim = sim.filter((i) => !i.isDerogatory);
        break;

      case "remove-late": {
        const idx = sim.findIndex((i) => i.category === "Late Payment");
        if (idx >= 0) sim.splice(idx, 1);
        break;
      }

      case "open-card":
        sim.push({
          id: `sim-card-${Date.now()}`,
          name: "Secured Card (Simulated)",
          kind: "Account",
          subtype: "Revolving",
          balance: "$0",
          status: "Open",
          bureaus: ["EQ", "EX", "TU"],
          openDate: "08/2026",
          category: "Open Positive Account",
          isNegative: false,
          isDerogatory: false,
          disposition: "open-positive",
          aiReason: "Simulated new secured revolving account",
          autoSelected: false,
          riskFlags: [],
        });
        break;

      case "open-installment":
        sim.push({
          id: `sim-loan-${Date.now()}`,
          name: "Credit-Builder Loan (Simulated)",
          kind: "Account",
          subtype: "Installment Loan",
          balance: "$1,000",
          status: "Open",
          bureaus: ["EQ", "EX", "TU"],
          openDate: "08/2026",
          category: "Open Positive Account",
          isNegative: false,
          isDerogatory: false,
          disposition: "open-positive",
          aiReason: "Simulated credit-builder installment loan",
          autoSelected: false,
          riskFlags: [],
        });
        break;

      case "add-authorized-user":
        sim.push({
          id: `sim-au-${Date.now()}`,
          name: "Authorized User Account (Simulated)",
          kind: "Account",
          subtype: "Revolving",
          balance: "$50",
          status: "Open",
          bureaus: ["EQ", "EX", "TU"],
          openDate: "08/2020",
          category: "Open Positive Account",
          isNegative: false,
          isDerogatory: false,
          disposition: "open-positive",
          aiReason: "Simulated seasoned authorized user account (6 yrs)",
          autoSelected: false,
          riskFlags: [],
        });
        break;

      case "remove-inquiries":
        sim = sim.filter((i) => i.kind !== "Inquiry");
        break;
    }
  }

  const analysis = analyzeScorePotential(sim);
  const delta = analysis.averageCeiling - baseline.averageCeiling;
  return { analysis, delta };
}
