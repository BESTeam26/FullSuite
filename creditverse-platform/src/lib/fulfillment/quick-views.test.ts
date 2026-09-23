import { describe, expect, it } from "vitest";
import { matchesQuickView, quickViewCounts, type QuickViewContext } from "./quick-views";

const ctx: QuickViewContext = { userId: "me", teamIds: ["team-a", "team-b"] };
const list = [
  { assignedAgentId: "me", teamId: "team-a" },      // mine, and my team
  { assignedAgentId: "her", teamId: "team-a" },     // my team, not mine
  { assignedAgentId: null, teamId: "team-a" },      // unassigned, my team
  { assignedAgentId: "him", teamId: "team-z" },     // neither
  { assignedAgentId: null, teamId: "team-z" },      // unassigned only
];

describe("the four quick views", () => {
  it("mine is the work with MY name on it", () => {
    expect(list.filter((c) => matchesQuickView(c, "mine", ctx))).toHaveLength(1);
  });

  it("unassigned means nobody holds it, on any team", () => {
    /* Including the one on a team I am not on — a lead distributing work needs
       to see everything going spare, not only their own corner. */
    expect(list.filter((c) => matchesQuickView(c, "unassigned", ctx))).toHaveLength(2);
  });

  it("my team INCLUDES my own files", () => {
    /* The trap: excluding them makes "My Team" mean "my team except me", and
       the counts stop adding up in the way anybody expects. */
    const team = list.filter((c) => matchesQuickView(c, "team", ctx));
    expect(team).toHaveLength(3);
    expect(team).toContainEqual({ assignedAgentId: "me", teamId: "team-a" });
  });

  it("all is all of them", () => {
    expect(list.filter((c) => matchesQuickView(c, "all", ctx))).toHaveLength(5);
  });

  it("signed out matches nothing personal, rather than everything", () => {
    const out: QuickViewContext = { userId: "", teamIds: [] };
    expect(list.filter((c) => matchesQuickView(c, "mine", out))).toHaveLength(0);
    expect(list.filter((c) => matchesQuickView(c, "team", out))).toHaveLength(0);
  });
});

describe("the tab counts and the list agree", () => {
  it("counts exactly what the same predicate would filter", () => {
    /* The whole point of one shared predicate: a tab reading "Unassigned (5)"
       that shows four rows is worse than no tab at all. */
    const counts = quickViewCounts(list, ctx);
    for (const view of ["mine", "unassigned", "team", "all"] as const) {
      expect(counts[view], view).toBe(list.filter((c) => matchesQuickView(c, view, ctx)).length);
    }
  });

  it("counts an empty queue as zeros, not as absent", () => {
    expect(quickViewCounts([], ctx)).toEqual({ mine: 0, unassigned: 0, team: 0, all: 0 });
  });
});
