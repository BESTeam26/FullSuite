import { describe, expect, it } from "vitest";
import { DEPARTMENT_STAGES, PIPELINE_PHASES, PIPELINE_STAGES, groupByPhase, onPipeline, stageByLabel } from "./pipeline-stages";

describe("FundingOS pipeline spine", () => {
  it("is 17 stages in five phases, numbered in order", () => {
    expect(PIPELINE_PHASES.map((p) => p.stages.length)).toEqual([2, 4, 3, 5, 3]);
    expect(PIPELINE_STAGES.map((s) => s.number)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    expect(PIPELINE_STAGES[16].label).toBe("Funded");
    expect(stageByLabel("Additional Requirements").number).toBe(11);
  });
  it("every stage belongs to exactly one department queue", () => {
    const all = Object.values(DEPARTMENT_STAGES).flat();
    expect(all.length).toBe(17);
    expect(new Set(all).size).toBe(17);
  });
  it("dispositions take a file off the active flow; Active Funding and Funded stay on it", () => {
    expect(onPipeline("Active Funding")).toBe(true);
    expect(onPipeline("Funded")).toBe(true);
    expect(onPipeline("Lender Declined")).toBe(false);
    expect(onPipeline(undefined)).toBe(true);
  });
  it("groups files by phase with counts and returns off-pipeline files apart", () => {
    const files = [
      { id: "1", stage: "Document Collection" as const, secondaryStatus: "Active Funding" as const },
      { id: "2", stage: "Offer Received" as const, secondaryStatus: "Active Funding" as const },
      { id: "3", stage: "Submitted" as const },
      { id: "4", stage: "Lender Review" as const, secondaryStatus: "Lender Declined" as const },
    ];
    const g = groupByPhase(files);
    expect(g.phases.map((p) => p.total)).toEqual([0, 1, 1, 1, 0]);
    expect(g.phases[1].byStage.get(3)?.map((f) => f.id)).toEqual(["1"]);
    expect(g.offPipeline.map((f) => f.id)).toEqual(["4"]);
  });
});
