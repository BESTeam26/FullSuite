/**
 * Section A, tested against the three lines Dee set for this work:
 * UNKNOWN never becomes CONFIRMED; an inferred code is never a displayed one;
 * a data inconsistency is not a legal claim.
 *
 * The refusals matter more than the findings here. An identity claim is the
 * most damaging thing to get wrong, because "this is not my account" said
 * without basis is both false and the fastest way to have a whole letter
 * dismissed.
 */
import { describe, expect, it } from "vitest";
import {
  A1_WRONG_CONSUMER, A12_WRONG_ECOA, A14_AUTHORIZED_USER_ON_COLLECTION,
  A16_WRONGLY_DECEASED, A20_ADDRESS_NOT_THE_CONSUMERS, A2_WRONG_NAME,
  A4_SSN_MISMATCH, A6_NO_SSN_AND_NO_DOB, SECTION_A_RULES, namesAgree,
} from "./section-a-identity";
import { runRule } from "./types";

describe("UNKNOWN never becomes a verdict", () => {
  it("refuses to judge a name comparison with nothing to compare", () => {
    const r = runRule(A2_WRONG_NAME, { reportedName: "JOHN A SMITH" });
    expect(r.evaluability).toBe("unknown");
    expect(r.confidence).toBeUndefined();
    expect(r.missing).toEqual(["verifiedName"]);
  });

  it("refuses an SSN comparison with only one side", () => {
    expect(runRule(A4_SSN_MISMATCH, { reportedSsnLast4: "1234" }).evaluability).toBe("unknown");
  });

  it("never returns confirmed from an unknown", () => {
    for (const rule of SECTION_A_RULES) {
      const r = runRule(rule, {});
      if (r.evaluability === "unknown") expect(r.confidence).toBeUndefined();
    }
  });
});

describe("names: cosmetic differences are not defects", () => {
  it("accepts an initialised or shortened given name", () => {
    expect(namesAgree("J SMITH", "JOHN SMITH")).toBe(true);
    expect(namesAgree("JON SMITH", "JONATHAN SMITH")).toBe(true);   // a genuine truncation
    expect(namesAgree("JOHN A SMITH", "JOHN SMITH")).toBe(true);
    expect(namesAgree("john smith", "JOHN SMITH")).toBe(true);
    expect(namesAgree("O'BRIEN, PAT", "PAT OBRIEN")).toBe(false);   // surname order differs; ask, do not assume
    /* JOHN is not a truncation of JONATHAN — they are different given names,
       and a letter should ask about that rather than wave it through. */
    expect(namesAgree("JOHN SMITH", "JONATHAN SMITH")).toBe(false);
  });

  it("catches a genuinely different surname", () => {
    expect(namesAgree("JOHN SMYTHE", "JOHN SMITH")).toBe(false);
  });

  it("asks about a real difference rather than asserting it", () => {
    const r = runRule(A2_WRONG_NAME, { reportedName: "JOHN SMYTHE", verifiedName: "JOHN SMITH" });
    expect(r.confidence).toBe("apparent");
    expect(r.needs).toContain("the same person recorded differently");
  });

  it("rules out an abbreviation entirely", () => {
    expect(runRule(A2_WRONG_NAME, { reportedName: "J SMITH", verifiedName: "JOHN SMITH" }).confidence)
      .toBe("not_an_error");
  });
});

describe("SSN: the report contradicting the consumer's own document is confirmed", () => {
  it("confirms a mismatch", () => {
    const r = runRule(A4_SSN_MISMATCH, { reportedSsnLast4: "1234", verifiedSsnLast4: "9876" });
    expect(r.confidence).toBe("confirmed");
    expect(r.observation).toContain("1234");
  });

  it("rules out a match", () => {
    expect(runRule(A4_SSN_MISMATCH, { reportedSsnLast4: "1234", verifiedSsnLast4: "1234" }).confidence)
      .toBe("not_an_error");
  });

  it("compares nothing when the value is not four digits", () => {
    expect(runRule(A4_SSN_MISMATCH, { reportedSsnLast4: "XXXX", verifiedSsnLast4: "1234" }).confidence)
      .toBe("not_an_error");
  });
});

describe("an inferred ECOA code is never a displayed one", () => {
  it("CONFIRMS only when the code was actually printed", () => {
    const r = runRule(A12_WRONG_ECOA, { ecoaCodeDisplayed: "2", documentedRelationship: "individual" });
    expect(r.confidence).toBe("confirmed");
  });

  it("downgrades to apparent when the code came from a label", () => {
    const r = runRule(A12_WRONG_ECOA, { ecoaLabel: "Joint", documentedRelationship: "individual" });
    expect(r.confidence).toBe("apparent");
    expect(r.observation).toContain("inferred from the label");
  });

  it("says nothing about a label it does not recognise", () => {
    expect(runRule(A12_WRONG_ECOA, { ecoaLabel: "Participant", documentedRelationship: "individual" }).confidence)
      .toBe("not_an_error");
  });

  it("asks about a withdrawn code rather than translating it", () => {
    const r = runRule(A12_WRONG_ECOA, { ecoaCodeDisplayed: "4", documentedRelationship: "individual" });
    expect(r.confidence).toBe("apparent");
    expect(r.observation).toContain("withdrew");
  });

  it("rules out a relationship that matches the documents", () => {
    expect(runRule(A12_WRONG_ECOA, { ecoaCodeDisplayed: "1", documentedRelationship: "individual" }).confidence)
      .toBe("not_an_error");
  });
});

describe("authorized user on a collection", () => {
  it("confirms it on a collection with a displayed code 3", () => {
    expect(runRule(A14_AUTHORIZED_USER_ON_COLLECTION, { isCollection: true, ecoaCodeDisplayed: "3" }).confidence)
      .toBe("confirmed");
  });

  it("does not apply to an ordinary tradeline", () => {
    expect(runRule(A14_AUTHORIZED_USER_ON_COLLECTION, { isCollection: false, ecoaCodeDisplayed: "3" }).confidence)
      .toBe("not_an_error");
  });

  it("is addressed to the collector, not the bureau", () => {
    expect(A14_AUTHORIZED_USER_ON_COLLECTION.claim.recipient).toBe("collector");
  });
});

describe("deceased", () => {
  it("only confirms once the consumer says they are alive", () => {
    expect(runRule(A16_WRONGLY_DECEASED, { reportedDeceased: true }).confidence).toBe("apparent");
    expect(runRule(A16_WRONGLY_DECEASED, { reportedDeceased: true, attestedNotDeceased: true }).confidence)
      .toBe("confirmed");
  });

  it("remembers a joint account may correctly show another borrower deceased", () => {
    expect(runRule(A16_WRONGLY_DECEASED, { reportedDeceased: true }).needs).toContain("joint account");
  });
});

describe("addresses", () => {
  it("ignores formatting and abbreviation", () => {
    const r = runRule(A20_ADDRESS_NOT_THE_CONSUMERS, {
      reportedAddress: "14 Mill St.", knownAddresses: ["14 Mill Street"],
    });
    expect(r.confidence).toBe("not_an_error");
  });

  it("asks about one the consumer does not recognise", () => {
    const r = runRule(A20_ADDRESS_NOT_THE_CONSUMERS, {
      reportedAddress: "900 Collector Plaza", knownAddresses: ["14 Mill Street"],
    });
    expect(r.confidence).toBe("apparent");
    expect(r.needs).toContain("skip trace");
  });
});

describe("'not mine' is a consumer assertion, never a deduction", () => {
  it("produces NOTHING from mismatched data alone", () => {
    const r = runRule(A1_WRONG_CONSUMER, {
      reportedName: "JOHN SMYTHE", verifiedName: "JOHN SMITH",
      reportedSsnLast4: "1234", verifiedSsnLast4: "9876",
    });
    expect(r.confidence).toBe("not_an_error");
    expect(r.observation).toContain("has not said this account is not theirs");
  });

  it("confirms once they have said so, and cites what supports it", () => {
    const r = runRule(A1_WRONG_CONSUMER, {
      attestedNotMine: true,
      reportedName: "JOHN SMYTHE", verifiedName: "JOHN SMITH",
      reportedSsnLast4: "1234", verifiedSsnLast4: "9876",
    });
    expect(r.confidence).toBe("confirmed");
    expect(r.observation).toContain("the name differs");
    expect(r.observation).toContain("the SSN differs");
  });

  it("still confirms on the statement alone, without inventing support", () => {
    const r = runRule(A1_WRONG_CONSUMER, { attestedNotMine: true });
    expect(r.confidence).toBe("confirmed");
    expect(r.observation).toBe("The consumer states this account is not theirs.");
  });
});

describe("every rule carries its whole argument", () => {
  it("names its source, its guardrails, its wording and its recipient", () => {
    for (const rule of SECTION_A_RULES) {
      expect(rule.provenance.catalogue).toMatch(/^A\./);
      /* Metro 2 is a FORMAT. No rule may present it as a statute. */
      expect(rule.provenance.sourceKind).toBe("metro2_format");
      expect(rule.claim.question.length).toBeGreaterThan(10);
      expect(["cra", "furnisher", "collector", "either"]).toContain(rule.claim.recipient);
      expect(rule.guardrails.length).toBeGreaterThan(0);
    }
  });

  it("cites no statute, because a format defect is not a legal claim", () => {
    for (const rule of SECTION_A_RULES) expect(rule.claim.citations).toEqual([]);
  });

  it("is pure: the same input always gives the same answer", () => {
    const input = { reportedSsnLast4: "1234", verifiedSsnLast4: "9876" };
    expect(runRule(A4_SSN_MISMATCH, input)).toEqual(runRule(A4_SSN_MISMATCH, input));
  });
});
