/**
 * The detector decides what a bureau is told about an account.
 *
 * Half of these cover the contradictions the library is built to attack. The
 * other half — the ones that matter more — cover normal reporting that LOOKS
 * like a contradiction, taken from the false-positive list in the BES dispute
 * specification. A letter full of "violations" that are really ordinary
 * reporting is how a dispute gets dismissed as frivolous.
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
  it("asks about a charge-off carrying a balance rather than asserting it", () => {
    const r = detectConditions({
      item: item({ category: "Charge-Off" }),
      records: [rec({ bureau: "EQ", status: "Charge-Off", balance: 15508 })],
    });
    /* A charge-off is an accounting event, not forgiveness — the debt can
       still be owed, so this is a question, not a stated fact. */
    expect(r.conditions).not.toContain("charge_off_with_balance");
    expect(r.questions.map((q) => q.condition)).toContain("charge_off_with_balance");
    expect(r.evidence.join(" ")).toContain("15508");
  });

  it("asks about a 90-day mark with no 30 before it, and does not assert it", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "EX", paymentHistory: ["OK", "OK", "90", "120"] })],
    });
    expect(r.questions.map((q) => q.condition)).toContain("severe_late_without_prior_30");
    expect(r.conditions).not.toContain("severe_late_without_prior_30");
    expect(r.questions.find((q) => q.condition === "severe_late_without_prior_30")?.needs)
      .toContain("deferment");
  });

  it("does not flag a 90 that was reached properly", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "EX", paymentHistory: ["OK", "30", "60", "90"] })],
    });
    expect(r.conditions).not.toContain("severe_late_without_prior_30");
  });

  it("asks about a balance above the high credit — fees and interest do that", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "EQ", balance: 900, highBalance: 500 })],
    });
    expect(r.conditions).not.toContain("balance_above_high_credit");
    expect(r.questions.map((q) => q.condition)).toContain("balance_above_high_credit");
  });

  it("finds last activity dated before the account opened", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "EQ", openDate: "2019-04-01", dateLastActive: "2018-07-01" })],
    });
    expect(r.conditions).toContain("dola_before_open_date");
  });

  it("RULES OUT a past-due amount on a collection — it is permitted", () => {
    const r = detectConditions({
      item: item({ category: "3rd-Party Collection" }),
      records: [rec({ bureau: "TU", status: "Collection", pastDue: 412 })],
    });
    expect(r.conditions).not.toContain("collection_with_past_due");
    expect(r.questions.map((q) => q.condition)).not.toContain("collection_with_past_due");
    expect(r.ruledOut.map((q) => q.condition)).toContain("collection_with_past_due");
  });
});

describe("normal reporting that looks like a violation", () => {
  it("does not treat a paid account's historical lates as a contradiction", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "TU", status: "Paid", paymentHistory: ["OK", "30", "OK"] })],
    });
    /* A payment rating can describe the account before it was paid. */
    expect(r.conditions).not.toContain("paid_status_but_late_marks");
    expect(r.ruledOut.map((q) => q.condition)).toContain("paid_status_but_late_marks");
  });

  it("…but asks about it once the consumer says they were never late", () => {
    const r = detectConditions({
      item: item(),
      records: [rec({ bureau: "TU", status: "Paid", paymentHistory: ["OK", "30", "OK"] })],
      attestations: { neverLate: true },
    });
    expect(r.questions.map((q) => q.condition)).toContain("paid_status_but_late_marks");
  });

  it("treats single-bureau reporting as a question, never as proof", () => {
    const r = detectConditions({ item: item(), records: [rec({ bureau: "TU" })] });
    expect(r.conditions).not.toContain("single_bureau_only");
    expect(r.questions.map((q) => q.condition)).toContain("single_bureau_only");
  });

  it("treats a deletion elsewhere as a question, never as binding", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "TU" })], deletedFromBureaus: ["EQ", "EX"],
    });
    expect(r.conditions).not.toContain("deleted_from_other_bureaus");
    const q = r.questions.find((x) => x.condition === "deleted_from_other_bureaus");
    expect(q?.needs).toContain("does not legally bind");
  });

  it("does not demand fields a collection is meant to leave blank", () => {
    const r = detectConditions({
      item: item({ category: "3rd-Party Collection" }),
      records: [rec({ bureau: "EQ", status: "Collection", balance: 400, accountNumberMasked: "****1234",
                      accountType: "Collection", paymentStatus: "Collection", openDate: "2022-01-01",
                      dateLastActive: "2023-01-01", dateLastPayment: "2022-06-01", pastDue: 0 })],
    });
    const blanks = r.ruledOut.find((x) => x.observation.includes("as expected"));
    expect(blanks?.observation).toContain("Credit Limit");
    expect(r.conditions).not.toContain("data_missing_or_deficient");
  });
});

describe("comparisons across bureaus", () => {
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

  it("records a deletion elsewhere with both bureaus named", () => {
    const r = detectConditions({
      item: item(), records: [rec({ bureau: "TU" })], deletedFromBureaus: ["EQ", "EX"],
    });
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
