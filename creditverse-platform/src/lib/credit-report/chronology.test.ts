/**
 * CR-3. A chronology states facts. The tests are mostly about the facts it
 * must REFUSE to state: that an account was deleted, that a value was
 * corrected, that two accounts are one, or that a date exists because a
 * neighbouring date does.
 */
import { describe, expect, it } from "vitest";
import type { Bureau, BureauValues } from "@/lib/credit-classification";
import {
  accountRefsIn,
  buildAccountChronology,
  comparableFor,
  groupByPeriod,
  type ChronologySnapshot,
} from "./chronology";

const REF = "northwind bank 4417";

const snap = (
  pulledAt: string,
  values: Partial<BureauValues>[] | null,
  over: Partial<ChronologySnapshot> = {},
): ChronologySnapshot => ({
  reportId: `r-${pulledAt}`,
  pulledAt,
  bureaus: ["EQ", "EX", "TU"],
  quality: "complete",
  observations: values ? { [REF]: values.map((v) => ({ bureau: "EX", ...v }) as BureauValues) } : {},
  items: values ? { [REF]: { name: "NORTHWIND BANK" } } : {},
  ...over,
});

const kinds = (s: ChronologySnapshot[]) => buildAccountChronology(s, REF).events.map((e) => e.kind);
const find = (s: ChronologySnapshot[], kind: string) =>
  buildAccountChronology(s, REF).events.filter((e) => e.kind === kind);

describe("field changes are facts, and nothing more", () => {
  it("states a balance change without judging it", () => {
    const events = find([
      snap("2026-06-01", [{ bureau: "EX", balance: 3031 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 2800 }]),
    ], "FIELD_CHANGED");
    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe("Experian balance changed $3,031 → $2,800.");
    expect(events[0].previous).toBe("$3,031");
    expect(events[0].next).toBe("$2,800");
  });

  /* The words this module must never produce. */
  it("never calls a change corrected, inaccurate, re-aged or a violation", () => {
    const all = buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX", balance: 3031, status: "Collection", dofd: "01/2021" }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 2800, status: "Closed", dofd: "06/2021" }]),
    ], REF).events;
    const text = all.map((e) => e.detail).join(" ").toLowerCase();
    for (const word of ["corrected", "inaccurate", "violation", "re-aged", "reaged", "unverifiab", "illegal", "deleted"]) {
      expect(text).not.toContain(word);
    }
  });

  it("states a payment-status change per bureau", () => {
    const events = find([
      snap("2026-05-01", [{ bureau: "TU", paymentStatus: "Collection" }]),
      snap("2026-06-01", [{ bureau: "TU", paymentStatus: "Closed" }]),
    ], "FIELD_CHANGED");
    expect(events[0].detail).toBe("TransUnion payment status changed Collection → Closed.");
  });

  it("says nothing when a value is unchanged", () => {
    expect(find([
      snap("2026-06-01", [{ bureau: "EX", balance: 3031 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 3031 }]),
    ], "FIELD_CHANGED")).toEqual([]);
  });
});

describe("a missing field never becomes zero, and never becomes a change", () => {
  it("raises no event when the earlier value was absent", () => {
    expect(find([
      snap("2026-06-01", [{ bureau: "EX" }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 2800 }]),
    ], "FIELD_CHANGED")).toEqual([]);
  });

  it("raises no event when the later value became absent", () => {
    expect(find([
      snap("2026-06-01", [{ bureau: "EX", balance: 3031 }]),
      snap("2026-07-01", [{ bureau: "EX" }]),
    ], "FIELD_CHANGED")).toEqual([]);
  });

  /* A balance nobody reported is not a balance of nothing. */
  it("never renders an absent balance as $0", () => {
    const all = buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX" }]),
      snap("2026-07-01", [{ bureau: "EX", pastDue: 0 }]),
    ], REF).events;
    expect(all.map((e) => e.detail).join(" ")).not.toContain("$0 →");
  });

  it("does treat an explicitly reported zero as a value", () => {
    const events = find([
      snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 0 }]),
    ], "FIELD_CHANGED");
    expect(events[0].next).toBe("$0");
  });
});

describe("DOFD stays unavailable where the source does not expose it", () => {
  /* SmartCredit exposes none. The chronology must be silent, not inventive. */
  it("raises no DOFD event when no snapshot reports one", () => {
    const all = buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX", accountInformationDate: "05/2026", dateLastActive: "04/2026", dateLastPayment: "03/2026" }]),
      snap("2026-07-01", [{ bureau: "EX", accountInformationDate: "06/2026", dateLastActive: "04/2026", dateLastPayment: "03/2026" }]),
    ], REF).events;
    expect(all.some((e) => e.field === "dofd")).toBe(false);
  });

  /* The specific inference this refuses: DOFD is not Date Reported, Last
     Activity or Last Payment wearing another label. */
  it("never derives a DOFD from a neighbouring date", () => {
    const all = buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX", accountInformationDate: "05/2026" }]),
      snap("2026-07-01", [{ bureau: "EX", accountInformationDate: "06/2026" }]),
    ], REF).events;
    const reported = all.find((e) => e.field === "accountInformationDate")!;
    expect(reported.fieldLabel).toBe("last reported");
    expect(all.map((e) => e.detail).join(" ")).not.toMatch(/delinquency/i);
  });

  it("does compare a DOFD where the source actually exposes one", () => {
    const events = find([
      snap("2026-06-01", [{ bureau: "EX", dofd: "01/2021" }]),
      snap("2026-07-01", [{ bureau: "EX", dofd: "06/2021" }]),
    ], "FIELD_CHANGED");
    expect(events[0].fieldLabel).toBe("date of first delinquency");
    /* Stated as a change. Whether it is re-ageing is another engine's
       question, with evidence and a person. */
    expect(events[0].detail).not.toMatch(/re-?ag/i);
  });
});

describe("a partial snapshot proves no disappearance", () => {
  const gone = (quality: ChronologySnapshot["quality"]) => [
    snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
    snap("2026-07-01", null, { quality }),
  ];

  it("says the comparison is unavailable, not that the account went", () => {
    for (const quality of ["partial", "review_required", null] as const) {
      const events = buildAccountChronology(gone(quality), REF).events;
      expect(events.map((e) => e.kind)).toContain("COMPARISON_UNAVAILABLE");
      expect(events.map((e) => e.kind)).not.toContain("NO_LONGER_OBSERVED");
      expect(events.find((e) => e.kind === "COMPARISON_UNAVAILABLE")!.reason).toBe("COVERAGE_INCOMPLETE");
    }
  });

  it("explains that an unread account is not a removed one", () => {
    const e = buildAccountChronology(gone("partial"), REF).events.find((x) => x.kind === "COMPARISON_UNAVAILABLE")!;
    expect(e.detail).toMatch(/an account not read — not an account removed/i);
  });

  it("marks the chronology as having gaps", () => {
    expect(buildAccountChronology(gone("partial"), REF).hasGaps).toBe(true);
  });

  it("does say no-longer-observed when the later report read completely", () => {
    const events = buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-07-01", null, { quality: "complete" }),
    ], REF).events;
    expect(events.map((e) => e.kind)).toContain("NO_LONGER_OBSERVED");
    expect(events.find((e) => e.kind === "NO_LONGER_OBSERVED")!.detail).toMatch(/read completely/);
  });
});

describe("different bureau coverage prevents a false disappearance", () => {
  it("says nothing about a bureau the later report does not cover", () => {
    const events = buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-07-01", null, { bureaus: ["EQ", "TU"] }),
    ], REF).events;
    const unavailable = events.find((e) => e.kind === "COMPARISON_UNAVAILABLE")!;
    expect(unavailable.reason).toBe("BUREAU_NOT_COVERED");
    expect(unavailable.detail).toMatch(/does not cover Experian/);
    expect(events.map((e) => e.kind)).not.toContain("NO_LONGER_OBSERVED");
  });

  it("comparableFor states each condition separately", () => {
    const base = snap("2026-07-01", null);
    expect(comparableFor(base, "EX")).toEqual({ ok: true });
    expect(comparableFor({ ...base, quality: "partial" }, "EX")).toEqual({ ok: false, reason: "COVERAGE_INCOMPLETE" });
    expect(comparableFor({ ...base, bureaus: ["TU"] }, "EX")).toEqual({ ok: false, reason: "BUREAU_NOT_COVERED" });
  });
});

describe("an ambiguous match does not merge histories", () => {
  /* A creditor that renames itself changes the account handle. Calling that a
     removal plus a birth is the wrong story. */
  it("withholds the disappearance when a near-match is on the later report", () => {
    const later = snap("2026-07-01", null);
    later.items = { "northwind bank na 4417": { name: "NORTHWIND BANK NA" } };
    const result = buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX", balance: 500 }]),
      later,
    ], REF);
    expect(result.events.map((e) => e.kind)).toContain("MATCH_REVIEW_REQUIRED");
    expect(result.events.map((e) => e.kind)).not.toContain("NO_LONGER_OBSERVED");
    expect(result.matchReviewRequired).toBe(true);
  });

  it("names the candidate rather than merging it", () => {
    const later = snap("2026-07-01", null);
    later.items = { "northwind bank na 4417": { name: "NORTHWIND BANK NA" } };
    const e = buildAccountChronology([snap("2026-06-01", [{ bureau: "EX" }]), later], REF)
      .events.find((x) => x.kind === "MATCH_REVIEW_REQUIRED")!;
    expect(e.detail).toContain("NORTHWIND BANK NA");
    expect(e.detail).toMatch(/not merged/i);
  });

  it("does not treat an unrelated account as a near-match", () => {
    const later = snap("2026-07-01", null);
    later.items = { "halcyon recovery": { name: "HALCYON RECOVERY LLC" } };
    expect(buildAccountChronology([snap("2026-06-01", [{ bureau: "EX" }]), later], REF)
      .events.map((e) => e.kind)).toContain("NO_LONGER_OBSERVED");
  });

  it("refuses to compare two observations for one bureau in one snapshot", () => {
    const s = snap("2026-06-01", [{ bureau: "EX", balance: 1 }, { bureau: "EX", balance: 2 }]);
    const r = buildAccountChronology([s], REF);
    expect(r.matchReviewRequired).toBe(true);
    expect(r.events.map((e) => e.kind)).toContain("MATCH_REVIEW_REQUIRED");
  });
});

describe("reappearance is neutral", () => {
  const cycle = [
    snap("2026-05-01", [{ bureau: "EX", balance: 500 }]),
    snap("2026-06-01", null, { quality: "complete" }),
    snap("2026-07-01", [{ bureau: "EX", balance: 500 }]),
  ];

  it("records a potential reappearance, not an illegal reinsertion", () => {
    const events = buildAccountChronology(cycle, REF).events;
    expect(events.map((e) => e.kind)).toContain("POTENTIAL_REAPPEARANCE_EVENT");
    const e = events.find((x) => x.kind === "POTENTIAL_REAPPEARANCE_EVENT")!;
    expect(e.detail).toMatch(/a question, not a finding/i);
    expect(e.detail).not.toMatch(/illegal|reinsertion|violation/i);
  });

  it("does not call a return a reappearance when the absence was never proven", () => {
    const unproven = [
      snap("2026-05-01", [{ bureau: "EX", balance: 500 }]),
      snap("2026-06-01", null, { quality: "partial" }),
      snap("2026-07-01", [{ bureau: "EX", balance: 500 }]),
    ];
    expect(buildAccountChronology(unproven, REF).events.map((e) => e.kind))
      .not.toContain("POTENTIAL_REAPPEARANCE_EVENT");
  });
});

describe("payment history uses its own dates", () => {
  it("compares a month against the same month, not an array position", () => {
    const events = find([
      snap("2026-06-01", [{ bureau: "EX", paymentHistory: ["2026-05:OK", "2026-04:OK"] }]),
      snap("2026-07-01", [{ bureau: "EX", paymentHistory: ["2026-06:OK", "2026-05:30", "2026-04:OK"] }]),
    ], "HISTORY_MARK_CHANGED");
    expect(events).toHaveLength(1);
    expect(events[0].month).toBe("2026-05");
    expect(events[0].detail).toBe("Experian payment history for 2026-05 changed OK → 30.");
  });

  it("treats a newly reported month as new, not as a change", () => {
    expect(find([
      snap("2026-06-01", [{ bureau: "EX", paymentHistory: ["2026-05:OK"] }]),
      snap("2026-07-01", [{ bureau: "EX", paymentHistory: ["2026-06:OK", "2026-05:OK"] }]),
    ], "HISTORY_MARK_CHANGED")).toEqual([]);
  });

  it("ignores an undated entry rather than positioning it", () => {
    expect(find([
      snap("2026-06-01", [{ bureau: "EX", paymentHistory: ["OK", "OK"] }]),
      snap("2026-07-01", [{ bureau: "EX", paymentHistory: ["30", "OK"] }]),
    ], "HISTORY_MARK_CHANGED")).toEqual([]);
  });
});

describe("immutable snapshots are never changed", () => {
  it("does not mutate the snapshots it reads", () => {
    const input = [
      snap("2026-06-01", [{ bureau: "EX", balance: 3031 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 2800 }]),
    ];
    const before = JSON.stringify(input);
    buildAccountChronology(input, REF);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("orders by pulled date regardless of the order it is given", () => {
    const forwards = kinds([
      snap("2026-06-01", [{ bureau: "EX", balance: 3031 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 2800 }]),
    ]);
    const backwards = kinds([
      snap("2026-07-01", [{ bureau: "EX", balance: 2800 }]),
      snap("2026-06-01", [{ bureau: "EX", balance: 3031 }]),
    ]);
    expect(backwards).toEqual(forwards);
  });
});

describe("reading the timeline", () => {
  it("lists every account any snapshot observed", () => {
    const a = snap("2026-06-01", [{ bureau: "EX" }]);
    const b = snap("2026-07-01", null);
    b.items = { other: { name: "OTHER" } };
    expect(accountRefsIn([a, b]).sort()).toEqual([REF, "other"]);
  });

  it("groups events newest snapshot first", () => {
    const events = buildAccountChronology([
      snap("2026-05-01", [{ bureau: "EX", balance: 100 }]),
      snap("2026-06-01", [{ bureau: "EX", balance: 200 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 300 }]),
    ], REF).events;
    expect(groupByPeriod(events).map((g) => g.pulledAt)).toEqual(["2026-07-01", "2026-06-01", "2026-05-01"]);
  });

  it("holds no statutory timer of any kind — that is G-11's", () => {
    const text = JSON.stringify(buildAccountChronology([
      snap("2026-06-01", [{ bureau: "EX", balance: 100 }]),
      snap("2026-07-01", [{ bureau: "EX", balance: 200 }]),
    ], REF));
    for (const word of ["deadline", "30 days", "45 days", "1681i", "investigation"]) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
