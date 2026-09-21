/**
 * TalentOps workspace tree — pure derivations over the workspaces and items
 * RLS already returned. Nothing here decides who may see what; the database
 * did that before these functions ran (rule 20b: scope is the database's,
 * the registry only decides what is drawn).
 *
 * The three groups in the rail are the three business relationships of
 * rule 16, read off the workspace's OWNER:
 *
 *   MANAGED PROJECTS   a BES-owned workspace for a partner — BES runs the
 *                      project (model 3: fulfillment without SaaS).
 *   BES INTERNAL       a BES-owned workspace with no partner — BES's own work.
 *   OUTSOURCING        a customer organization's OWN workspace, shared with
 *                      BES under a TalentOps engagement — BES people work
 *                      inside the customer's operations (model 2).
 *
 * Dee's 2026-09-21 mockup draws exactly these three headings.
 */
import { isOverdue, type Workspace, type WorkspaceItem } from "@/lib/workspaces/workspace-domain";

export type TreeGroupKey = "managed" | "internal" | "outsourcing";

export const TREE_GROUPS: { key: TreeGroupKey; label: string }[] = [
  { key: "managed", label: "Managed projects" },
  { key: "internal", label: "BES internal" },
  { key: "outsourcing", label: "Outsourcing" },
];

export const GROUP_BADGE: Record<TreeGroupKey, string> = {
  managed: "Client project",
  internal: "BES internal",
  outsourcing: "Shared by organization",
};

export const treeGroupOf = (w: Pick<Workspace, "organizationId" | "partnerGroupId">): TreeGroupKey =>
  w.organizationId ? "outsourcing" : w.partnerGroupId ? "managed" : "internal";

/** Whose workspace this is, for the rail's second line and the header badge. */
export const workspaceOwnerLabel = (w: Workspace): string =>
  w.organizationName ?? w.partnerName ?? (w.organizationId ? "Organization" : w.partnerGroupId ? "Partner" : "BES");

export interface TreeGroup {
  key: TreeGroupKey;
  label: string;
  workspaces: Workspace[];
}

/** Workspaces under their heading, A→Z inside each; a heading with nothing under it is dropped. */
export function groupWorkspaces(workspaces: Workspace[]): TreeGroup[] {
  const byGroup = new Map<TreeGroupKey, Workspace[]>(TREE_GROUPS.map((g) => [g.key, []]));
  for (const w of workspaces) byGroup.get(treeGroupOf(w))!.push(w);
  return TREE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    workspaces: (byGroup.get(g.key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.workspaces.length > 0);
}

/* ------------------------------------------------------------------ */
/* MY WORK                                                              */
/* ------------------------------------------------------------------ */

export type MyWorkView = "assigned" | "today" | "overdue" | "starred";

export const MY_WORK_VIEWS: { key: MyWorkView; label: string }[] = [
  { key: "assigned", label: "Assigned to me" },
  { key: "today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
  { key: "starred", label: "Starred" },
];

const sameLocalDay = (iso: string, now: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

/** An item still open: no completion stamp. The engine's own definition. */
const isOpen = (i: WorkspaceItem) => !i.completedAt;

/**
 * The items one MY WORK view lists. "Assigned to me", "Due today" and
 * "Overdue" are about MY open work; "Starred" is whatever I starred, open or
 * not, because a star is a bookmark and not a to-do.
 */
export function myWorkItems<T extends WorkspaceItem>(
  view: MyWorkView,
  items: T[],
  meId: string | null,
  starred: ReadonlySet<string>,
  now = new Date(),
): T[] {
  switch (view) {
    case "assigned":
      return items.filter((i) => isOpen(i) && !!meId && i.assignedTo === meId);
    case "today":
      return items.filter((i) => isOpen(i) && !!meId && i.assignedTo === meId && !!i.dueAt && sameLocalDay(i.dueAt, now));
    case "overdue":
      return items.filter((i) => !!meId && i.assignedTo === meId && isOverdue(i, now.getTime()));
    case "starred":
      return items.filter((i) => starred.has(i.id));
  }
}

export const myWorkCounts = <T extends WorkspaceItem>(items: T[], meId: string | null, starred: ReadonlySet<string>, now = new Date()) =>
  Object.fromEntries(MY_WORK_VIEWS.map((v) => [v.key, myWorkItems(v.key, items, meId, starred, now).length])) as Record<MyWorkView, number>;

/* ------------------------------------------------------------------ */
/* List toolbar — filter, sort, search                                  */
/* ------------------------------------------------------------------ */

export type ListSort = "due" | "priority" | "created";
export type AssigneeFilter = "all" | "me" | "unassigned";

export interface ListQuery {
  search: string;
  assignee: AssigneeFilter;
  priority: "all" | "Urgent" | "High" | "Normal";
  sort: ListSort;
}

export const DEFAULT_LIST_QUERY: ListQuery = { search: "", assignee: "all", priority: "all", sort: "due" };

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2 };

/** Filter then order. Items without a due date sort after every dated one; ties fall back to creation order. */
export function applyListQuery<T extends WorkspaceItem>(items: T[], q: ListQuery, meId: string | null): T[] {
  const needle = q.search.trim().toLowerCase();
  const kept = items.filter((i) => {
    if (needle && !i.title.toLowerCase().includes(needle) && !(i.description ?? "").toLowerCase().includes(needle)) return false;
    if (q.assignee === "me" && (!meId || i.assignedTo !== meId)) return false;
    if (q.assignee === "unassigned" && i.assignedTo) return false;
    if (q.priority !== "all" && i.priority !== q.priority) return false;
    return true;
  });
  const by: Record<ListSort, (a: T, b: T) => number> = {
    due: (a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || a.createdAt.localeCompare(b.createdAt),
    priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || a.createdAt.localeCompare(b.createdAt),
    created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  };
  return [...kept].sort(by[q.sort]);
}
