/**
 * The chart is generated, so its shape is a rule and not a drawing.
 *
 * The two that would be easiest to get wrong and hardest to notice: leadership
 * appearing as a fourth operating division (§10, §11), and FundingOps turning
 * into a department when it is nested (§12) — which would have flipped seven
 * `departments.division` enums and silently changed who can see FundingOps
 * work (§28).
 */
import { describe, expect, it } from "vitest";
import { buildOrgChart, countSeats, type OrgNode } from "./org-chart";
import type { OrganizationTree } from "@/lib/data/organization-structure";
import type { Position } from "@/lib/data/positions";

const division = (over: Partial<OrganizationTree["divisions"][number]>) => ({
  id: "v1", name: "CreditOps", description: null, service: "creditops",
  leadId: null, sort: 10, archived: false, parentDivisionId: null,
  tier: "operating" as const, ...over,
});
const department = (over: Partial<OrganizationTree["departments"][number]>) => ({
  id: "d1", divisionId: "v1", name: "Dispute", description: null,
  managerId: null, sort: 10, archived: false, ...over,
});
const team = (over: Partial<OrganizationTree["teams"][number]>) => ({
  id: "t1", departmentId: "d1", name: "Team Daniel", description: null,
  sort: 10, archived: false, members: [], ...over,
});
const position = (over: Partial<Position>): Position => ({
  id: "p1", title: "Processing Team Lead", description: null, status: "active",
  divisionId: "v1", divisionName: "CreditOps", divisionTier: "operating",
  divisionParentId: null, departmentId: "d1", departmentName: "Dispute",
  teamId: "t1", teamName: "Team Daniel", reportsToId: null, reportsToTitle: null,
  reportsToPerson: null, headcount: 1, sort: 10, archivedAt: null,
  state: "vacant", holders: [], coverage: [], ...over,
});

const chart = (tree: Partial<OrganizationTree>, positions: Position[] = []) =>
  buildOrgChart({
    agencyName: "Blessed Empire Services",
    tree: { divisions: [], departments: [], teams: [], ...tree } as OrganizationTree,
    positions,
  });

const labels = (n: OrgNode): string[] => [n.label, ...n.children.flatMap(labels)];
const find = (n: OrgNode, label: string): OrgNode | undefined =>
  n.label === label ? n : n.children.map((c) => find(c, label)).find(Boolean);
const flatten = (n: OrgNode): OrgNode[] => [n, ...n.children.flatMap(flatten)];

describe("the top of the chart", () => {
  it("is the agency, with the operating divisions counted", () => {
    const root = chart({ divisions: [division({}), division({ id: "v2", name: "BES CRM", service: "bes_crm" })] });
    expect(root.label).toBe("Blessed Empire Services");
    expect(root.detail).toBe("2 operating divisions");
  });

  it("puts leadership FIRST and does not count it as an operating division", () => {
    const root = chart({
      divisions: [
        division({}),
        division({ id: "v0", name: "Corporate Operations", service: "corporate", tier: "leadership", sort: 50 }),
      ],
    });
    expect(root.children[0].label).toBe("Corporate Operations");
    expect(root.children[0].kind).toBe("leadership");
    expect(root.detail).toBe("1 operating division");
  });
});

describe("a nested division stays a division", () => {
  it("puts FundingOps under CreditOps without making it a department", () => {
    const root = chart({
      divisions: [
        division({}),
        division({ id: "v9", name: "FundingOps", service: "fundingops", parentDivisionId: "v1" }),
      ],
    });
    const funding = find(root, "FundingOps")!;
    expect(funding.kind).toBe("division");
    /* Under CreditOps, not beside it. */
    expect(root.children.map((c) => c.label)).toEqual(["CreditOps"]);
    expect(find(root, "CreditOps")!.children.some((c) => c.label === "FundingOps")).toBe(true);
  });
});

describe("where a seat hangs", () => {
  it("under its team when it has one", () => {
    const root = chart(
      { divisions: [division({})], departments: [department({})], teams: [team({})] },
      [position({})],
    );
    expect(find(root, "Team Daniel")!.children.map((c) => c.label)).toEqual(["Processing Team Lead"]);
  });

  it("under its department when it has no team", () => {
    const root = chart(
      { divisions: [division({})], departments: [department({})] },
      [position({ teamId: null, teamName: null, title: "Bureau Calling Specialist" })],
    );
    expect(find(root, "Dispute")!.children.map((c) => c.label)).toEqual(["Bureau Calling Specialist"]);
  });

  it("under its division when it has neither — a company-level seat", () => {
    const root = chart(
      { divisions: [division({ id: "v0", name: "Corporate Operations", tier: "leadership" })] },
      [position({ divisionId: "v0", departmentId: null, teamId: null, title: "Chief Executive Officer" })],
    );
    expect(find(root, "Corporate Operations")!.children.map((c) => c.label))
      .toEqual(["Chief Executive Officer"]);
  });

  it("in a visible 'Not yet placed' group when it has nothing at all", () => {
    const root = chart({ divisions: [division({})] },
      [position({ divisionId: null, departmentId: null, teamId: null, title: "Orphan" })]);
    expect(find(root, "Not yet placed")).toBeTruthy();
    expect(labels(root)).toContain("Orphan");
  });
});

describe("vacancies and coverage are visible, not omitted", () => {
  it("shows a vacant seat as a node saying Vacant (§7)", () => {
    const root = chart({ divisions: [division({})] },
      [position({ divisionId: "v1", departmentId: null, teamId: null, state: "vacant" })]);
    const seat = find(root, "Processing Team Lead")!;
    expect(seat.state).toBe("vacant");
    expect(seat.detail).toBe("Vacant");
  });

  it("says how many seats a multi-headcount vacancy has", () => {
    const root = chart({ divisions: [division({})] },
      [position({ divisionId: "v1", departmentId: null, teamId: null, headcount: 2, title: "Junior Processor" })]);
    expect(find(root, "Junior Processor")!.detail).toBe("Vacant · 2 seats");
  });

  it("shows coverage ON the covered seat, not as a second seat (§8)", () => {
    const root = chart({ divisions: [division({ id: "v0", name: "Corporate Operations", tier: "leadership" })] },
      [position({
        divisionId: "v0", departmentId: null, teamId: null, title: "Chief Financial Officer",
        state: "covered",
        coverage: [{ assignmentId: "a1", userId: "u1", name: "Dee Gallardo", from: "2026-01-01", type: "acting", note: null }],
      })]);
    const cfo = find(root, "Chief Financial Officer")!;
    expect(cfo.detail).toBe("Vacant");
    expect(cfo.coverage).toBe("Dee Gallardo (acting)");
    expect(labels(root).filter((l) => l === "Chief Financial Officer")).toHaveLength(1);
  });

  it("names the holder when the seat is filled", () => {
    const root = chart({ divisions: [division({})] },
      [position({
        divisionId: "v1", departmentId: null, teamId: null, state: "filled",
        holders: [{ assignmentId: "a1", userId: "u1", name: "Dee Gallardo", from: "2026-01-01" }],
      })]);
    expect(find(root, "Processing Team Lead")!.detail).toBe("Dee Gallardo");
  });

  it("leaves an archived seat out of the chart entirely", () => {
    const root = chart({ divisions: [division({})] },
      [position({ divisionId: "v1", departmentId: null, teamId: null, archivedAt: "2026-01-01" })]);
    expect(labels(root)).not.toContain("Processing Team Lead");
  });
});

describe("every node can open its real record", () => {
  it("carries the record id, so nothing is a dead node (§16)", () => {
    const root = chart(
      { divisions: [division({})], departments: [department({})], teams: [team({})] },
      [position({})],
    );
    /* Recursively — a position sits four levels down, and the first version
       of this test only flattened three and reported a false failure. */
    const all = flatten(root);
    for (const kind of ["division", "department", "team", "position"]) {
      expect(all.find((n) => n.kind === kind)?.recordId, kind).toBeTruthy();
    }
  });
});

describe("the header counts", () => {
  it("splits filled, covered and vacant, and ignores archived", () => {
    expect(countSeats([
      position({ id: "a", state: "filled" }),
      position({ id: "b", state: "covered" }),
      position({ id: "c", state: "vacant" }),
      position({ id: "d", state: "vacant", archivedAt: "2026-01-01" }),
    ])).toEqual({ total: 3, filled: 1, covered: 1, vacant: 1 });
  });
});
