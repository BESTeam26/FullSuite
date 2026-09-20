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
  | "agency" | "leadership" | "tier" | "division" | "department" | "team" | "position" | "person";

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
  /** A department's functions — Dee's chart bullets. */
  bullets?: string[];
  /** A division's manager by seat, or "Vacant" — the "Division Managers" row of Dee's poster. */
  manager?: string | null;
  /** Drawn folded until opened, so the chart reads like the poster. */
  defaultCollapsed?: boolean;
  children: OrgNode[];
}

/** A person as the chart names them: who they are and the role they hold. */
export interface OrgChartPerson {
  userId: string;
  name: string;
  /** The seat they hold, else the membership's job title, else null. */
  title: string | null;
}

export interface OrgChartInput {
  agencyName: string;
  tree: OrganizationTree;
  positions: readonly Position[];
  /**
   * Dee, 2026-09-19: "show the person under the role, like the list of names
   * under those team or department… and their role." Team members and
   * department managers are drawn as person nodes; omitted, the chart shows
   * counts only.
   */
  people?: readonly OrgChartPerson[];
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
export function buildOrgChart({ agencyName, tree, positions, people = [] }: OrgChartInput): OrgNode {
  const active = positions.filter((p) => !p.archivedAt);
  const personById = new Map(people.map((p) => [p.userId, p]));
  /* A person under a team: their name, and the role they hold there. A lead
     is said so even when they hold no seat — leading is a fact of the team. */
  const personNode = (scope: string, userId: string, role: string | null): OrgNode | null => {
    const person = personById.get(userId);
    if (!person) return null;
    return {
      id: `person:${scope}:${userId}`,
      kind: "person",
      label: person.name,
      detail: role ?? person.title ?? "Team member",
      recordId: userId,
      children: [],
    };
  };
  const memberRole = (userId: string, isLead: boolean): string | null => {
    const title = personById.get(userId)?.title ?? null;
    if (isLead) return title ? `${title} · Team Lead` : "Team Lead";
    return title;
  };
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

  /* "CreditOps Bureau Calling Team" under the "Bureau Calling" department is
     the department's OWN team, not a second unit (Dee, 2026-09-20: "one is
     CreditOps and one is not — that's incorrect"). A team whose name, minus
     the division's name and the word Team, is the department's name is
     folded into the department: its people hang directly under it. A team
     with a name of its own (Team Ally) stays a team. */
  const echoesDepartment = (teamName: string, departmentName: string, divisionName: string | null): boolean => {
    const strip = (x: string) => x.toLowerCase().replace(/\bteam\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const t = strip(divisionName ? teamName.replace(new RegExp(divisionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "") : teamName);
    const d = strip(departmentName);
    /* "Dispute Processing" is Dispute's own; "Client Success / Support" is
       Client Success's own; a bare "TalentOps Team" is its department's own. */
    return t === "" || t.includes(d) || d.includes(t);
  };
  const divisionNameOf = (divisionId: string | null) => tree.divisions.find((v) => v.id === divisionId)?.name ?? null;

  const teamPeople = (t: OrganizationTree["teams"][number]): OrgNode[] =>
    [...t.members]
      .sort((a, b) => Number(b.isLead) - Number(a.isLead)
        || (personById.get(a.userId)?.name ?? "").localeCompare(personById.get(b.userId)?.name ?? ""))
      .map((m) => personNode(`team:${t.id}`, m.userId, memberRole(m.userId, m.isLead)))
      .filter((n): n is OrgNode => n !== null);

  const departmentNode = (d: OrganizationTree["departments"][number]): OrgNode => {
    const liveTeams = tree.teams.filter((t) => t.departmentId === d.id && live(t));
    const own = liveTeams.filter((t) => echoesDepartment(t.name, d.name, divisionNameOf(d.divisionId)));
    const named = liveTeams.filter((t) => !own.includes(t));
    const teams = named.map<OrgNode>((t) => ({
      id: `team:${t.id}`,
      kind: "team",
      label: t.name,
      detail: `${t.members.length} ${t.members.length === 1 ? "person" : "people"}`,
      recordId: t.id,
      defaultCollapsed: true,
      children: [...teamPeople(t), ...(byTeam.get(t.id) ?? []).map(positionNode)],
    }));
    const ownPeople = own.flatMap((t) => [...teamPeople(t), ...(byTeam.get(t.id) ?? []).map(positionNode)]);
    /* Queue departments grouped under this one (Dee's chart, 2026-09-20). */
    const children = tree.departments
      .filter((c) => c.parentDepartmentId === d.id && live(c) && c.showOnChart)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map(departmentNode);
    const manager = d.managerId ? personNode(`department:${d.id}`, d.managerId, "Department Manager") : null;
    const headcount = own.reduce((n, t) => n + t.members.length, 0);
    return {
      id: `department:${d.id}`,
      kind: "department" as const,
      label: d.name,
      detail: own.length > 0 && children.length === 0 ? `${headcount} ${headcount === 1 ? "person" : "people"}` : undefined,
      recordId: d.id,
      bullets: d.functions.length > 0 ? d.functions : undefined,
      defaultCollapsed: ownPeople.length > 0 && children.length === 0 ? true : undefined,
      children: [...(manager ? [manager] : []), ...children, ...ownPeople, ...teams, ...(byDepartment.get(d.id) ?? []).map(positionNode)],
    };
  };

  const divisionNode = (division: OrganizationTree["divisions"][number]): OrgNode => {
    /* Top-level departments only; grouped ones hang under their parent. */
    const departments = tree.departments
      .filter((d) => d.divisionId === division.id && live(d) && d.showOnChart && !d.parentDepartmentId)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map(departmentNode);

    /* Nested divisions — a division under a division stays a division (§12). */
    const nested = tree.divisions
      .filter((v) => v.parentDivisionId === division.id && live(v))
      .map(divisionNode);

    /* The division's manager, by seat (divisions.lead_id is its projection). */
    const leadName = division.leadId ? personById.get(division.leadId)?.name ?? null : null;
    return {
      id: `division:${division.id}`,
      kind: division.tier === "leadership" ? "leadership" : "division",
      label: division.name,
      detail: division.description ?? null,
      manager: division.tier === "leadership" ? undefined : leadName ?? "Vacant",
      recordId: division.id,
      children: [
        ...(byDivisionOnly.get(division.id) ?? []).map(positionNode),
        ...departments,
        ...nested,
      ],
    };
  };

  /**
   * Leadership is a reporting LINE, not a list: CEO → COO → the corporate
   * seats that report to the COO — and the operating divisions hang under
   * the head of operations (the leadership seat whose title names operations;
   * a title is data, so this follows whatever Dee names it). With no such
   * seat, divisions hang under the company.
   */
  const leadershipChain = (division: OrganizationTree["divisions"][number], operating: OrgNode[]): { nodes: OrgNode[]; attached: boolean } => {
    const seats = byDivisionOnly.get(division.id) ?? [];
    const nodeById = new Map(seats.map((p) => [p.id, positionNode(p)]));
    const opsHead = seats.find((p) => /chief\s+operat/i.test(p.title)) ?? null;
    let attached = false;
    for (const p of seats) {
      const node = nodeById.get(p.id)!;
      const reports = seats.filter((c) => c.reportsToId === p.id).map((c) => nodeById.get(c.id)!);
      node.children = [...node.children, ...reports];
      /* Dee's poster: the divisions hang BENEATH the corporate row, as their
         own tier — not beside the seats. */
      if (opsHead && p.id === opsHead.id && operating.length > 0) {
        node.children = [...node.children, { id: "tier:divisions", kind: "tier", label: "Operating Divisions", detail: "Division Managers", children: operating }];
        attached = true;
      }
    }
    const roots = seats.filter((p) => !p.reportsToId || !nodeById.has(p.reportsToId)).map((p) => nodeById.get(p.id)!);
    const departments = tree.departments
      .filter((d) => d.divisionId === division.id && live(d) && d.showOnChart && !d.parentDepartmentId)
      .map(departmentNode);
    /* The poster has no "Corporate" box: the CEO hangs straight off the
       company. The leadership division is drawn only when it holds
       departments of its own. */
    return {
      nodes: departments.length > 0
        ? [{ id: `division:${division.id}`, kind: "leadership", label: division.name, detail: division.description ?? null, recordId: division.id, children: [...roots, ...departments] }]
        : roots,
      attached,
    };
  };

  const top = tree.divisions.filter((v) => live(v) && !v.parentDivisionId);
  const operating = top.filter((v) => v.tier !== "leadership").map(divisionNode);
  const leadershipDivisions = top.filter((v) => v.tier === "leadership");
  const chains = leadershipDivisions.map((v) => leadershipChain(v, operating));
  const attached = chains.some((c) => c.attached);

  return {
    id: "agency",
    kind: "agency",
    label: agencyName,
    detail: `${operating.length} operating ${operating.length === 1 ? "division" : "divisions"}`,
    children: [
      ...chains.flatMap((c) => c.nodes),
      ...(attached ? [] : operating),
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
