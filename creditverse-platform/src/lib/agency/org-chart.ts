/**
 * The org chart, assembled from canonical records.
 *
 * Dee, §16: "Do NOT hard-code JSON. Generate from canonical records."
 *
 * So this takes the division/department/team tree and the position list —
 * both straight from the database — and builds the node tree a renderer
 * walks. It is a pure function because the interesting parts are structural
 * and none of them need a browser:
 *
 *   leadership sits ABOVE the operating divisions, not beside them (§10);
 *   FundingOps nests under CreditOps without becoming a department (§12);
 *   a position with no department hangs off its division;
 *   a position with a team hangs off that team;
 *   a vacancy is a node, not an omission (§7);
 *   acting coverage shows on the seat it covers, not as a second seat (§8).
 *
 * Every one of those is a test rather than something to notice in review.
 */
import type { OrganizationTree } from "@/lib/data/organization-structure";
import type { Position } from "@/lib/data/positions";

export type OrgNodeKind =
  | "agency" | "leadership" | "division" | "department" | "team" | "position";

export interface OrgNode {
  id: string;
  kind: OrgNodeKind;
  label: string;
  /** What to say under the label: a holder, "Vacant", a count. */
  detail?: string | null;
  /** Present on a position node, so a click can open the real record. */
  recordId?: string;
  state?: Position["state"];
  coverage?: string | null;
  children: OrgNode[];
}

export interface OrgChartInput {
  agencyName: string;
  tree: OrganizationTree;
  positions: readonly Position[];
}

const live = <T extends { archived?: boolean; archivedAt?: string | null }>(x: T) =>
  !x.archived && !x.archivedAt;

function positionNode(p: Position): OrgNode {
  const detail =
    p.state === "filled"
      ? p.holders.map((h) => h.name).join(", ")
      : p.state === "covered"
        ? "Vacant"
        : p.headcount > 1
          ? `Vacant · ${p.headcount} seats`
          : "Vacant";
  return {
    id: `position:${p.id}`,
    kind: "position",
    label: p.title,
    detail,
    recordId: p.id,
    state: p.state,
    /* §8: the cover shows ON the seat it covers. A second node would read as
       a second job that does not exist. */
    coverage: p.coverage.length > 0
      ? p.coverage.map((c) => `${c.name} (${c.type})`).join(", ")
      : null,
    children: [],
  };
}

/**
 * BLESSED EMPIRE SERVICES → Company Leadership → operating divisions → …
 *
 * Leadership is its own child of the agency and is listed FIRST, which is
 * what §10 means by "above or outside the three operating Divisions" — it is
 * never counted among them and never rendered as a fourth.
 */
export function buildOrgChart({ agencyName, tree, positions }: OrgChartInput): OrgNode {
  const active = positions.filter((p) => !p.archivedAt);
  const byDepartment = new Map<string, Position[]>();
  const byTeam = new Map<string, Position[]>();
  const byDivisionOnly = new Map<string, Position[]>();
  const unplaced: Position[] = [];

  for (const p of active) {
    if (p.teamId) {
      byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
    } else if (p.departmentId) {
      byDepartment.set(p.departmentId, [...(byDepartment.get(p.departmentId) ?? []), p]);
    } else if (p.divisionId) {
      byDivisionOnly.set(p.divisionId, [...(byDivisionOnly.get(p.divisionId) ?? []), p]);
    } else {
      unplaced.push(p);
    }
  }

  const divisionNode = (division: OrganizationTree["divisions"][number]): OrgNode => {
    const departments = tree.departments
      .filter((d) => d.divisionId === division.id && live(d))
      .map((d) => {
        const teams = tree.teams
          .filter((t) => t.departmentId === d.id && live(t))
          .map<OrgNode>((t) => ({
            id: `team:${t.id}`,
            kind: "team",
            label: t.name,
            detail: `${t.members.length} ${t.members.length === 1 ? "person" : "people"}`,
            recordId: t.id,
            children: (byTeam.get(t.id) ?? []).map(positionNode),
          }));
        return {
          id: `department:${d.id}`,
          kind: "department" as const,
          label: d.name,
          recordId: d.id,
          children: [...teams, ...(byDepartment.get(d.id) ?? []).map(positionNode)],
        };
      });

    /* Nested divisions — FundingOps under CreditOps (§12). */
    const nested = tree.divisions
      .filter((v) => v.parentDivisionId === division.id && live(v))
      .map(divisionNode);

    return {
      id: `division:${division.id}`,
      kind: division.tier === "leadership" ? "leadership" : "division",
      label: division.name,
      detail: division.description ?? null,
      recordId: division.id,
      children: [
        ...(byDivisionOnly.get(division.id) ?? []).map(positionNode),
        ...departments,
        ...nested,
      ],
    };
  };

  const top = tree.divisions.filter((v) => live(v) && !v.parentDivisionId);
  const leadership = top.filter((v) => v.tier === "leadership").map(divisionNode);
  const operating = top.filter((v) => v.tier !== "leadership").map(divisionNode);

  return {
    id: "agency",
    kind: "agency",
    label: agencyName,
    detail: `${operating.length} operating ${operating.length === 1 ? "division" : "divisions"}`,
    children: [
      ...leadership,
      ...operating,
      ...(unplaced.length > 0
        ? [{
            id: "unplaced",
            kind: "department" as const,
            label: "Not yet placed",
            detail: "Seats with no division — place them in Manage structure",
            children: unplaced.map(positionNode),
          }]
        : []),
    ],
  };
}

/** How many seats, and how many of them nobody is in. Derived for the header. */
export function countSeats(positions: readonly Position[]): {
  total: number; filled: number; covered: number; vacant: number;
} {
  const active = positions.filter((p) => !p.archivedAt);
  return {
    total: active.length,
    filled: active.filter((p) => p.state === "filled").length,
    covered: active.filter((p) => p.state === "covered").length,
    vacant: active.filter((p) => p.state === "vacant").length,
  };
}
