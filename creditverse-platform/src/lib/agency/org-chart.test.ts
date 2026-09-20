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
  managerId: null, parentDepartmentId: null, functions: [], showOnChart: true, sort: 10, archived: false, ...over,
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
    /* A leadership division with departments of its own is drawn as a box;
       one that only holds seats is transparent (the seats hang off the
       company — Dee's poster has no "Corporate" box). Either way it is
       never counted among the operating divisions. */
    const root = chart({
      divisions: [
        division({}),
        division({ id: "v0", name: "Corporate Operations", service: "corporate", tier: "leadership", sort: 50 }),
      ],
      departments: [department({ id: "d0", divisionId: "v0", name: "Executive Office" })],
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
    /* Straight off the company: the leadership division has no departments,
       so it draws no box of its own. */
    expect(root.children.map((c) => c.label)).toEqual(["Chief Executive Officer"]);
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

/* Dee, 2026-09-19: "show the person under the role, like the list of names
   under those team or department… and their role." */
const findNode = (node: OrgNode, pred: (n: OrgNode) => boolean): OrgNode | null => {
  if (pred(node)) return node;
  for (const c of node.children) { const hit = findNode(c, pred); if (hit) return hit; }
  return null;
};

describe("people under their team", () => {
  const people = [
    { userId: "u-lead", name: "Rowell", title: "Processing Team Lead" },
    { userId: "u-a", name: "Bryan", title: "Processor" },
    { userId: "u-b", name: "Archie", title: null },
  ];
  const tree = {
    divisions: [division({})], departments: [department({ managerId: "u-lead" })],
    teams: [team({ members: [{ userId: "u-a", isLead: false }, { userId: "u-b", isLead: false }, { userId: "u-lead", isLead: true }] })],
  } as unknown as OrganizationTree;

  it("lists each member under the team with the role they hold, the lead first", () => {
    const root = buildOrgChart({ agencyName: "BES", tree, positions: [], people });
    const teamNode = findNode(root, (n) => n.kind === "team")!;
    const persons = teamNode.children.filter((n) => n.kind === "person");
    expect(persons.map((n) => [n.label, n.detail])).toEqual([
      ["Rowell", "Processing Team Lead · Team Lead"],
      ["Archie", "Team member"],
      ["Bryan", "Processor"],
    ]);
    expect(persons[0].recordId).toBe("u-lead");
  });

  it("names the department manager under the department", () => {
    const root = buildOrgChart({ agencyName: "BES", tree, positions: [], people });
    const dept = findNode(root, (n) => n.kind === "department")!;
    expect(dept.children[0]).toMatchObject({ kind: "person", label: "Rowell", detail: "Department Manager" });
  });

  it("draws counts only when no people are supplied", () => {
    const root = buildOrgChart({ agencyName: "BES", tree, positions: [] });
    const teamNode = findNode(root, (n) => n.kind === "team")!;
    expect(teamNode.children.some((n) => n.kind === "person")).toBe(false);
    expect(teamNode.detail).toBe("3 people");
  });
});


describe("Dee's chart, 2026-09-20 — a reporting line, grouped departments, functions", () => {
  const corp = division({ id: "corp", name: "Corporate", tier: "leadership", sort: 0 });
  const ops = division({ id: "ops", name: "CreditOps", sort: 1 });
  const ceo = position({ id: "ceo", title: "Chief Executive Officer", divisionId: "corp", departmentId: null, teamId: null });
  const coo = position({ id: "coo", title: "Chief Operating Officer", divisionId: "corp", departmentId: null, teamId: null, reportsToId: "ceo", state: "vacant", holders: [] });
  const ea = position({ id: "ea", title: "Executive Assistant", divisionId: "corp", departmentId: null, teamId: null, reportsToId: "coo" });

  it("hangs the corporate seats on the line they report to, and the divisions under the head of operations", () => {
    const root = chart({ divisions: [corp, ops], departments: [], teams: [] }, [ceo, coo, ea]);
    const ceoNode = find(root, "Chief Executive Officer")!;
    const cooNode = find(ceoNode, "Chief Operating Officer")!;
    /* The corporate seats in the COO's row; the divisions beneath them as their own tier. */
    expect(cooNode.children.map((c) => c.label)).toEqual(["Executive Assistant", "Operating Divisions"]);
    const tier = find(cooNode, "Operating Divisions")!;
    expect(tier.kind).toBe("tier");
    expect(tier.children.map((c) => c.label)).toEqual(["CreditOps"]);
    /* …the CEO hangs straight off the company (no "Corporate" box), and the
       division is not ALSO drawn beside leadership. */
    expect(root.children.map((c) => c.label)).toEqual(["Chief Executive Officer"]);
  });

  it("names each division's manager by seat, or says the seat is vacant", () => {
    const root = chart({ divisions: [division({ id: "v1", name: "CreditOps", leadId: null })] });
    expect(find(root, "CreditOps")!.manager).toBe("Vacant");
  });

  it("with no head of operations, the divisions hang under the company", () => {
    const root = chart({ divisions: [corp, ops], departments: [], teams: [] }, [ceo]);
    expect(root.children.map((c) => c.label)).toEqual(["Chief Executive Officer", "CreditOps"]);
  });

  it("groups queue departments under their chart department and keeps the queues as their own nodes", () => {
    const grp = department({ id: "grp", divisionId: "ops", name: "Dispute Department", functions: ["Dispute Processors", "Bureau Calling"] });
    const q1 = department({ id: "q1", divisionId: "ops", name: "Dispute", parentDepartmentId: "grp", sort: 1 });
    const q2 = department({ id: "q2", divisionId: "ops", name: "Complaints & Mailing", parentDepartmentId: "grp", sort: 2 });
    const root = chart({ divisions: [ops], departments: [grp, q1, q2], teams: [] });
    const opsNode = find(root, "CreditOps")!;
    expect(opsNode.children.map((c) => c.label)).toEqual(["Dispute Department"]);
    expect(find(root, "Dispute Department")!.children.map((c) => c.label)).toEqual(["Dispute", "Complaints & Mailing"]);
    expect(find(root, "Dispute Department")!.bullets).toEqual(["Dispute Processors", "Bureau Calling"]);
  });

  it("leaves an engine-only department off the chart", () => {
    const stage = department({ id: "st", divisionId: "ops", name: "Stipulations", showOnChart: false });
    const root = chart({ divisions: [ops], departments: [stage], teams: [] });
    expect(labels(root)).not.toContain("Stipulations");
  });

  it("folds a department's OWN team into the department — no second box for the same unit", () => {
    const d = department({ id: "d", divisionId: "ops", name: "Dispute" });
    const own = team({ id: "own", departmentId: "d", name: "CreditOps Dispute Processing Team", members: [{ userId: "u1", isLead: true }] });
    const named = team({ id: "ally", departmentId: "d", name: "Team Ally", members: [] });
    const root = buildOrgChart({ agencyName: "BES", tree: { divisions: [ops], departments: [d], teams: [own, named] }, positions: [],
      people: [{ userId: "u1", name: "Ivan", title: null }] });
    const dept = find(root, "Dispute")!;
    expect(labels(dept)).not.toContain("CreditOps Dispute Processing Team");
    expect(dept.children.map((c) => c.label)).toEqual(["Ivan", "Team Ally"]);
    expect(dept.detail).toBe("1 person");
  });

  it("draws teams folded so the poster reads first, people on a click", () => {
    const d = department({ id: "d", divisionId: "ops", name: "Dispute" });
    const t = team({ id: "t", departmentId: "d", name: "Processing Team" });
    const root = chart({ divisions: [ops], departments: [d], teams: [t] });
    expect(find(root, "Processing Team")!.defaultCollapsed).toBe(true);
  });
});
