import { describe, expect, it } from "vitest";
import {
  assertableClaims,
  claimsFor,
  outstandingFacts,
  permittedQuestions,
  runSection,
} from "./run-section";
import { SECTION_A_RULES, type IdentityInput } from "./section-a-identity";

/**
 * The rules themselves are tested in section-a-identity.test.ts. What is tested
 * here is the thing that decides what a letter is ALLOWED to say — which is
 * where a false positive would actually reach a bureau.
 */
describe("running a Metro 2 section", () => {
  it("places every rule in exactly one bucket, always", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, {});
    const total =
      result.confirmed.length + result.apparent.length + result.unknown.length + result.notAnError.length;
    expect(total).toBe(SECTION_A_RULES.length);
  });

  it("reports an empty input as UNKNOWN, never as a clean bill of health", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, {});
    expect(result.confirmed).toEqual([]);
    expect(result.unknown.length).toBeGreaterThan(0);
    /* The distinction the whole design turns on: nothing reported and nothing
       wrong must not look the same. */
    expect(result.notAnError.length).toBeLessThan(SECTION_A_RULES.length);
  });

  it("never lets an UNKNOWN become an assertable claim", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, {});
    expect(assertableClaims(result)).toEqual([]);
  });

  it("asserts only what the report itself establishes", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, {
      reportedSsnLast4: "1234",
      verifiedSsnLast4: "9876",
    });
    const claims = assertableClaims(result);
    expect(claims.length).toBeGreaterThan(0);
    /* Every assertion traces to a confirmed finding, and every confirmed
       finding has a rule id behind it. */
    for (const c of claims) {
      expect(result.confirmed.some((f) => f.ruleId === c.ruleId)).toBe(true);
    }
  });

  it("turns an apparent finding into a question, not an assertion", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, {
      reportedAddress: "9 Nowhere Ln, Erewhon, ZZ",
      knownAddresses: ["1 Main St, Tampa, FL"],
    });
    const questions = permittedQuestions(result);
    const claimed = assertableClaims(result).map((c) => c.ruleId);
    for (const q of questions) expect(claimed).not.toContain(q.ruleId);
  });

  it("keeps a claim away from the wrong recipient", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, {
      reportedSsnLast4: "1234",
      verifiedSsnLast4: "9876",
    });
    for (const f of claimsFor(result, "cra")) {
      expect(["cra", "either"]).toContain(f.claim.recipient);
    }
    for (const f of claimsFor(result, "furnisher")) {
      expect(["furnisher", "either"]).toContain(f.claim.recipient);
    }
  });

  it("lists what is still needed, from both unknown and apparent findings", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, {});
    const facts = outstandingFacts(result);
    expect(facts.length).toBeGreaterThan(0);
    expect(new Set(facts).size).toBe(facts.length);
  });

  it("carries the catalogue reference on every finding, so a claim can be traced", () => {
    const result = runSection<IdentityInput>(SECTION_A_RULES, { reportedSsnLast4: "1", verifiedSsnLast4: "2" });
    const all = [...result.confirmed, ...result.apparent, ...result.unknown, ...result.notAnError];
    for (const f of all) {
      expect(f.provenance.catalogue).toBeTruthy();
      /* Metro 2 is a FORMAT. A finding must never claim a statute it does not
         have — the source kind says which it is. */
      expect(["metro2_format", "cra_guidance", "statute", "regulation"]).toContain(f.provenance.sourceKind);
    }
  });

  it("is deterministic — the same input gives the same answer", () => {
    const input: IdentityInput = { reportedSsnLast4: "1234", verifiedSsnLast4: "9876" };
    expect(JSON.stringify(runSection(SECTION_A_RULES, input))).toBe(
      JSON.stringify(runSection(SECTION_A_RULES, input)),
    );
  });
});
