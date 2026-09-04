/**
 * The frontend mirror of `public.in_scope` must agree with the database's
 * three-step order — responsibility, ceiling, supervision — and must default to
 * deny. These are the same cases the RLS matrix proves server-side.
 */
import { describe, expect, it } from "vitest";
import { likelyInScope, seesUnassignedTeamQueue, type ScopeContext } from "./scope";

const me = "u-me";
const ctx = (over: Partial<ScopeContext>): ScopeContext => ({
  userId: me, scope: "assigned", scopeDivision: null, teamIds: [], ledTeamIds: [], ...over,
});

describe("likelyInScope", () => {
  it("denies with no membership at all", () => {
    expect(likelyInScope(ctx({ scope: null }), { assigneeId: me })).toBe(false);
    expect(likelyInScope(ctx({ userId: null }), { assigneeId: me })).toBe(false);
  });

  it("assignment always counts, whatever the ceiling", () => {
    expect(likelyInScope(ctx({ scope: "assigned" }), { assigneeId: me })).toBe(true);
    expect(likelyInScope(ctx({ scope: "division", scopeDivision: "fundingops" }), { division: "creditops", assigneeId: me })).toBe(true);
  });

  it("assigned scope sees nothing unassigned — even on its own team", () => {
    expect(likelyInScope(ctx({ scope: "assigned", teamIds: ["A"] }), { teamId: "A", assigneeId: null })).toBe(false);
  });

  it("team scope sees the team's unassigned queue, not other teams", () => {
    const c = ctx({ scope: "team", teamIds: ["A"] });
    expect(likelyInScope(c, { teamId: "A", assigneeId: null })).toBe(true);
    expect(likelyInScope(c, { teamId: "B", assigneeId: null })).toBe(false);
  });

  it("division scope is bounded by the division", () => {
    const c = ctx({ scope: "division", scopeDivision: "creditops" });
    expect(likelyInScope(c, { division: "creditops" })).toBe(true);
    expect(likelyInScope(c, { division: "fundingops" })).toBe(false);
    expect(likelyInScope(c, { division: null })).toBe(false);
  });

  it("a lead supervises their team regardless of their own ceiling", () => {
    const c = ctx({ scope: "assigned", teamIds: ["A"], ledTeamIds: ["A"] });
    expect(likelyInScope(c, { teamId: "A", assigneeId: "someone-else" })).toBe(true);
    expect(likelyInScope(c, { teamId: "B", assigneeId: "someone-else" })).toBe(false);
  });

  it("agency scope reaches everything", () => {
    expect(likelyInScope(ctx({ scope: "agency" }), { teamId: "Z", division: "fundingops" })).toBe(true);
  });

  it("self scope adds created-by, nothing more", () => {
    const c = ctx({ scope: "self" });
    expect(likelyInScope(c, { creatorId: me })).toBe(true);
    expect(likelyInScope(c, { creatorId: "other", teamId: "A" })).toBe(false);
  });
});

describe("seesUnassignedTeamQueue", () => {
  it("is the explicit decision, not query breadth", () => {
    expect(seesUnassignedTeamQueue("team")).toBe(true);
    expect(seesUnassignedTeamQueue("assigned")).toBe(false);
    expect(seesUnassignedTeamQueue("self")).toBe(false);
    expect(seesUnassignedTeamQueue(null)).toBe(false);
  });
});
