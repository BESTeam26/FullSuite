import { describe, expect, it } from "vitest";
import { formatRate, sampleCaution, scoreLenders, sortScores, type OutcomeDeal } from "./lender-scorecard";

const deal = (over: Partial<OutcomeDeal>): OutcomeDeal => ({ id: "d", lenderId: "L1", lenderName: "Apex Capital", amount: 100_000, status: "Submitted", submittedAt: "2026-08-01T00:00:00Z", fundedAt: null, decisions: [], ...over });

describe("lender scorecard (descriptive, deterministic)", () => {
  it("counts submissions, offers, funded and declined; drafts are not submissions", () => {
    const rows = scoreLenders([
      deal({ id: "1", status: "Funded", amount: 240_000, decisions: [{ decision: "approved", decidedAt: "2026-08-07T00:00:00Z" }] }),
      deal({ id: "2", status: "Offer Received", decisions: [{ decision: "approved", decidedAt: "2026-08-04T00:00:00Z" }] }),
      deal({ id: "3", status: "Declined", decisions: [{ decision: "declined", decidedAt: "2026-08-11T00:00:00Z" }] }),
      deal({ id: "4", status: "Draft" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ submissions: 3, offers: 2, funded: 1, declined: 1, fundedVolume: 240_000, caution: "limited" });
    expect(rows[0].offerRate).toBeCloseTo(2 / 3);
    expect(rows[0].fundingRate).toBeCloseTo(1 / 3);
    // response days: 6, 3, 10 → median 6
    expect(rows[0].medianResponseDays).toBe(6);
    expect(rows[0].responseSample).toBe(3);
  });
  it("never shows a rate out of nothing, and names the sample", () => {
    expect(formatRate(null, 0, 0)).toEqual({ pct: "—", sample: "no submissions" });
    expect(formatRate(0.5, 1, 2)).toEqual({ pct: "50%", sample: "1/2" });
    expect(sampleCaution(4)).toBe("limited");
    expect(sampleCaution(14)).toBe("small");
    expect(sampleCaution(15)).toBeNull();
  });
  it("groups by lender id when present, otherwise by name; sorting is a stable display order", () => {
    const rows = scoreLenders([
      deal({ id: "1", lenderId: null, lenderName: "Summit Funding", status: "Funded", amount: 240_000 }),
      deal({ id: "2", lenderId: null, lenderName: "summit funding ", status: "Submitted" }),
      deal({ id: "3", lenderId: "L1", lenderName: "Apex Capital", status: "Submitted" }),
    ]);
    expect(rows.map((r) => `${r.lenderName}:${r.submissions}`).sort()).toEqual(["Apex Capital:1", "Summit Funding:2"]);
    expect(sortScores(rows, "funded_volume").map((r) => r.lenderName)).toEqual(["Summit Funding", "Apex Capital"]);
    expect(sortScores(rows, "name").map((r) => r.lenderName)).toEqual(["Apex Capital", "Summit Funding"]);
    // No response data sorts last on the response order.
    expect(sortScores(rows, "response").map((r) => r.medianResponseDays)).toEqual([null, null]);
  });
});
