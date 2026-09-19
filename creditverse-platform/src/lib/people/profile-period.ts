/**
 * The Agent Profile's "Current Period" facts, as pure functions over the
 * canonical work items and production logs. Counts and rates only — no
 * target is invented (Dee, decision 7).
 */
import type { DateRange } from "./overview-metrics";

export interface WorkLike {
  assignedTo?: string;
  completedAt?: string;
  dueAt?: string;
  stage: string;
  archivedAt?: string | null;
}

export interface PeriodWorkStats {
  /** Work items completed in the period. */
  completed: number;
  /** Of those with a due date, the share completed on or before it — null when none had one. */
  onTimePct: number | null;
  /** Open items past their due date today. */
  overdue: number;
  /** Open items assigned to the person today — the backlog. */
  backlog: number;
}

const inRange = (day: string, r: DateRange) => day >= r.from && day <= r.to;

export function periodWorkStats(items: readonly WorkLike[], userId: string, range: DateRange, today: string): PeriodWorkStats {
  const mine = items.filter((w) => w.assignedTo === userId);
  const done = mine.filter((w) => !!w.completedAt && inRange(w.completedAt.slice(0, 10), range));
  const withDue = done.filter((w) => !!w.dueAt);
  const onTime = withDue.filter((w) => w.completedAt!.slice(0, 10) <= w.dueAt!.slice(0, 10)).length;
  const open = mine.filter((w) => !w.completedAt && w.stage !== "Completed");
  return {
    completed: done.length,
    onTimePct: withDue.length === 0 ? null : Math.round((onTime / withDue.length) * 100),
    overdue: open.filter((w) => !!w.dueAt && w.dueAt.slice(0, 10) < today).length,
    backlog: open.length,
  };
}

export interface ProductionLogLike { workDate: string; actions: readonly string[] }

/** Files (logs) and rounds completed in the period, from production logs. */
export function periodProduction(logs: readonly ProductionLogLike[], range: DateRange): { files: number; rounds: number; actions: number } {
  const mine = logs.filter((l) => inRange(l.workDate, range));
  return {
    files: mine.length,
    rounds: mine.filter((l) => l.actions.includes("Round Processing Completed")).length,
    actions: mine.reduce((s, l) => s + l.actions.length, 0),
  };
}
