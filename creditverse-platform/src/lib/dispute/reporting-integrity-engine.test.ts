import { describe, expect, it } from "vitest";
import { evaluateChronology, evaluateItem, evaluateReports, toDollars, toYearMonth, type SnapshotItem } from "./reporting-integrity-engine";
import { INTEGRITY_RULES } from "./reporting-integrity-rules";

const item = (over: Partial<SnapshotItem>): SnapshotItem => ({
  id: "i1", accountRef: "chase-1234", name: "CHASE BANK", kind: "Account", status: "Charge-Off", bureaus: ["EQ", "EX", "TU"], ...over,
});

describe("display readers", () => {
  it("reads the date shapes monitoring exports use", () => {
    expect(toYearMonth("01/2023")).toBe("2023-01");
    expect(toYearMonth("1/15/2023")).toBe("2023-01");
    expect(toYearMonth("2023-01-15")).toBe("2023-01");
    expect(toYearMonth("Sep 2024")).toBe("2024-09");
    expect(toYearMonth("n/a")).toBeNull();
  });
  it("reads money and refuses to invent it", () => {
    expect(toDollars("$4,225.10")).toBe(4225.1);
    expect(toDollars("0")).toBe(0);
    expect(toDollars("—")).toBeNull();
    expect(toDollars(undefined)).toBeNull();
  });
});

describe("item rules", () => {
  it("never produces an established violation and never claims raw Metro 2", () => {
    expect(INTEGRITY_RULES.some((r) => (r.classification as string) === "established_violation")).toBe(false);
    const out = evaluateItem(item({ status: "Paid in full", balance: "$500" }));
    expect(out.every((f) => f.rawMetro2Verified === false)).toBe(true);
  });
  it("DOFD before open date on a non-collection account is a potential legal issue for review", () => {
    const out = evaluateItem(item({ status: "Charge-Off", dofd: "03/2021", openDate: "06/2022" }));
    const f = out.find((x) => x.ruleId === "DOFD.BEFORE_OPEN_DATE")!;
    expect(f.classification).toBe("potential_legal_issue");
    expect(f.humanReviewRequired).toBe(true);
    expect(f.remedy).toBe("correct");
    // A collection tradeline may legitimately carry the original delinquency before its own open date.
    expect(evaluateItem(item({ status: "Collection", subtype: "Collection", dofd: "03/2021", openDate: "06/2022" })).some((x) => x.ruleId === "DOFD.BEFORE_OPEN_DATE")).toBe(false);
  });
  it("paid with a balance is a potential inaccuracy; charge-off with a balance is only 'possible'", () => {
    const paid = evaluateItem(item({ status: "Paid in full", balance: "$1,200" })).find((x) => x.ruleId === "STATUS.PAID_WITH_BALANCE")!;
    expect(paid.classification).toBe("potential_anomaly");
    const co = evaluateItem(item({ status: "Charge-Off", balance: "$1,200" })).find((x) => x.ruleId === "STATUS.CHARGEOFF_WITH_BALANCE")!;
    expect(co.classification).toBe("observed_difference");
    expect(co.remedy).toBe("no_action");
  });
  it("current with historical late remarks and fewer than three bureaus are discrepancies, not inaccuracies", () => {
    const out = evaluateItem(item({ status: "Current", balance: "$0", remarks: "30 days late 03/2024", bureaus: ["EQ", "TU"] }));
    expect(out.map((f) => f.ruleId).sort()).toEqual(["BUREAU.MISSING_ON_ONE", "STATUS.CURRENT_WITH_HISTORY"]);
    expect(out.every((f) => f.classification === "observed_difference")).toBe(true);
  });
  it("a delinquency date on a clean, current, zero-balance account needs review before anything else", () => {
    const out = evaluateItem(item({ status: "Current", balance: "$0", dofd: "01/2023" }));
    expect(out.find((f) => f.ruleId === "DOFD.ON_CURRENT_ZERO_BALANCE")?.remedy).toBe("investigate_first");
  });
  it("inquiries and personal information are out of scope for tradeline rules", () => {
    expect(evaluateItem(item({ kind: "Inquiry", status: "Hard" }))).toEqual([]);
  });
});

describe("chronology across imports", () => {
  const snap = (reportId: string, pulledAt: string, items: SnapshotItem[]) => ({ reportId, pulledAt, items });
  it("a DOFD that moves later with no new delinquency is a potential legal issue; earlier snapshots are never overwritten", () => {
    const out = evaluateChronology([
      snap("r1", "2026-03-01", [item({ dofd: "05/2023" })]),
      snap("r2", "2026-04-01", [item({ dofd: "05/2023" })]),
      snap("r3", "2026-05-01", [item({ dofd: "09/2023" })]),
    ]);
    const f = out.find((x) => x.ruleId === "DOFD.MOVED_LATER")!;
    expect(f.classification).toBe("potential_legal_issue");
    expect(f.evidence.dofd_history).toEqual(["2023-05", "2023-05", "2023-09"]);
  });
  it("a moved DOFD with a new delinquency in the remarks is not flagged (cure and re-delinquency is legitimate)", () => {
    const out = evaluateChronology([snap("r1", "2026-03-01", [item({ dofd: "05/2023" })]), snap("r2", "2026-05-01", [item({ dofd: "09/2023", remarks: "30 days late 09/2023" })])]);
    expect(out.some((x) => x.ruleId === "DOFD.MOVED_LATER")).toBe(false);
  });
  it("present → absent → present is a potential reinsertion event, not an illegal reinsertion", () => {
    const out = evaluateChronology([snap("r1", "2026-03-01", [item({})]), snap("r2", "2026-04-01", []), snap("r3", "2026-05-01", [item({})])]);
    const f = out.find((x) => x.ruleId === "ITEM.REAPPEARED")!;
    expect(f.classification).toBe("potential_anomaly");
    expect(f.evidence.presence).toEqual([true, false, true]);
  });
  it("a single import has no chronology", () => {
    expect(evaluateChronology([snap("r1", "2026-03-01", [item({})])])).toEqual([]);
    expect(evaluateReports([])).toEqual([]);
  });
});

describe("evaluateReports report id", () => {
  it("stamps every finding with the latest stored report so it can be persisted against it", () => {
    const acct = { kind: "Account" as const, accountRef: "acct-1", name: "Card", status: "Paid", balance: "$250", bureaus: ["EQ"] } as unknown as SnapshotItem;
    const out = evaluateReports([
      { reportId: "r-old", pulledAt: "2026-01-01T00:00:00Z", items: [acct] },
      { reportId: "r-new", pulledAt: "2026-06-01T00:00:00Z", items: [acct] },
    ]);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((f) => f.reportId === "r-new")).toBe(true);
  });
});
