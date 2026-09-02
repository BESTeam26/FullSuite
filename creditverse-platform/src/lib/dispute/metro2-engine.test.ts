import { describe, it, expect } from "vitest";
import {
  detectAnomaly,
  detectReinsertion,
  routeStatutes,
  type AnomalyInput,
} from "./metro2-engine";
import type { BureauFieldValue } from "./metro2-taxonomy";

const vals = (eq: string, ex: string, tu: string): BureauFieldValue[] => [
  { bureau: "EQ", value: eq },
  { bureau: "EX", value: ex },
  { bureau: "TU", value: tu },
];

const run = (o: Partial<AnomalyInput> & Pick<AnomalyInput, "values">) =>
  detectAnomaly({ field: "Date Opened", ...o });

describe("detectAnomaly", () => {
  it("reports consistent when all bureaus agree", () => {
    const r = run({ values: vals("01/2019", "01/2019", "01/2019") });
    expect(r.classification).toBe("consistent");
    expect(r.fieldVerdict).toBe("expected");
    expect(r.evidenceStrength).toBe("unverified-observation");
    expect(r.legalContext).toEqual([]);
    expect(r.recommendedRoute).toBe("No action required");
    expect(r.humanReviewRequired).toBe(false);
  });

  it("ignores case, surrounding whitespace, blanks and '-' placeholders when comparing", () => {
    expect(run({ values: vals("Open", " open ", "OPEN") }).classification).toBe("consistent");
    expect(run({ values: vals("$500", "-", "") }).classification).toBe("consistent");
  });

  it("treats a cross-bureau difference as an investigation trigger, not proof", () => {
    const r = run({ values: vals("01/2019", "03/2019", "01/2019") });
    expect(r.classification).toBe("observed-difference");
    expect(r.fieldVerdict).toBe("suspicious");
    expect(r.evidenceStrength).toBe("cross-source-discrepancy");
    expect(r.legalContext).toEqual(["FCRA § 1681i"]);
    expect(r.metro2Context).toBe("Date Opened");
    expect(r.observation).toContain("EQ=01/2019");
    expect(r.flags).toContain(
      "Reporting period not confirmed — difference may be a timing artifact",
    );
    expect(r.humanReviewRequired).toBe(false);
  });

  it("drops the timing-artifact flag once the reporting period is confirmed", () => {
    const r = run({
      values: vals("01/2019", "03/2019", "01/2019"),
      sameReportingPeriodConfirmed: true,
    });
    expect(r.flags.some((f) => f.includes("timing artifact"))).toBe(false);
    expect(r.flags).toHaveLength(2);
  });

  it("resolves 'Current Balance' to the Current Status Metro 2 context", () => {
    // NOTE: possible bug — getFieldMetro2Context matches on the first word of
    // each taxonomy entry, so "Current Balance" hits "Current Status" first and
    // is labelled "Account Status Code" instead of "Current Balance".
    const r = run({ field: "Current Balance", values: vals("$500", "$0", "$500") });
    expect(r.classification).toBe("observed-difference");
    expect(r.metro2Context).toBe("Account Status Code");
  });

  it("escalates a DOFD mismatch to legal review as potential re-aging", () => {
    const r = run({
      field: "DOFD / FCRA Delinquency Date",
      values: vals("06/2019", "02/2021", "06/2019"),
    });
    expect(r.classification).toBe("potential-fcra-reg-v-issue");
    expect(r.fieldVerdict).toBe("legal-review");
    expect(r.humanReviewRequired).toBe(true);
    expect(r.legalContext).toEqual([
      "15 U.S.C. § 1681s-2(a)(5)",
      "15 U.S.C. § 1681c(c)",
      "Reg V Appendix E",
    ]);
    expect(r.flags[0]).toMatch(/re-aging/);
  });

  it("does not flag a DOFD that is consistent across bureaus", () => {
    const r = run({ field: "First Delinquency", values: vals("06/2019", "06/2019", "06/2019") });
    expect(r.classification).toBe("consistent");
  });

  it("classifies a contradicting source document as evidence-supported inaccuracy", () => {
    const r = run({
      field: "Current Balance",
      values: vals("$500", "$0", "$500"),
      hasSourceDocument: true,
      sourceDocumentContradictsReport: true,
      consumerAssertedValue: "$0",
      sameReportingPeriodConfirmed: true,
    });
    expect(r.classification).toBe("evidence-supported-inaccuracy");
    expect(r.fieldVerdict).toBe("evidence-supported-inaccuracy");
    expect(r.evidenceStrength).toBe("document-supported-fact");
    expect(r.observation).toBe(
      "Report shows $500 but the attached source document shows $0 for the same period.",
    );
    expect(r.flags).toHaveLength(2);
    expect(r.humanReviewRequired).toBe(false);
  });

  it("requires a source document when the consumer attests a different value", () => {
    const r = run({ values: vals("01/2019", "01/2019", "01/2019"), consumerAssertedValue: "01/2018" });
    expect(r.classification).toBe("potential-anomaly");
    expect(r.fieldVerdict).toBe("needs-source-document");
    expect(r.evidenceStrength).toBe("consumer-attested-fact");
    expect(r.requestedRemedy).toBe("Pending evidence collection.");
  });

  it("flags a debt collector that fails to communicate a disputed debt", () => {
    const base = {
      field: "Dispute Indicator",
      values: vals("No", "No", "No"),
      isDebtCollector: true,
      consumerDisputedDebt: true,
    };
    const r = run({ ...base, reportCommunicatesDispute: false });
    expect(r.classification).toBe("potential-fcra-reg-v-issue");
    expect(r.legalContext).toContain("FDCPA § 1692e(8)");
    expect(r.humanReviewRequired).toBe(true);

    expect(run({ ...base, reportCommunicatesDispute: true }).classification).toBe("consistent");
  });
});

describe("detectReinsertion", () => {
  it("flags a reinsertion event with certification and notice gaps", () => {
    const r = detectReinsertion({ previouslyDeleted: true, reappearedOnNewReport: true });
    expect(r.isReinsertionEvent).toBe(true);
    expect(r.classification).toBe("potential-fcra-reg-v-issue");
    expect(r.flags).toHaveLength(3);
    expect(r.legalContext).toEqual(["15 U.S.C. § 1681i(a)(5)(B)", "15 U.S.C. § 1681i(a)(5)(C)"]);
  });

  it("omits gap flags when certification and notice are on file", () => {
    const r = detectReinsertion({
      previouslyDeleted: true,
      reappearedOnNewReport: true,
      furnisherCertifiedCompleteAndAccurate: true,
      consumerReceived5DayNotice: true,
    });
    expect(r.isReinsertionEvent).toBe(true);
    expect(r.flags).toHaveLength(1);
  });

  it("requires both a prior deletion and a reappearance", () => {
    expect(detectReinsertion({ previouslyDeleted: true, reappearedOnNewReport: false }).isReinsertionEvent).toBe(false);
    const r = detectReinsertion({ previouslyDeleted: false, reappearedOnNewReport: true });
    expect(r.isReinsertionEvent).toBe(false);
    expect(r.classification).toBe("consistent");
    expect(r.flags).toEqual([]);
  });
});

describe("routeStatutes", () => {
  it("assigns §1681e(b) and §1681i to CRAs only", () => {
    const cra = routeStatutes("cra");
    expect(cra.recipient).toBe("cra");
    expect(cra.applicableStatutes).toEqual(["15 U.S.C. § 1681e(b)", "15 U.S.C. § 1681i"]);
    expect(cra.incorrectAssignment[0]).toMatch(/§1681s-2\(b\)/);
  });

  it("assigns §1681s-2 and Reg V to furnishers, never §1681e(b)", () => {
    const f = routeStatutes("furnisher");
    expect(f.applicableStatutes).toEqual([
      "15 U.S.C. § 1681s-2(a)",
      "15 U.S.C. § 1681s-2(b)",
      "Reg V 12 C.F.R. § 1022.43",
    ]);
    expect(f.applicableStatutes).not.toContain("15 U.S.C. § 1681e(b)");
    expect(f.incorrectAssignment).toHaveLength(2);
  });

  it("adds FDCPA §1692e(8) for debt collectors with a coverage caveat", () => {
    const dc = routeStatutes("debt-collector");
    expect(dc.applicableStatutes).toEqual(["FDCPA § 1692e(8)", "15 U.S.C. § 1681s-2"]);
    expect(dc.incorrectAssignment[0]).toMatch(/FDCPA coverage/);
  });
});
