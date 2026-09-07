/**
 * CR-14. The doctrine these tests hold:
 *
 *   A partial snapshot is USABLE and must be honest that it is partial. The
 *   items that parsed are workable; the items that did not are NOT deleted,
 *   absent, or non-reporting. And a state is never upgraded by absence.
 */
import { describe, expect, it } from "vitest";
import {
  QUALITY_LABEL,
  analysisMayRun,
  buildQualityReport,
  deriveQuality,
  reasonFor,
  type CompletenessState,
  type ReconciliationCheck,
} from "./completeness";

const check = (over: Partial<ReconciliationCheck> = {}): ReconciliationCheck => ({
  bureau: "TU", checkKey: "accounts", stated: 27, parsed: 27, ok: true, ...over,
});

describe("deriveQuality", () => {
  it("is complete when every check passed", () => {
    expect(deriveQuality([check(), check({ bureau: "EX" })])).toBe("complete");
  });

  /* The example from Dee: 29 expected, 27 parsed. */
  it("is partial when a stated count disagrees", () => {
    expect(deriveQuality([
      check({ bureau: "EX" }),
      check({ bureau: "TU", stated: 29, parsed: 27, ok: false }),
    ])).toBe("partial");
  });

  /* "We could not verify" is worse than "we are two short": the second at
     least bounds the problem. */
  it("is review-required when a check could not be made at all", () => {
    expect(deriveQuality([check({ stated: undefined, ok: false })])).toBe("review_required");
  });

  it("is review-required when a required section is missing", () => {
    expect(deriveQuality([
      check(),
      { checkKey: "section:summary", stated: 1, parsed: 0, ok: false },
    ])).toBe("review_required");
  });

  it("prefers review-required over partial when both are present", () => {
    expect(deriveQuality([
      check({ stated: 29, parsed: 27, ok: false }),
      { checkKey: "section:account_history", stated: 1, parsed: 0, ok: false },
    ])).toBe("review_required");
  });

  /* No checks is UNKNOWN, and null must never read as complete. */
  it("is null when no reconciliation was possible", () => {
    expect(deriveQuality([])).toBeNull();
  });
});

describe("analysisMayRun", () => {
  it("runs only on a complete snapshot", () => {
    expect(analysisMayRun("complete")).toBe(true);
  });

  it("does not run on a partial or review-required snapshot", () => {
    expect(analysisMayRun("partial")).toBe(false);
    expect(analysisMayRun("review_required")).toBe(false);
  });

  /* A report imported before the manifest existed has a null verdict. Null is
     UNKNOWN, and unknown is not complete. */
  it("does not run when completeness is unknown", () => {
    expect(analysisMayRun(null)).toBe(false);
    expect(analysisMayRun(undefined)).toBe(false);
  });
});

describe("buildQualityReport", () => {
  it("names the shortfall in a sentence, per bureau", () => {
    const r = buildQualityReport([
      check({ bureau: "EX" }),
      check({ bureau: "TU", stated: 29, parsed: 27, ok: false }),
    ]);
    expect(r.quality).toBe("partial");
    expect(r.failures).toHaveLength(1);
    expect(r.summary).toMatch(/1 of 2 checks did not reconcile/);
  });

  /* THE SENTENCE THIS WHOLE MILESTONE EXISTS FOR. */
  it("says plainly that nothing missing is treated as deleted or absent", () => {
    const r = buildQualityReport([check({ stated: 29, parsed: 27, ok: false })]);
    expect(r.summary).toMatch(/nothing missing is treated as deleted or absent/i);
    expect(r.summary).toMatch(/still workable/i);
  });

  it("says how many checks passed when everything reconciled", () => {
    expect(buildQualityReport([check(), check({ bureau: "EX" })]).summary).toMatch(/Every check passed/);
  });

  it("says reconciliation was impossible rather than implying completeness", () => {
    const r = buildQualityReport([]);
    expect(r.quality).toBeNull();
    expect(r.summary).toMatch(/No reconciliation was possible/);
    expect(r.summary).not.toMatch(/complete/i);
  });

  it("counts a check parsed above the stated figure as a failure too", () => {
    /* More than the source states is also a parse we cannot trust. */
    const r = buildQualityReport([check({ stated: 27, parsed: 29, ok: false })]);
    expect(r.quality).toBe("partial");
  });
});

describe("reasonFor — a state is never upgraded by absence", () => {
  /* The correction Dee made explicitly: a provider not exposing DOFD is a
     fact about the provider. */
  it("never blames a bureau for what the provider does not expose", () => {
    const r = reasonFor("not_exposed_by_provider", "dofd", "SmartCredit");
    expect(r).toMatch(/SmartCredit does not expose dofd/);
    expect(r).toMatch(/says nothing about whether a bureau reports it/i);
    expect(r).not.toMatch(/omit/i);
  });

  it("keeps our failure ours", () => {
    expect(reasonFor("parse_failed", "balance", "SmartCredit")).toMatch(/our problem, not the bureau's/i);
  });

  it("distinguishes the source saying none from the field being blank", () => {
    expect(reasonFor("explicit_not_reported", "employer", "SmartCredit")).toMatch(/states that/i);
    expect(reasonFor("blank_in_source", "employer", "SmartCredit")).toMatch(/was empty/i);
  });

  it("gives every state but present a reason worth reading", () => {
    const states: CompletenessState[] = [
      "explicit_not_reported", "blank_in_source", "bureau_not_present",
      "not_exposed_by_provider", "parse_failed", "ambiguous", "unknown",
    ];
    for (const s of states) expect(reasonFor(s, "field", "Provider").length).toBeGreaterThan(20);
    expect(reasonFor("present", "field", "Provider")).toBe("");
  });
});

describe("labels an operator reads", () => {
  it("names the three verdicts plainly", () => {
    expect(QUALITY_LABEL).toEqual({
      complete: "Complete",
      partial: "Partial",
      review_required: "Review required",
    });
  });
});
