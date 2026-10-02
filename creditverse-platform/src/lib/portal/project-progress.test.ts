import { describe, expect, it } from "vitest";
import { enginesFor, isProjectAction, milestonesFor, type PartnerMilestone } from "./project-progress";

const m = (id: string, over: Partial<PartnerMilestone>): PartnerMilestone => ({
  id, projectId: "p1", label: id, engineLabel: null, scheduledAt: null, completedAt: null, linkUrl: null, ...over,
});

describe("a partner's milestones", () => {
  const all = [
    m("kickoff", { completedAt: "2026-09-01T00:00:00Z" }),
    m("site", { completedAt: "2026-09-20T00:00:00Z", linkUrl: "https://example.com/site" }),
    m("golive", { scheduledAt: "2026-10-10T00:00:00Z" }),
    m("handover", { scheduledAt: "2026-10-01T00:00:00Z" }),
    m("other", { projectId: "p2", completedAt: "2026-09-02T00:00:00Z" }),
  ];
  it("splits reached (newest first) from upcoming (soonest first), for one project only", () => {
    const r = milestonesFor("p1", all);
    expect(r.reached.map((x) => x.id)).toEqual(["site", "kickoff"]);
    expect(r.upcoming.map((x) => x.id)).toEqual(["handover", "golive"]);
  });
  it("counts as delivered only a reached milestone BES attached something to", () => {
    expect(milestonesFor("p1", all).deliverables.map((x) => x.id)).toEqual(["site"]);
  });
});

describe("a partner's engines and asks", () => {
  it("keeps each project's engines to itself", () => {
    const e = { engineKey: "web", label: "Website", units: 4, completed: 2, percent: 50, stage: "in_progress" as const };
    expect(enginesFor("p1", [{ ...e, projectId: "p1" }, { ...e, projectId: "p2" }])).toHaveLength(1);
  });
  it("counts build requirements, agreements and approvals — not client-file asks", () => {
    expect(isProjectAction({ source: "requirement", kind: "requirement" })).toBe(true);
    expect(isProjectAction({ source: "action", kind: "approval" })).toBe(true);
    expect(isProjectAction({ source: "action", kind: "document" })).toBe(false);
    expect(isProjectAction({ source: "invoice", kind: "billing" })).toBe(false);
  });
});
