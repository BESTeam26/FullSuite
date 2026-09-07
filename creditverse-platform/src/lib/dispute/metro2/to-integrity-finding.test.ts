/**
 * Section A entering the canonical findings pipeline.
 *
 * The tests that matter here are the ones about what does NOT cross over. An
 * adapter is where a careful engine quietly loses its distinctions: an unknown
 * becomes a row, an apparent finding becomes an assertion, and a rule that
 * asked a question ends up in a letter as a statement of fact.
 */
import { describe, expect, it } from "vitest";
import { runSection, type Metro2Finding, type Metro2SectionResult } from "./run-section";
import { SECTION_A_RULES } from "./section-a-identity";
import {
  IDENTITY_ACCOUNT_REF,
  METRO2_CATALOGUE_VERSION,
  SECTION_A_RULE_VERSION,
  metro2FindingsToIntegrity,
} from "./to-integrity-finding";

const finding = (over: Partial<Metro2Finding> = {}): Metro2Finding => ({
  ruleId: "A2",
  title: "The name on the tradeline is not the consumer's",
  provenance: { catalogue: "A.2", sourceKind: "metro2_format" },
  confidence: "confirmed",
  observation: 'Reported as "JOHN Q SMITHE"; the client record says "John Smith".',
  claim: {
    assertion: "The name reported on this account is not mine.",
    question: "Whose name is on this account?",
    recipient: "cra",
    citations: [],
  },
  guardrails: ["Abbreviations and truncations are not defects."],
  fields: ["reportedName", "verifiedName"],
  ...over,
});

const result = (over: Partial<Metro2SectionResult> = {}): Metro2SectionResult => ({
  confirmed: [],
  apparent: [],
  unknown: [],
  notAnError: [],
  ...over,
});

const ctx = { reportId: "report-1" };

describe("what crosses into the findings pipeline", () => {
  it("carries a confirmed finding as an evidence-supported inaccuracy", () => {
    const [f] = metro2FindingsToIntegrity(result({ confirmed: [finding()] }), ctx);
    expect(f.classification).toBe("evidence_supported_inaccuracy");
    expect(f.verdict).toBe("evidence_supported_inaccuracy");
    expect(f.remedy).toBe("correct");
    expect(f.observation).toContain("SMITHE");
  });

  it("carries an apparent finding as needing a source document, never as evidence", () => {
    const [f] = metro2FindingsToIntegrity(
      result({ apparent: [finding({ confidence: "apparent", needs: "the consumer's photo identification" })] }),
      ctx,
    );
    expect(f.classification).toBe("potential_anomaly");
    expect(f.verdict).toBe("needs_source_document");
    expect(f.remedy).toBe("investigate_first");
    expect(f.evidence).toMatchObject({ settled_by: "the consumer's photo identification", may_assert: null });
  });

  /* The line that must not move. */
  it("drops UNKNOWN entirely — a missing fact is not a finding about the report", () => {
    const out = metro2FindingsToIntegrity(
      result({ unknown: [finding({ confidence: null, missing: ["verifiedName"] })] }),
      ctx,
    );
    expect(out).toEqual([]);
  });

  it("drops NOT_AN_ERROR — correct reporting is not saved to a client's record", () => {
    expect(metro2FindingsToIntegrity(result({ notAnError: [finding({ confidence: "not_an_error" })] }), ctx)).toEqual([]);
  });

  it("orders confirmed before apparent", () => {
    const out = metro2FindingsToIntegrity(
      result({
        confirmed: [finding({ ruleId: "A4" })],
        apparent: [finding({ ruleId: "A20", confidence: "apparent" })],
      }),
      ctx,
    );
    expect(out.map((f) => f.ruleId)).toEqual(["A4", "A20"]);
  });
});

describe("what every converted finding carries", () => {
  const one = () => metro2FindingsToIntegrity(result({ confirmed: [finding()] }), ctx)[0];

  it("always requires a person to review it", () => {
    expect(one().humanReviewRequired).toBe(true);
  });

  it("never claims a raw Metro 2 value — our source is a consumer display", () => {
    expect(one().rawMetro2Verified).toBe(false);
  });

  it("files identity defects against the personal-information section, not an account", () => {
    expect(one().accountRef).toBe(IDENTITY_ACCOUNT_REF);
  });

  it("keeps the report it was read against, and its own versions", () => {
    const f = one();
    expect(f.reportId).toBe("report-1");
    expect(f.ruleVersion).toBe(SECTION_A_RULE_VERSION);
    expect(f.catalogueVersion).toBe(METRO2_CATALOGUE_VERSION);
  });

  it("keeps the fields the rule declared it read", () => {
    expect(one().fields).toEqual(["reportedName", "verifiedName"]);
  });

  it("keeps the catalogue reference and the guardrails as checkable evidence", () => {
    expect(one().evidence).toMatchObject({
      catalogue: "A.2",
      source_kind: "metro2_format",
      guardrails: ["Abbreviations and truncations are not defects."],
    });
  });

  it("can be filed against a specific account when one is given", () => {
    const [f] = metro2FindingsToIntegrity(result({ confirmed: [finding()] }), {
      reportId: "report-1",
      accountRef: "acct-9",
      itemName: "CAPITAL ONE",
    });
    expect(f.accountRef).toBe("acct-9");
    expect(f.itemName).toBe("CAPITAL ONE");
  });
});

describe("where the claim is addressed", () => {
  const routeFor = (recipient: Metro2Finding["claim"]["recipient"]) =>
    metro2FindingsToIntegrity(
      result({ confirmed: [finding({ claim: { ...finding().claim, recipient } })] }),
      ctx,
    )[0].route;

  it("routes a bureau claim to the bureau", () => {
    expect(routeFor("cra")).toBe("cra");
  });

  it("routes a furnisher claim through the bureau, which triggers the reinvestigation duty", () => {
    expect(routeFor("furnisher")).toBe("furnisher_via_cra");
  });

  it("routes a collector claim to the collector", () => {
    expect(routeFor("collector")).toBe("collector");
  });

  it("sends 'either' to the bureau rather than defaulting to a direct furnisher letter", () => {
    expect(routeFor("either")).toBe("cra");
  });
});

describe("remedies the adapter refuses to derive", () => {
  /**
   * Deletion is a remedy a person chooses on the evidence. Deriving it from a
   * rule's confidence is how "the name is wrong" becomes "delete the account",
   * which is the demand that gets a whole letter dismissed.
   */
  it("never derives delete or block from a rule's confidence", () => {
    const out = metro2FindingsToIntegrity(
      result({
        confirmed: [finding({ ruleId: "A1", title: "Belongs to a different consumer" })],
        apparent: [finding({ ruleId: "A16", confidence: "apparent" })],
      }),
      ctx,
    );
    expect(out).toHaveLength(2);
    for (const f of out) expect(["delete", "block"]).not.toContain(f.remedy);
  });
});

describe("over the real Section A rules", () => {
  it("an empty identity input produces unknowns and therefore no findings at all", () => {
    const out = metro2FindingsToIntegrity(runSection(SECTION_A_RULES, {}), ctx);
    for (const f of out) expect(f.classification).not.toBe("evidence_supported_inaccuracy");
  });

  it("a real name mismatch reaches the pipeline as one reviewable finding", () => {
    const section = runSection(SECTION_A_RULES, {
      reportedName: "ROBERT JONES",
      verifiedName: "Michael Alvarez",
    });
    const out = metro2FindingsToIntegrity(section, ctx);
    const a2 = out.find((f) => f.ruleId === "A2");
    expect(a2).toBeDefined();
    expect(a2!.humanReviewRequired).toBe(true);
    expect(a2!.reportId).toBe("report-1");
  });

  it("an abbreviated name is not a finding, so nothing reaches the pipeline for it", () => {
    const section = runSection(SECTION_A_RULES, {
      reportedName: "M ALVAREZ",
      verifiedName: "Michael Alvarez",
    });
    expect(metro2FindingsToIntegrity(section, ctx).some((f) => f.ruleId === "A2")).toBe(false);
  });
});
