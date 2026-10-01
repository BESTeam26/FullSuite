import { describe, expect, it } from "vitest";
import { eodDueLabel, productionTiles, scoringPeriod, submissionLock } from "./agent-eod-view";

describe("the Agent EOD view rules", () => {
  it("tiles are files worked, then the most-ticked actions, never a sum", () => {
    const tiles = productionTiles({ filesWorked: 12, actionBreakdown: [
      { action: "Disputes Sent", count: 28 }, { action: "Follow-ups", count: 5 }, { action: "Bureau Calls", count: 3 },
      { action: "Items Updated", count: 6 }, { action: "Extra", count: 1 },
    ] });
    expect(tiles.map((t) => `${t.label}=${t.value}`)).toEqual([
      "Client Files Worked=12", "Disputes Sent=28", "Follow-ups=5", "Bureau Calls=3", "Items Updated=6",
    ]);
    expect(productionTiles({ filesWorked: 0, actionBreakdown: [] })).toEqual([{ label: "Client Files Worked", value: 0 }]);
  });

  it("names the scoring period, and says the month before was the testing phase only in the first scored month", () => {
    expect(scoringPeriod("2026-10-03", "2026-10-01")).toEqual({ period: "October 2026", note: "September was a testing phase and is not scored." });
    expect(scoringPeriod("2026-11-03", "2026-10-01")).toEqual({ period: "November 2026", note: null });
    expect(scoringPeriod("2027-01-05", "2027-01-01").note).toBe("December was a testing phase and is not scored.");
    expect(scoringPeriod("2026-10-03", null)).toEqual({ period: "October 2026", note: null });
  });

  it("reads the cutoff as a plain time", () => {
    expect(eodDueLabel("19:00:00")).toBe("Due today by 7:00 PM");
    expect(eodDueLabel("09:30:00")).toBe("Due today by 9:30 AM");
    expect(eodDueLabel("00:15:00")).toBe("Due today by 12:15 AM");
    expect(eodDueLabel(null)).toBeNull();
  });

  it("locks a submitted day, reopens it only when the lead asks a question", () => {
    expect(submissionLock(null)).toEqual({ state: "open", headline: "Not Submitted" });
    expect(submissionLock({ state: "draft", submittedAt: null, autoSubmitted: false, reviewNote: null })).toEqual({ state: "open", headline: "Not Submitted" });
    expect(submissionLock({ state: "submitted", submittedAt: "2026-10-01T22:00:00Z", autoSubmitted: false, reviewNote: null }))
      .toEqual({ state: "locked", headline: "Submitted", at: "2026-10-01T22:00:00Z" });
    expect(submissionLock({ state: "submitted", submittedAt: "2026-10-01T23:00:00Z", autoSubmitted: true, reviewNote: null }).headline).toBe("Auto-submitted");
    expect(submissionLock({ state: "needs_clarification", submittedAt: "2026-10-01T22:00:00Z", autoSubmitted: false, reviewNote: "Which bureau?" }))
      .toEqual({ state: "clarify", headline: "Follow-up asked", note: "Which bureau?" });
  });
});
