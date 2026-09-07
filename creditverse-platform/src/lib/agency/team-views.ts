/**
 * The BES team's day, sliced the way people actually ask about it.
 *
 * Pure functions over canonical `WorkItem`s: no data access, no React, and no
 * second definition of "overdue". Every view here is a filter over the same
 * rows the work engine already returns, which is what keeps My Work, the team
 * board and the manager's view from disagreeing about the same task.
 */
import type { WorkItem } from "@/lib/bes-domain";

/** A day boundary in the viewer's own timezone — not UTC, which shifts the day. */
export const dayKey = (iso: string | Date): string => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const isToday = (iso?: string | null, today = dayKey(new Date())): boolean =>
  !!iso && dayKey(iso) === today;

/** Past its due time and not finished. A task with no due date is never overdue. */
export const isOverdue = (item: WorkItem, now = Date.now()): boolean =>
  !item.completedAt && !!item.dueAt && new Date(item.dueAt).getTime() < now;

export const isBlocked = (item: WorkItem): boolean => item.stage === "Blocked";

export const isComplete = (item: WorkItem): boolean =>
  item.stage === "Completed" || !!item.completedAt;

export interface MyWorkBuckets {
  dueToday: WorkItem[];
  overdue: WorkItem[];
  upcoming: WorkItem[];
  blocked: WorkItem[];
  completedToday: WorkItem[];
  /** Open, assigned, and none of the above — the ordinary middle. */
  other: WorkItem[];
}

/**
 * One pass, and every item lands in exactly ONE bucket.
 *
 * The order is the order of urgency, and it matters: an overdue task that is
 * also blocked belongs under Blocked, because the blocker is the thing to act
 * on. Listing it twice would double the counts people plan their day from.
 */
export function bucketMyWork(items: WorkItem[], now = Date.now()): MyWorkBuckets {
  const today = dayKey(new Date(now));
  const out: MyWorkBuckets = { dueToday: [], overdue: [], upcoming: [], blocked: [], completedToday: [], other: [] };
  for (const item of items) {
    if (isComplete(item)) {
      if (isToday(item.completedAt, today)) out.completedToday.push(item);
      continue;
    }
    if (isBlocked(item)) { out.blocked.push(item); continue; }
    if (isOverdue(item, now)) { out.overdue.push(item); continue; }
    if (isToday(item.dueAt, today)) { out.dueToday.push(item); continue; }
    if (item.dueAt) { out.upcoming.push(item); continue; }
    out.other.push(item);
  }
  const byDue = (a: WorkItem, b: WorkItem) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
  out.dueToday.sort(byDue); out.overdue.sort(byDue); out.upcoming.sort(byDue);
  return out;
}

export interface ManagerBuckets {
  overdue: WorkItem[];
  blocked: WorkItem[];
  unassigned: WorkItem[];
  dueToday: WorkItem[];
  recentlyCompleted: WorkItem[];
}

/**
 * What a manager needs to act on.
 *
 * `unassigned` is deliberately its own bucket rather than a filter on the
 * others: nobody notices an unassigned task going overdue, because nobody is
 * looking at it.
 */
export function bucketForManager(items: WorkItem[], now = Date.now()): ManagerBuckets {
  const today = dayKey(new Date(now));
  const open = items.filter((i) => !isComplete(i));
  return {
    overdue: open.filter((i) => isOverdue(i, now) && !isBlocked(i)).sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
    blocked: open.filter(isBlocked),
    unassigned: open.filter((i) => !i.assignedTo),
    dueToday: open.filter((i) => !isOverdue(i, now) && !isBlocked(i) && isToday(i.dueAt, today)),
    recentlyCompleted: items.filter((i) => isComplete(i) && isToday(i.completedAt, today)),
  };
}

export interface Workload {
  key: string;
  label: string;
  open: number;
  overdue: number;
  blocked: number;
  dueToday: number;
  completedToday: number;
}

/**
 * How much is on each person, or each team.
 *
 * Counts only, and never ranked as a score. An open-task count says nothing
 * about size, difficulty, or what a person was actually asked to do; a view
 * that sorted people by it would be read as a league table it cannot support.
 */
export function workloadBy(
  items: WorkItem[],
  key: (i: WorkItem) => string | undefined,
  label: (k: string) => string,
  now = Date.now(),
): Workload[] {
  const today = dayKey(new Date(now));
  const map = new Map<string, Workload>();
  const UNASSIGNED = "__none__";
  for (const item of items) {
    const k = key(item) ?? UNASSIGNED;
    const row = map.get(k) ?? { key: k, label: k === UNASSIGNED ? "Unassigned" : label(k), open: 0, overdue: 0, blocked: 0, dueToday: 0, completedToday: 0 };
    if (isComplete(item)) {
      if (isToday(item.completedAt, today)) row.completedToday += 1;
    } else {
      row.open += 1;
      if (isOverdue(item, now)) row.overdue += 1;
      if (isBlocked(item)) row.blocked += 1;
      if (isToday(item.dueAt, today)) row.dueToday += 1;
    }
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => b.open - a.open || a.label.localeCompare(b.label));
}

export type TeamSort = "due" | "priority" | "status" | "assignee" | "title";

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2 };

export function sortItems(items: WorkItem[], by: TeamSort, nameOf: (id?: string) => string): WorkItem[] {
  const copy = [...items];
  switch (by) {
    case "priority":
      /* Then by due date, so two Urgents are not in arbitrary order. */
      return copy.sort((a, b) =>
        (PRIORITY_RANK[a.priority ?? "Normal"] ?? 2) - (PRIORITY_RANK[b.priority ?? "Normal"] ?? 2)
        || (a.dueAt ?? "￿").localeCompare(b.dueAt ?? "￿"));
    case "status": return copy.sort((a, b) => a.stage.localeCompare(b.stage));
    case "assignee": return copy.sort((a, b) => nameOf(a.assignedTo).localeCompare(nameOf(b.assignedTo)));
    case "title": return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "due":
    default:
      /* Undated LAST, not first: an empty string sorts before every date. */
      return copy.sort((a, b) => (a.dueAt ?? "￿").localeCompare(b.dueAt ?? "￿"));
  }
}

export interface TeamFilters {
  assignee?: string | null;
  teamId?: string | null;
  division?: string | null;
  priority?: string | null;
  stage?: string | null;
  includeCompleted?: boolean;
}

export function applyFilters(items: WorkItem[], f: TeamFilters): WorkItem[] {
  return items.filter((i) => {
    if (!f.includeCompleted && isComplete(i)) return false;
    if (f.assignee && i.assignedTo !== f.assignee) return false;
    if (f.teamId && i.teamId !== f.teamId) return false;
    if (f.division && i.division !== f.division) return false;
    if (f.priority && (i.priority ?? "Normal") !== f.priority) return false;
    if (f.stage && i.stage !== f.stage) return false;
    return true;
  });
}
