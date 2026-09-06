/**
 * The detector decides what a bureau is told about an account, so these cover
 * the contradictions Dee's library is built to attack — and, just as
 * importantly, the cases where it must stay silent rather than guess.
 */
import { describe, expect, it } from "vitest";
import { detectConditions, type BureauRecord } from "./condition-detector";
import type { ClassifiedItem } from "@/lib/credit-classification";

const item = (over: Partial<ClassifiedItem> = {}): ClassifiedItem => ({
  id: "i1", name: "CAPITAL ONE", kind: "Account", status: "Open", bureaus: ["EQ", "EX", "TU"],
  category: "Late Payment", isNegative: true, isDerogatory: true, disposition: "dispute",
  aiReason: "", autoSelected: false, riskFlags: [], ...over,
});

const rec = (over: Partial<BureauRecord> & { bureau: BureauRecord["bureau"] }): BureauRecord => over;

describe("contradictions inside one bureau's own record", () => {
  it("finds a charge-off still carrying a balance", () => {
    const r = detectConditions({
      item: item({ category: "Charge-Off" }),
      records: [rec({ bureau: "EQ", status: "Charge-Off", balance: 15508 })],
    });
    expect(r.conditions).toContain("charge_off_with_balance");
    expect(r.evidence.join(" ")).toContain("15508");
  });

  it("finds a paid account that still carries late marks", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "TU", status: "Paid", paymentHistory: ["OK", "30", "OK"] })],
    });
    expect(r.conditions).toContain("paid_status_but_late_marks");
  });

  it("finds a 90-day mark with no 30-day mark before it", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "EX", paymentHistory: ["OK", "OK", "90", "120"] })],
    });
    expect(r.conditions).toContain("severe_late_without_prior_30");
  });

  it("does not flag a 90 that was reached properly", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "EX", paymentHistory: ["OK", "30", "60", "90"] })],
    });
    expect(r.conditions).not.toContain("severe_late_without_prior_30");
  });

  it("finds a balance above the high credit", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "EQ", balance: 900, highBalance: 500 })],
    });
    expect(r.conditions).toContain("balance_inconsistent");
  });

  it("finds last activity dated before the account opened", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "EQ", openDate: "2019-04-01", dateLastActive: "2018-07-01" })],
    });
    expect(r.conditions).toContain("dola_before_open_date");
  });

  it("finds a past-due amount on a collection", () => {
    const r = detectConditions({
      item: item({ category: "3rd-Party Collection" }),
      records: [rec({ bureau: "TU", status: "Collection", pastDue: 412 })],
    });
    expect(r.conditions).toContain("collection_with_past_due");
  });
});

describe("comparisons across bureaus", () => {
  it("notices only one bureau reporting", () => {
    expect(detectConditions({ item: item(), records: [rec({ bureau: "TU" })] }).conditions)
      .toContain("single_bureau_only");
  });

  it("notices a balance that differs between bureaus", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "EQ", balance: 1200 }), rec({ bureau: "EX", balance: 1310 })],
    });
    expect(r.conditions).toContain("balance_inconsistent");
  });

  it("says nothing about consistency when only one bureau reports", () => {
    const r = detectConditions({ item: item(), records: [rec({ bureau: "EQ", balance: 1200 })] });
    expect(r.conditions).not.toContain("balance_inconsistent");
    expect(r.conditions).not.toContain("dates_inconsistent");
  });

  it("records a deletion elsewhere as its own condition", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "TU" })], deletedFromBureaus: ["EQ", "EX"],
    });
    expect(r.conditions).toContain("deleted_from_other_bureaus");
    expect(r.evidence.join(" ")).toContain("EQ, EX");
  });
});

describe("missing data", () => {
  it("lists the fields no bureau populated", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "EQ", status: "Open", balance: 100 })],
    });
    expect(r.conditions).toContain("data_missing_or_deficient");
    expect(r.missingFields).toContain("creditLimit");
    expect(r.missingFields).toContain("dateLastPayment");
    expect(r.missingFields).not.toContain("balance");
  });

  it("treats a zero as reported, not missing — they are different things", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "EQ", pastDue: 0, balance: 0 })],
    });
    expect(r.missingFields).not.toContain("pastDue");
    expect(r.missingFields).not.toContain("balance");
  });
});

describe("what the consumer signed", () => {
  it("carries an attestation through, and never invents one", () => {
    const bare = detectConditions({ item: item(), records: [rec({ bureau: "EQ" })] });
    expect(bare.conditions).not.toContain("attested_identity_theft");
    expect(bare.conditions).not.toContain("attested_breach_impact");
    expect(bare.conditions).not.toContain("attested_never_late");

    const signed = detectConditions({
      item: item(), records: [rec({ bureau: "EQ" })],
      attestations: { identityTheft: true, breachImpact: true, neverLate: true },
    });
    expect(signed.conditions).toContain("attested_identity_theft");
    expect(signed.conditions).toContain("attested_breach_impact");
    expect(signed.conditions).toContain("attested_never_late");
  });
});

describe("our own procedural history", () => {
  it("comes from our records, not from the report", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "EQ" })],
      history: { priorRounds: 2, lastResponseAt: null, notatedAsDisputed: false, everDeletedThenReturned: true },
    });
    expect(r.conditions).toContain("prior_dispute_unanswered");
    expect(r.conditions).toContain("not_notated_as_disputed");
    expect(r.conditions).toContain("reinserted_after_deletion");
  });

  it("says nothing about history when we have none", () => {
    const r = detectConditions({ item: item(), records: [rec({ bureau: "EQ" })] });
    expect(r.conditions).not.toContain("prior_dispute_unanswered");
  });
});
