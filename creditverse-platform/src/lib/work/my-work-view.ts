/**
 * My Work, as a person reads it on a phone.
 *
 * Dee's production spec, 2026-09-21: "only personally assigned actionable
 * work · waiting work excluded · simple due/SLA language · open the client or
 * work item in one tap." This module is the deciding part — what counts as
 * mine to act on now, what it is called, and where tapping it goes — kept out
 * of the component so it can be tested and cannot drift between the phone and
 * the desktop table (rule 5).
 *
 * It decides nothing about VISIBILITY: every item here was already returned to
 * this person by `fetchMyWork`, which asks only for `assigned_to = me`.
 */
import type { WorkItem } from "@/lib/bes-domain";

/**
 * Waiting on somebody else, so not on today's list.
 *
 * Only `Blocked`. A blocked item has a reason recorded against it
 * (`work_item_blockers`) and the next move belongs to whoever clears it.
 * Everything else assigned to a person is theirs to move — `Attention` most
 * of all, which exists to say somebody must act.
 */
export const isWaiting = (item: Pick<WorkItem, "stage">) => item.stage === "Blocked";

/** Done is not "my work"; the engine stamps `completedAt` when it is. */
export const isOpen = (item: Pick<WorkItem, "completedAt">) => !item.completedAt;

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole days between two instants, by calendar day rather than by 24-hour blocks. */
export const daysUntil = (dueAt: string, now: Date): number =>
  Math.round((startOfDay(new Date(dueAt)) - startOfDay(now)) / DAY);

/**
 * When it is due, in words somebody can act on.
 *
 * "SLA (hrs) 3.4" is a number the reader has to convert; "Due today" is not.
 * Hours only appear inside the last day, where they are the point.
 */
export function dueLabel(dueAt: string | null | undefined, now: Date = new Date()): string {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "No due date";
  const days = daysUntil(dueAt, now);
  if (days < 0) return days === -1 ? "Overdue by a day" : `Overdue by ${Math.abs(days)} days`;
  if (days === 0) {
    const hours = Math.floor((due.getTime() - now.getTime()) / 3_600_000);
    if (due.getTime() < now.getTime()) return "Overdue today";
    if (hours < 1) return "Due within the hour";
    return hours === 1 ? "Due in an hour" : `Due in ${hours} hours`;
  }
  if (days === 1) return "Due tomorrow";
  if (days <= 6) return `Due ${due.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

export function dueTone(dueAt: string | null | undefined, now: Date = new Date()): DueTone {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  const days = daysUntil(dueAt, now);
  if (days < 0 || (days === 0 && due.getTime() < now.getTime())) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "later";
}

export type MyWorkGroupKey = "overdue" | "today" | "soon" | "later" | "waiting";

export const GROUP_LABEL: Record<MyWorkGroupKey, string> = {
  overdue: "Overdue",
  today: "Due today",
  soon: "Next few days",
  later: "Later",
  waiting: "Waiting on someone else",
};

export interface MyWorkGroup<T> { key: MyWorkGroupKey; label: string; items: T[] }

/**
 * The day's order: what is late, what is due now, then the rest — and waiting
 * work last and apart, so it is visible without being confused with a task.
 * Undated work sorts after dated work inside its group; the oldest first,
 * because it has been waiting longest.
 */
export function groupMyWork<T extends Pick<WorkItem, "stage" | "dueAt" | "completedAt" | "createdAt">>(
  items: readonly T[],
  now: Date = new Date(),
): MyWorkGroup<T>[] {
  const open = items.filter(isOpen);
  const buckets: Record<MyWorkGroupKey, T[]> = { overdue: [], today: [], soon: [], later: [], waiting: [] };
  for (const item of open) {
    if (isWaiting(item)) { buckets.waiting.push(item); continue; }
    const tone = dueTone(item.dueAt, now);
    buckets[tone === "none" ? "later" : tone].push(item);
  }
  const byDue = (a: T, b: T) => {
    const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    return ad - bd || String(a.createdAt).localeCompare(String(b.createdAt));
  };
  return (["overdue", "today", "soon", "later", "waiting"] as MyWorkGroupKey[])
    .map((key) => ({ key, label: GROUP_LABEL[key], items: [...buckets[key]].sort(byDue) }))
    .filter((g) => g.items.length > 0);
}

/** What the headline counts: work this person can act on, waiting excluded. */
export const actionableCount = <T extends Pick<WorkItem, "stage" | "completedAt">>(items: readonly T[]) =>
  items.filter((i) => isOpen(i) && !isWaiting(i)).length;

/**
 * Where one tap goes.
 *
 * The record, not a list that highlights it: a workspace item opens its
 * workspace, a CreditOps file opens the client, a funding file opens theirs.
 * Null means there is no better destination than the page they are on, and
 * the row is then not a link — an inert link that pretends to lead somewhere
 * is worse than plain text (rule 12: no dead controls).
 */
export function workHref(
  item: Pick<WorkItem, "relatedType" | "relatedId" | "workspaceId">,
  viewMode: "agency" | "organization" = "agency",
): string | null {
  if (item.workspaceId) return `/app/talentops?ws=${encodeURIComponent(item.workspaceId)}`;
  if (!item.relatedId) return null;
  const id = encodeURIComponent(item.relatedId);
  switch (item.relatedType) {
    case "fulfillment":
    case "credit_case":
      return viewMode === "agency" ? `/app/creditops?client=${id}` : `/app/operations?client=${id}`;
    case "funding_deal":
      return viewMode === "agency" ? `/app/fundingops?client=${id}` : `/app/funding-workspace?client=${id}`;
    case "project":
      return `/app/bes-crm?project=${id}`;
    default:
      return null;
  }
}
