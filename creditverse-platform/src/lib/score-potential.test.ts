import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  analyzeScorePotential,
  type ScorePotentialResult,
} from "./score-potential";
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

const revolving = (
  id: string,
  balance: string,
  openDate: string,
  extra: Partial<ClassifiedItem> = {},
) => item({ id, subtype: "Revolving", balance, openDate, ...extra });

const collection = (id: string, extra: Partial<ClassifiedItem> = {}) =>
  item({
    id,
    subtype: "Collection",
    status: "Collection",
    category: "3rd-Party Collection",
    isNegative: true,
    isDerogatory: true,
    disposition: "dispute",
    ...extra,
  });

const factor = (
  r: ScorePotentialResult,
  bureau: "EQ" | "EX" | "TU",
  key: string,
) =>
  r.bureaus
    .find((b) => b.bureau === bureau)!
    .factors.find((f) => f.key === key)!;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 2)); // 2026-09-02, so account ages are stable
});
afterAll(() => vi.useRealTimers());

describe("analyzeScorePotential", () => {
  it("produces three bureau analyses whose weighted factors sum to the estimates", () => {
    const r = analyzeScorePotential([]);
    expect(r.bureaus.map((b) => b.label)).toEqual([
      "Equifax",
      "Experian",
      "TransUnion",
    ]);
    for (const b of r.bureaus) {
      expect(b.factors.map((f) => f.key)).toEqual([
        "payment",
        "utilization",
        "history",
        "mix",
        "inquiries",
      ]);
      expect(b.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1);
      expect(300 + b.factors.reduce((s, f) => s + f.currentPoints, 0)).toBe(
        b.currentEstimate,
      );
      expect(300 + b.factors.reduce((s, f) => s + f.ceilingPoints, 0)).toBe(
        b.ceilingEstimate,
      );
      expect(b.gap).toBe(b.ceilingEstimate - b.currentEstimate);
      expect(b.factors.every((f) => f.ceiling >= f.current)).toBe(true);
    }
    expect(r.averageGap).toBe(r.averageCeiling - r.averageCurrent);
  });

  it("calls an empty profile a thin file with BUILD as the primary lever", () => {
    const r = analyzeScorePotential([]);
    expect(r.assessment.thinFile).toBe(true);
    expect(r.assessment.primaryLever).toBe("BUILD");
    expect(r.assessment.totalAccounts).toBe(0);
    expect(factor(r, "EQ", "utilization").note).toMatch(
      /No open revolving accounts/,
    );
  });

  it("scores a clean, seasoned, diversified profile as BALANCED with strong factors", () => {
    const r = analyzeScorePotential([
      revolving("card", "$500", "01/2010"),
      item({ id: "auto", subtype: "Auto Loan", openDate: "01/2015" }),
      item({ id: "home", subtype: "Mortgage", openDate: "01/2018" }),
    ]);
    const a = r.assessment;
    expect(a.primaryLever).toBe("BALANCED");
    expect(a.thinFile).toBe(false);
    expect(a.derogatoryCount).toBe(0);
    expect(a.hasRevolving && a.hasInstallment && a.hasMortgage).toBe(true);
    expect(a.utilizationPct).toBeCloseTo(10); // $500 of an inferred $5,000 limit
    expect(a.oldestAccountYears).toBeGreaterThan(16);

    expect(factor(r, "EQ", "payment").current).toBe(100);
    expect(factor(r, "EQ", "utilization").current).toBe(80); // 10-29% band
    expect(factor(r, "EQ", "history").current).toBe(90); // >= 10 years
    expect(factor(r, "EQ", "mix").current).toBe(95); // 3/3 types
    expect(factor(r, "EQ", "mix").status).toBe("excellent");
    expect(factor(r, "EQ", "inquiries").current).toBe(95);
  });

  it("makes REPAIR the primary lever when derogatory items dominate", () => {
    const r = analyzeScorePotential([
      revolving("c1", "$0", "01/2010"),
      revolving("c2", "$0", "01/2012"),
      revolving("c3", "$0", "01/2014"),
      collection("k1"),
      collection("k2"),
      collection("k3"),
      collection("k4"),
      collection("co", { category: "Charge-Off", status: "Charge-Off" }),
    ]);
    expect(r.assessment.primaryLever).toBe("REPAIR");
    expect(r.assessment.derogatoryCount).toBe(5);
    const pay = factor(r, "EQ", "payment");
    expect(pay.current).toBe(48); // 100 - 4*10 - 12
    expect(pay.status).toBe("poor");
    expect(pay.ceiling).toBe(100); // no lates, so all derogatories are assumed removable
    expect(pay.note).toBe("1 charge-off(s) on file.");
    expect(r.averageGap).toBeGreaterThan(0);
  });

  it("scores each bureau on the items it actually reports", () => {
    const r = analyzeScorePotential([
      revolving("card", "$0", "01/2010"),
      collection("eq-only", { bureaus: ["EQ"] }),
    ]);
    expect(factor(r, "EQ", "payment").current).toBe(90);
    expect(factor(r, "EX", "payment").current).toBe(100);
    expect(factor(r, "TU", "payment").current).toBe(100);
    expect(r.bureaus[0].currentEstimate).toBeLessThan(
      r.bureaus[1].currentEstimate,
    );
  });

  it("penalizes high utilization and flags it as a fast lever", () => {
    const r = analyzeScorePotential([revolving("card", "$4,000", "01/2015")]);
    const util = factor(r, "EQ", "utilization");
    expect(r.assessment.utilizationPct).toBeCloseTo(80);
    expect(util.current).toBe(28);
    expect(util.ceiling).toBe(95);
    expect(util.status).toBe("poor");
    expect(util.note).toMatch(/High utilization is a major, fast lever/);
  });

  it("assumes one accurate late payment may remain in the ceiling", () => {
    const r = analyzeScorePotential([
      item({
        id: "late",
        subtype: "Revolving",
        status: "Late 30",
        category: "Late Payment",
        isNegative: true,
        isDerogatory: true,
        disposition: "dispute",
      }),
    ]);
    const pay = factor(r, "EQ", "payment");
    expect(pay.current).toBe(94);
    expect(pay.ceiling).toBe(96);
  });

  it("adds a recency penalty for derogatories with a DOFD under two years old", () => {
    const recent = analyzeScorePotential([
      collection("k", { dofd: "06/2026" }),
    ]);
    const old = analyzeScorePotential([collection("k", { dofd: "01/2020" })]);
    expect(factor(recent, "EQ", "payment").current).toBe(87); // 100 - 10 - 3
    expect(factor(old, "EQ", "payment").current).toBe(90);
  });
});
