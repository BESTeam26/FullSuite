import { describe, expect, it } from "vitest";
import {
  LEGACY_OUTCOME_MAP, OUTCOMES, describeOutcome, isLegacyOutcome,
  outcomeFromComparison, sourceAllows, tallyOutcomes,
  type DisputeOutcome,
} from "./outcome-vocabulary";

const base = {
  observedInLater: true, laterReportComplete: true, bureauCoveredByBoth: true,
  nearMatchInLater: false, observedInEarlier: true, fieldChanged: false,
};

describe("an absence is never a deletion", () => {
  it("1. an account missing from a PARTIAL later import cannot be compared", () => {
    // The live defect R5 exists to close: this returned "deleted" and told a
    // client the bureau removed an account the importer simply failed to read.
    expect(outcomeFromComparison({ ...base, observedInLater: false, laterReportComplete: false }))
      .toBe("unable_to_compare");
  });

  it("2. an account missing from a COMPLETE later import is no_longer_observed, not deleted", () => {
    const out = outcomeFromComparison({ ...base, observedInLater: false });
    expect(out).toBe("no_longer_observed");
    expect(out).not.toBe("bureau_confirmed_deletion");
  });

  it("3. no comparison input whatsoever yields bureau_confirmed_deletion", () => {
    const flags = [true, false];
    const produced = new Set<DisputeOutcome>();
    for (const observedInLater of flags)
      for (const laterReportComplete of flags)
        for (const bureauCoveredByBoth of flags)
          for (const nearMatchInLater of flags)
            for (const observedInEarlier of flags)
              for (const fieldChanged of flags)
                for (const absentFromEarlierButPresentBefore of flags)
                  produced.add(outcomeFromComparison({
                    observedInLater, laterReportComplete, bureauCoveredByBoth,
                    nearMatchInLater, observedInEarlier, fieldChanged,
                    absentFromEarlierButPresentBefore,
                  }));
    expect(produced.has("bureau_confirmed_deletion")).toBe(false);
    expect(produced.has("corrected")).toBe(false);
  });

  it("4. a reimport comparison is not an allowed source for a confirmed deletion", () => {
    expect(sourceAllows("bureau_confirmed_deletion", "reimport_comparison")).toBe(false);
    expect(sourceAllows("bureau_confirmed_deletion", "cra_result_notice")).toBe(true);
  });
});

describe("a change is not a correction", () => {
  it("5. a field that moved is `updated`, and says so", () => {
    expect(outcomeFromComparison({ ...base, fieldChanged: true })).toBe("updated");
    expect(OUTCOMES.updated.doesNotEstablish).toMatch(/not by itself a correction/i);
  });

  it("6. `corrected` needs a reviewed source, never a diff", () => {
    expect(sourceAllows("corrected", "reimport_comparison")).toBe(false);
    for (const s of ["cra_result_notice", "operator_review", "consumer_provided_result"] as const)
      expect(sourceAllows("corrected", s)).toBe(true);
  });
});

describe("what an outcome refuses to claim", () => {
  it("7. `unchanged` denies verification, reasonable investigation and compliance", () => {
    const text = OUTCOMES.unchanged.doesNotEstablish ?? "";
    expect(text).toMatch(/verified as accurate/i);
    expect(text).toMatch(/reasonable investigation/i);
    expect(text).toMatch(/complies/i);
  });

  it("8. `reappeared` stays neutral — no reinsertion claim", () => {
    expect(OUTCOMES.reappeared.doesNotEstablish).toMatch(/not by itself improper/i);
    const all = JSON.stringify(OUTCOMES).toLowerCase();
    expect(all).not.toMatch(/illegal|unlawful|violation|reinsert/);
  });

  it("9. differing bureau coverage cannot be compared, and a near match needs review", () => {
    expect(outcomeFromComparison({ ...base, bureauCoveredByBoth: false })).toBe("unable_to_compare");
    expect(outcomeFromComparison({ ...base, observedInLater: false, nearMatchInLater: true }))
      .toBe("ambiguous_match");
  });
});

describe("metrics and legacy records", () => {
  it("10. a confirmed removal and an observed absence never land in one bucket", () => {
    const t = tallyOutcomes(["bureau_confirmed_deletion", "no_longer_observed", "no_longer_observed"]);
    expect(t.confirmed_removal).toBe(1);
    expect(t.observed_absence).toBe(2);
    expect(OUTCOMES.updated.metricGroup).not.toBe(OUTCOMES.corrected.metricGroup);
  });

  it("legacy counts map to legacy outcomes and are never upgraded", () => {
    expect(LEGACY_OUTCOME_MAP.deleted).toBe("legacy_reported_deleted");
    for (const o of Object.values(LEGACY_OUTCOME_MAP)) {
      expect(isLegacyOutcome(o)).toBe(true);
      expect(OUTCOMES[o].allowedSources).toEqual(["legacy_manual_entry"]);
      expect(OUTCOMES[o].metricGroup).toBe("legacy");
    }
    // A legacy "verified" must not read as a finding of accuracy.
    expect(OUTCOMES.legacy_reported_verified.doesNotEstablish).toMatch(/not a finding/i);
  });
});

describe("client-facing language", () => {
  it("attributes an observation to us, not an action to the bureau", () => {
    expect(describeOutcome("no_longer_observed", { bureau: "EX" }))
      .toBe("No longer observed on Experian in this report.");
    expect(describeOutcome("bureau_confirmed_deletion", { bureau: "TU" }))
      .toBe("TransUnion confirmed this item was removed from your file.");
  });

  it("shortens to a true sentence rather than printing an empty placeholder", () => {
    const text = describeOutcome("updated", { bureau: "EQ" });
    expect(text).not.toMatch(/\{/);
    expect(text).toBe("Equifax changed this item.");
    expect(describeOutcome("updated", { bureau: "EQ", field: "balance", previous: "$400", current: "$0" }))
      .toBe("Equifax changed balance from $400 to $0.");
  });

  it("every outcome has a client sentence, and every risky one says what it does not establish", () => {
    for (const m of Object.values(OUTCOMES)) {
      expect(m.clientText.length).toBeGreaterThan(10);
      expect(m.allowedSources.length).toBeGreaterThan(0);
    }
    for (const key of ["no_longer_observed", "updated", "unchanged", "reappeared", "unable_to_compare", "ambiguous_match"] as const)
      expect(OUTCOMES[key].doesNotEstablish).toBeTruthy();
  });
});
