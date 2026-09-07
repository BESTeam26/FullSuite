import { describe, expect, it } from "vitest";
import { RULES_IN_USE, RULES_NOT_YET_EVALUABLE, evaluateChronology, evaluateItem, evaluateReports, toDollars, toYearMonth, type SnapshotItem } from "./reporting-integrity-engine";
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

/**
 * The catalogue must not advertise coverage the engine does not have.
 *
 * `BUREAU.VALUE_DIFFERS` sat here for two days with its authorities, its route
 * and its remedy filled in, and no code path could ever reach it — the stored
 * report holds one value per field, so there was nothing per-bureau to
 * compare. It read as coverage. This suite makes that impossible to repeat:
 * a rule is either reachable, or it says why it is not.
 */
describe("every catalogued rule is either reachable or declared unreachable", () => {
  /* Inputs chosen so that between them they trigger every rule the engine
     runs. If a rule is added and nothing here reaches it, the test fails and
     the author has to either exercise it or mark it blocked. */
  const reachable = new Set(
    [
      ...evaluateItem(item({ status: "Paid in full", balance: "$500" })),
      ...evaluateItem(item({ status: "Charge-Off", balance: "$1,200", dofd: "03/2021", openDate: "06/2022" })),
      ...evaluateItem(item({ status: "Current", balance: "$0", dofd: "01/2023" })),
      ...evaluateItem(item({ status: "Current", balance: "$0", remarks: "30 days late 03/2024" })),
      ...evaluateItem(item({ status: "Open", bureaus: ["EQ"] })),
      /* CR-2: reachable from attributed per-bureau values, and only from those. */
      ...evaluateItem(item({
        bureaus: ["EQ", "TU"],
        records: [
          { bureau: "EQ", balance: 1400 },
          { bureau: "TU", balance: 0 },
        ],
      })),
      ...evaluateChronology([
        { reportId: "r1", pulledAt: "2025-01-01", items: [item({ dofd: "01/2020" })] },
        { reportId: "r2", pulledAt: "2025-06-01", items: [] },
        { reportId: "r3", pulledAt: "2026-01-01", items: [item({ dofd: "01/2023" })] },
      ]),
    ].map((f) => f.ruleId),
  );

  it("reaches every rule that RULES_IN_USE claims is applied", () => {
    const claimed = RULES_IN_USE.map((s) => s.split("@")[0]);
    const unreached = claimed.filter((id) => !reachable.has(id));
    expect(unreached).toEqual([]);
  });

  it("excludes blocked rules from what it claims to apply", () => {
    const claimed = RULES_IN_USE.map((s) => s.split("@")[0]);
    for (const r of RULES_NOT_YET_EVALUABLE) expect(claimed).not.toContain(r.id);
  });

  it("makes every blocked rule say why, in words a reader can act on", () => {
    for (const r of RULES_NOT_YET_EVALUABLE) {
      expect(r.blockedBy.length).toBeGreaterThan(20);
    }
  });

  it("accounts for every rule in the catalogue exactly once", () => {
    const claimed = RULES_IN_USE.map((s) => s.split("@")[0]);
    const blocked = RULES_NOT_YET_EVALUABLE.map((r) => r.id);
    expect([...claimed, ...blocked].sort()).toEqual(INTEGRITY_RULES.map((r) => r.id).sort());
  });

  /* CR-2 unblocked BUREAU.VALUE_DIFFERS. Nothing else was unblocked with it,
     and nothing should be: a rule leaves this list only when a migration
     genuinely gives it data. */
  it("has no rules left blocked, and any future one must say why", () => {
    for (const r of RULES_NOT_YET_EVALUABLE) expect(r.blockedBy.length).toBeGreaterThan(20);
    expect(RULES_NOT_YET_EVALUABLE.map((r) => r.id)).not.toContain("BUREAU.VALUE_DIFFERS");
  });
});

/**
 * CR-2. The rule this migration existed for, and the fences around it.
 * A difference between bureaus is a question about which figure is current.
 * It is not proof that any of them is wrong, and it is never derived from a
 * list of bureau names.
 */
describe("cross-bureau differences, from attributed values only", () => {
  const twoBureaus = (over: Partial<SnapshotItem> = {}) =>
    item({ bureaus: ["EQ", "TU"], status: "Open", ...over });

  it("never fabricates a finding from one value and a list of bureau names", () => {
    const out = evaluateItem(item({ status: "Charge-Off", balance: "$900", bureaus: ["EQ", "EX", "TU"] }));
    expect(out.some((f) => f.ruleId === "BUREAU.VALUE_DIFFERS")).toBe(false);
  });

  it("fires when two bureaus report different balances", () => {
    const out = evaluateItem(twoBureaus({
      records: [{ bureau: "EQ", balance: 1400 }, { bureau: "TU", balance: 0 }],
    }));
    const f = out.find((x) => x.ruleId === "BUREAU.VALUE_DIFFERS")!;
    expect(f).toBeDefined();
    expect(f.observation).toMatch(/EQ: 1400\.00/);
    expect(f.observation).toMatch(/TU: 0\.00/);
    expect(f.evidence).toMatchObject({ field: "balance" });
  });

  it("stays at observation level — never a violation, never unverifiable, never a dispute route", () => {
    const f = evaluateItem(twoBureaus({
      records: [{ bureau: "EQ", balance: 1400 }, { bureau: "TU", balance: 0 }],
    })).find((x) => x.ruleId === "BUREAU.VALUE_DIFFERS")!;
    expect(f.classification).toBe("observed_difference");
    expect(f.route).toBe("none");
    expect(f.remedy).toBe("investigate_first");
    expect(f.observation).toMatch(/not proof that any of them is wrong/i);
    expect(f.observation).not.toMatch(/unverifiab/i);
    expect(f.observation).not.toMatch(/violation/i);
  });

  it("says nothing when the bureaus agree", () => {
    const out = evaluateItem(twoBureaus({
      records: [{ bureau: "EQ", balance: 500 }, { bureau: "TU", balance: 500 }],
    }));
    expect(out.some((x) => x.ruleId === "BUREAU.VALUE_DIFFERS")).toBe(false);
  });

  /* One value plus a silence is one bureau reporting, not a disagreement. */
  it("says nothing when only one bureau reported the field", () => {
    const out = evaluateItem(twoBureaus({
      records: [{ bureau: "EQ", balance: 500 }, { bureau: "TU" }],
    }));
    expect(out.some((x) => x.ruleId === "BUREAU.VALUE_DIFFERS")).toBe(false);
  });

  it("says nothing from a single attributed record", () => {
    const out = evaluateItem(twoBureaus({ records: [{ bureau: "EQ", balance: 500 }] }));
    expect(out.some((x) => x.ruleId === "BUREAU.VALUE_DIFFERS")).toBe(false);
  });

  it("compares only the four fields the rule declares", () => {
    const out = evaluateItem(twoBureaus({
      records: [
        { bureau: "EQ", remarks: "Account closed by consumer", pastDue: 40 },
        { bureau: "TU", remarks: "Disputed by consumer", pastDue: 90 },
      ],
    }));
    expect(out.some((x) => x.ruleId === "BUREAU.VALUE_DIFFERS")).toBe(false);
  });

  it("raises one finding per differing field", () => {
    const out = evaluateItem(twoBureaus({
      records: [
        { bureau: "EQ", balance: 1400, dofd: "03/2021", openDate: "01/2018" },
        { bureau: "TU", balance: 0, dofd: "09/2021", openDate: "01/2018" },
      ],
    })).filter((x) => x.ruleId === "BUREAU.VALUE_DIFFERS");
    expect(out).toHaveLength(2);
    expect(out.map((f) => (f.evidence as { field: string }).field).sort()).toEqual(["balance", "dofd"]);
  });

  it("never claims a raw Metro 2 value from a consumer-report observation", () => {
    const out = evaluateItem(twoBureaus({
      records: [{ bureau: "EQ", status: "Open" }, { bureau: "TU", status: "Closed" }],
    }));
    expect(out.every((f) => f.rawMetro2Verified === false)).toBe(true);
  });
});
