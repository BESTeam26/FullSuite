/**
 * The Agent EOD Submission View, as rules (Dee, 2026-10-01):
 *
 *   production is auto-pulled from canonical work records, never typed;
 *   submitting locks the snapshot; the agent types only what the system
 *   cannot know — blockers, follow-ups, notes.
 *
 * Everything here is pure so the page is layout and these are tested.
 */
import type { EodActivity, EodSubmissionRow } from "@/lib/data/eod-day";

export interface ProductionTile { label: string; value: number }

/**
 * The headline tiles: files worked, then the day's most-ticked actions.
 * Files and actions are never summed (one file may hold many actions).
 */
export function productionTiles(activity: Pick<EodActivity, "filesWorked" | "actionBreakdown">, max = 5): ProductionTile[] {
  const tiles: ProductionTile[] = [{ label: activity.filesWorked === 1 ? "Client File Worked" : "Client Files Worked", value: activity.filesWorked }];
  for (const a of activity.actionBreakdown.slice(0, Math.max(0, max - 1))) tiles.push({ label: a.action, value: a.count });
  return tiles;
}

const MONTH = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_NAME = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

/**
 * "October 2026", and — only in the first scored month — the reminder that
 * the month before it was the testing phase (Dee, 2026-09-30).
 */
export function scoringPeriod(date: string, scoringStartsOn: string | null): { period: string; note: string | null } {
  const month = date.slice(0, 7);
  const period = MONTH(month);
  if (!scoringStartsOn || scoringStartsOn.slice(0, 7) !== month) return { period, note: null };
  const [y, m] = month.split("-").map(Number);
  const before = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  return { period, note: `${MONTH_NAME(before)} was a testing phase and is not scored.` };
}

/** "Due today by 7:00 PM" from the agency's cutoff ("19:00:00"); null without one. */
export function eodDueLabel(cutoffLocal: string | null): string | null {
  if (!cutoffLocal) return null;
  const [h, m] = cutoffLocal.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `Due today by ${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export type SubmissionLock =
  | { state: "open"; headline: "Not Submitted" }
  | { state: "clarify"; headline: "Follow-up asked"; note: string | null }
  | { state: "locked"; headline: "Submitted" | "Auto-submitted"; at: string | null };

/**
 * Whether the agent may still type. A submitted EOD is locked: it is the
 * record the team lead received. The one way back in is the lead asking a
 * question (needs_clarification), which reopens it for an answer.
 */
export function submissionLock(row: Pick<EodSubmissionRow, "state" | "submittedAt" | "autoSubmitted" | "reviewNote"> | null | undefined): SubmissionLock {
  if (!row || !row.submittedAt) return { state: "open", headline: "Not Submitted" };
  if (row.state === "needs_clarification") return { state: "clarify", headline: "Follow-up asked", note: row.reviewNote ?? null };
  return { state: "locked", headline: row.autoSubmitted ? "Auto-submitted" : "Submitted", at: row.submittedAt };
}
