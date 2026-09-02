import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { simulate, defaultSimActions, makeSimAction, type SimAction, type SimResult } from "./score-simulator";
import { analyzeScorePotential } from "./score-potential";
import type { ClassifiedItem } from "./credit-classification";

const item = (o: Partial<ClassifiedItem> & { id: string }): ClassifiedItem => ({
  name: o.id,
  kind: "Account",
  status: "Open",
  bureaus: ["EQ", "EX", "TU"],
  category: "Open Positive Account",
  isNegative: false,
  isDerogatory: false,
  disposition: "open-positive",
  aiReason: "",
  autoSelected: false,
  riskFlags: [],
  ...o,
});

const derog = (id: string, extra: Partial<ClassifiedItem> = {}) =>
  item({ id, isNegative: true, isDerogatory: true, disposition: "dispute", ...extra });

const profile = (): ClassifiedItem[] => [
  item({ id: "revA", subtype: "Revolving", balance: "$1,500", openDate: "01/2015" }),
  item({ id: "revB", subtype: "Revolving", balance: "$1,000", openDate: "01/2018" }),
  derog("col1", { subtype: "Collection", status: "Collection", category: "3rd-Party Collection" }),
  derog("col2", { subtype: "Collection", status: "Collection", category: "3rd-Party Collection" }),
  derog("late", { subtype: "Revolving", status: "Late 30", category: "Late Payment" }),
  derog("inq1", { kind: "Inquiry", status: "Inquiry", category: "Inquiry" }),
  derog("inq2", { kind: "Inquiry", status: "Inquiry", category: "Inquiry" }),
];

const enable = (actions: SimAction[], ...types: SimAction["type"][]) =>
  actions.map((a) => ({ ...a, enabled: types.includes(a.type) }));

const factor = (r: SimResult, key: string) => r.analysis.bureaus[0].factors.find((f) => f.key === key)!;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 2));
});
afterAll(() => vi.useRealTimers());

describe("makeSimAction", () => {
  it("creates a disabled action with a unique id and passes through the amount", () => {
    const a = makeSimAction("pay-off-partial", "Pay", "detail", 2000);
    const b = makeSimAction("open-card", "Open", "detail");
    expect(a.enabled).toBe(false);
    expect(a.amount).toBe(2000);
    expect(b.amount).toBeUndefined();
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ type: "pay-off-partial", label: "Pay", detail: "detail" });
  });
});

describe("defaultSimActions", () => {
  it("offers only the three build actions for an empty profile", () => {
    expect(defaultSimActions([]).map((a) => a.type)).toEqual([
      "open-card",
      "open-installment",
      "add-authorized-user",
    ]);
  });

  it("adds conditional actions in a fixed order, all disabled by default", () => {
    const actions = defaultSimActions(profile());
    expect(actions.map((a) => a.type)).toEqual([
      "pay-off-revolving",
      "pay-off-partial",
      "remove-collection",
      "remove-all-derogatory",
      "remove-late",
      "open-card",
      "open-installment",
      "add-authorized-user",
      "remove-inquiries",
    ]);
    expect(actions.every((a) => !a.enabled)).toBe(true);
    expect(actions[0].detail).toContain("$2,500");
    expect(actions[1].amount).toBe(2000);
    expect(actions[3].label).toBe("Remove all 5 derogatory marks");
    expect(actions[8].label).toBe("Remove 2 hard inquiries");
  });

  it("omits 'remove all derogatory' when there is only one derogatory item", () => {
    const one = [derog("col1", { status: "Collection", category: "3rd-Party Collection" })];
    const types = defaultSimActions(one).map((a) => a.type);
    expect(types).toContain("remove-collection");
    expect(types).not.toContain("remove-all-derogatory");
  });
});

describe("simulate", () => {
  const items = profile();
  const baseline = analyzeScorePotential(items);
  const actions = defaultSimActions(items);

  it("is a no-op when nothing is enabled and never mutates the input items", () => {
    const r = simulate(items, actions, baseline);
    expect(r.delta).toBe(0);
    expect(r.analysis.averageCeiling).toBe(baseline.averageCeiling);

    simulate(items, enable(actions, "pay-off-revolving", "remove-all-derogatory"), baseline);
    expect(items[0].balance).toBe("$1,500");
    expect(items).toHaveLength(7);
  });

  it("pays off all revolving balances", () => {
    const r = simulate(items, enable(actions, "pay-off-revolving"), baseline);
    expect(factor(r, "utilization").note).toMatch(/^Utilization ~0% across 2/);
    expect(factor(r, "utilization").current).toBe(95);
  });

  it("applies a partial paydown across revolving accounts in order", () => {
    // $2,000 clears revA ($1,500) and leaves revB at $500 -> 5% of $10,000
    const r = simulate(items, enable(actions, "pay-off-partial"), baseline);
    expect(factor(r, "utilization").note).toMatch(/^Utilization ~5% across 2/);
  });

  it("removes exactly one collection, or every derogatory item", () => {
    const one = simulate(items, enable(actions, "remove-collection"), baseline);
    expect(one.analysis.assessment.derogatoryCount).toBe(4);
    const all = simulate(items, enable(actions, "remove-all-derogatory"), baseline);
    expect(all.analysis.assessment.derogatoryCount).toBe(0);
  });

  it("removes inquiries and lifts the ceiling", () => {
    const r = simulate(items, enable(actions, "remove-inquiries"), baseline);
    expect(factor(r, "inquiries").note).toBe("0 hard inquiry/inquiries on file.");
    expect(r.delta).toBeGreaterThan(0);
  });

  it("removing a late payment raises the payment-history ceiling", () => {
    const r = simulate(items, enable(actions, "remove-late"), baseline);
    expect(factor(r, "payment").ceiling).toBe(100);
    expect(r.delta).toBeGreaterThan(0);
  });

  it("adds a seasoned authorized-user account that lengthens history", () => {
    const empty: ClassifiedItem[] = [];
    const base = analyzeScorePotential(empty);
    const r = simulate(empty, enable(defaultSimActions(empty), "add-authorized-user"), base);
    expect(r.analysis.assessment.totalAccounts).toBe(1);
    expect(factor(r, "history").current).toBe(66); // opened 08/2020 -> ~6 years
    expect(r.delta).toBeGreaterThan(0);
  });

  it("ignores disabled actions", () => {
    const r = simulate(items, actions.map((a) => ({ ...a, enabled: false })), baseline);
    expect(factor(r, "utilization").note).toMatch(/^Utilization ~25% across 2/);
  });
});
