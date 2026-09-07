/**
 * The heading has to be true when the bureaus disagree, and it must never
 * reconstruct a number the source chose to mask.
 */
import { describe, expect, it } from "vitest";
import { accountHeading, describeAccountNumber, matchSignals } from "./account-heading";

describe("describeAccountNumber", () => {
  it("uses the shared number when every reporting bureau shows the same one", () => {
    const d = describeAccountNumber([
      { bureau: "EX", masked: "****0002" },
      { bureau: "TU", masked: "****0002" },
    ]);
    expect(d).toEqual({ kind: "shared", text: "****0002" });
  });

  /* The heading in Dee's example: Equifax silent, the other two agreeing. */
  it("ignores a bureau that shows nothing", () => {
    const d = describeAccountNumber([
      { bureau: "EQ" },
      { bureau: "EX", masked: "****0002" },
      { bureau: "TU", masked: "****0002" },
    ]);
    expect(d.text).toBe("****0002");
  });

  it("uses the only number there is when one bureau exposes it", () => {
    const d = describeAccountNumber([{ bureau: "EQ" }, { bureau: "TU", masked: "****4417" }]);
    expect(d).toEqual({ kind: "single", text: "****4417", bureau: "TU" });
  });

  it("says the number varies when the visible digits differ", () => {
    const d = describeAccountNumber([
      { bureau: "EX", masked: "****0002" },
      { bureau: "TU", masked: "****9911" },
    ]);
    expect(d).toEqual({ kind: "varies", text: "Account # varies by bureau" });
  });

  it("says the number is not shown when nobody exposes one", () => {
    expect(describeAccountNumber([{ bureau: "EQ" }, { bureau: "EX" }]).text).toBe("Account # not shown");
    expect(describeAccountNumber([]).text).toBe("Account # not shown");
  });

  /* Masks are formatting. Two spellings of the same digits are not a
     difference, and calling them one would put "varies" on a heading where
     nothing varies. */
  it("compares the visible digits, not the mask characters", () => {
    const d = describeAccountNumber([
      { bureau: "EX", masked: "****0002" },
      { bureau: "TU", masked: "XXXX0002" },
    ]);
    expect(d.kind).toBe("shared");
  });

  it("treats a fully masked number as no number at all", () => {
    expect(describeAccountNumber([{ bureau: "EQ", masked: "XXXXXXXX" }]).text).toBe("Account # not shown");
  });

  /* The refusal that matters. Two partial masks must never be combined into
     something longer than either of them. */
  it("never reconstructs a longer number from two partials", () => {
    const d = describeAccountNumber([
      { bureau: "EX", masked: "4000****" },
      { bureau: "TU", masked: "****0002" },
    ]);
    expect(d.kind).toBe("varies");
    expect(d.text).not.toMatch(/40000002/);
  });
});

describe("accountHeading", () => {
  it("reads the way a reviewer expects", () => {
    expect(accountHeading("UNITED AUTO CREDIT C", [
      { bureau: "EQ" }, { bureau: "EX", masked: "****0002" }, { bureau: "TU", masked: "****0002" },
    ])).toBe("UNITED AUTO CREDIT C • ****0002");
  });

  it("says so plainly when the bureaus disagree", () => {
    expect(accountHeading("MERIDIAN CARD SERVICES", [
      { bureau: "EX", masked: "****1111" }, { bureau: "TU", masked: "****2222" },
    ])).toBe("MERIDIAN CARD SERVICES • Account # varies by bureau");
  });
});

describe("matchSignals", () => {
  it("carries four signals, not the number alone", () => {
    const s = matchSignals("Northwind Bank", [
      { account_number_masked: "****4417", account_type: "Revolving", open_date: "06/2018" },
      { account_number_masked: "****4417", account_type: "Revolving", open_date: "06/2018" },
    ]);
    expect(s).toEqual({
      creditorName: "northwind bank",
      maskedSuffix: "4417",
      accountType: "revolving",
      openDate: "06/2018",
    });
  });

  /* A suffix the bureaus disagree about is the thing being disputed, not
     evidence of identity. */
  it("withholds the suffix when the bureaus disagree about it", () => {
    const s = matchSignals("Northwind Bank", [
      { account_number_masked: "****4417" },
      { account_number_masked: "****9999" },
    ]);
    expect(s.maskedSuffix).toBeUndefined();
    expect(s.creditorName).toBe("northwind bank");
  });

  it("survives an account where nothing but a name is known", () => {
    expect(matchSignals("Halcyon Recovery LLC", [{}])).toEqual({
      creditorName: "halcyon recovery llc",
      maskedSuffix: undefined,
      accountType: undefined,
      openDate: undefined,
    });
  });
});
