/**
 * The latest correction per day, in the shape the engine takes.
 *
 * Append-only means a day can carry several; the most recent decision stands,
 * the earlier ones remain as history. Pure and alias-free so the quarter-close
 * sweep uses the same rule as the browser.
 */
import type { Correction } from "./attendance-score.ts";

export interface CorrectionRowLike {
  userId: string;
  workDate: string;
  classification: Correction["to"];
  reason: string;
  decidedByName: string | null;
  decidedAt: string;
}

export function latestPerDay(rows: readonly CorrectionRowLike[], userId: string): Correction[] {
  const byDay = new Map<string, Correction>();
  /* Rows arrive oldest-first from the query; a later row for the same day
     overwrites, which is what "latest stands" means. Sorted here too so the
     rule does not depend on the caller's ORDER BY. */
  const mine = rows.filter((r) => r.userId === userId)
    .slice().sort((a, b) => (a.decidedAt < b.decidedAt ? -1 : 1));
  for (const r of mine) {
    byDay.set(r.workDate, {
      day: r.workDate, to: r.classification, reason: r.reason,
      by: r.decidedByName ?? "a manager", at: r.decidedAt,
    });
  }
  return [...byDay.values()];
}
