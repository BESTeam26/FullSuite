/**
 * These are the arithmetic defects — the ones that are not a matter of
 * opinion. The tests that matter most are the two refusals: a code we merely
 * inferred from a label never produces a confirmed defect, and a collection is
 * allowed to carry what other statuses may not.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STATUS_CODES, checkStatusConsistency, resolveStatusCode, statusByCode,
} from "./metro2-status-rules";

describe("resolveStatusCode", () => {
  it("trusts a code the report actually printed", () => {
    expect(resolveStatusCode("64", undefined)).toEqual({ code: "64", displayed: true });
  });

  it("maps a label it recognises, and says the code was inferred", () => {
    expect(resolveStatusCode(undefined, "Paid, was charge-off")).toEqual({ code: "64", displayed: false });
    expect(resolveStatusCode(undefined, "Collection")).toEqual({ code: "93", displayed: false });
  });

  it("refuses to guess at a label it does not recognise", () => {
    expect(resolveStatusCode(undefined, "Account information disputed by consumer").code).toBeNull();
    expect(resolveStatusCode(undefined, "").code).toBeNull();
  });
});

describe("the balance a status requires", () => {
  it("catches a paid-was-charge-off still carrying a balance", () => {
    const d = checkStatusConsistency({ displayedCode: "64", balance: 1400, paymentRating: "5" });
    expect(d).toHaveLength(1);
    expect(d[0].observation).toContain("requires a zero balance");
    expect(d[0].confirmed).toBe(true);
  });

  it("catches current with an amount past due", () => {
    const d = checkStatusConsistency({ displayedCode: "11", pastDue: 220 });
    expect(d[0].observation).toContain("no amount past due");
  });

  it("catches a paid or closed status missing its payment rating", () => {
    const d = checkStatusConsistency({ displayedCode: "13", balance: 0, pastDue: 0 });
    expect(d[0].observation).toContain("requires a Payment Rating");
  });

  it("catches a severity that does not match the days past due", () => {
    const d = checkStatusConsistency({ displayedCode: "71", reportedDaysPastDue: 95 });
    expect(d[0].observation).toContain("30-59 days past due");
    expect(d[0].observation).toContain("95");
  });

  it("says nothing when the fields agree", () => {
    expect(checkStatusConsistency({ displayedCode: "64", balance: 0, pastDue: 0, paymentRating: "5" })).toEqual([]);
    expect(checkStatusConsistency({ displayedCode: "71", reportedDaysPastDue: 45 })).toEqual([]);
  });
});

describe("the refusals", () => {
  it("NEVER confirms a defect from a code it inferred from a label", () => {
    /* The report printed "Paid, was charge-off", not "64". Asserting a
       code-level violation from a translated label is the false positive the
       specification warns about. */
    const d = checkStatusConsistency({ statusLabel: "Paid, was charge-off", balance: 1400, paymentRating: "5" });
    expect(d).toHaveLength(1);
    expect(d[0].confirmed).toBe(false);
  });

  it("lets a collection carry a balance and an amount past due", () => {
    expect(checkStatusConsistency({ displayedCode: "93", balance: 900, pastDue: 900 })).toEqual([]);
  });

  it("lets a charge-off carry a balance", () => {
    expect(checkStatusConsistency({ displayedCode: "97", balance: 3200, pastDue: 3200 })).toEqual([]);
  });

  it("says nothing at all about a status it does not know", () => {
    expect(checkStatusConsistency({ displayedCode: "ZZ", balance: 500 })).toEqual([]);
  });
});

describe("the code table", () => {
  it("keeps the paid-derogatory family consistent", () => {
    for (const code of ["61", "62", "63", "64", "65"]) {
      const s = statusByCode(code)!;
      expect(s.requiresZeroBalance).toBe(true);
      expect(s.requiresZeroPastDue).toBe(true);
    }
  });

  it("records why a charge-off may still carry an original amount", () => {
    expect(statusByCode("64")?.note).toContain("Original Charge-off Amount");
  });

  it("has no duplicate codes", () => {
    const codes = ACCOUNT_STATUS_CODES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
