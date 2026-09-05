/**
 * FundingOps dashboard metrics — deterministic sums and counts over live rows
 * (Dee's Operations Dashboard: Total Requested, Total Approved, Funded This
 * Month, Active Lenders; files by stage; lender distribution). Nothing here
 * projects or forecasts; "approved" means offers a lender actually made that
 * are still open or accepted.
 */
import type { QueueFile } from "@/lib/funding/action-queues";
import { PIPELINE_STAGES } from "@/lib/funding/pipeline-stages";

export interface OfferSignal { fileId: string; status: string; amount: number | null }
export interface FundedSignal { gross: number; fundedAt: string }
export interface SubmissionSignal { fileId: string; lender: string; status: string }

const OPEN_OFFER = new Set(["received", "internal_review", "ready_to_present", "presented", "client_considering", "client_accepted"]);
const OPEN_SUBMISSION = new Set(["Submitted", "In Review", "Stipulations", "Offer Received"]);

export const activeFiles = (files: QueueFile[]) => files.filter((f) => f.secondaryStatus === "Active Funding");
export const totalRequested = (files: QueueFile[]) => activeFiles(files).reduce((s, f) => s + (Number.isFinite(f.requestedAmount) ? f.requestedAmount : 0), 0);
/** Offers a lender made that are still on the table or accepted — the amount as the lender stated it. */
export const totalApproved = (offers: OfferSignal[]) => offers.filter((o) => OPEN_OFFER.has(o.status) && o.amount !== null).reduce((s, o) => s + (o.amount as number), 0);
export function fundedInMonth(funded: FundedSignal[], now: Date): number {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  return funded.filter((f) => { const d = new Date(f.fundedAt); return d.getUTCFullYear() === y && d.getUTCMonth() === m; }).reduce((s, f) => s + f.gross, 0);
}
/** Lenders with at least one open submission. */
export const activeLenders = (submissions: SubmissionSignal[]) => new Set(submissions.filter((d) => OPEN_SUBMISSION.has(d.status)).map((d) => d.lender)).size;

/** One bar per stage of the 17-step spine, in order, active files only. */
export function filesByStage(files: QueueFile[]): { stage: string; number: number; count: number }[] {
  const active = activeFiles(files);
  return PIPELINE_STAGES.map((s) => ({ stage: s.label, number: s.number, count: active.filter((f) => f.stage === s.label).length }));
}
/** Open submissions per lender, most first — operational load, never a ranking of lenders. */
export function lenderDistribution(submissions: SubmissionSignal[]): { lender: string; count: number }[] {
  const by = new Map<string, number>();
  for (const d of submissions) if (OPEN_SUBMISSION.has(d.status)) by.set(d.lender, (by.get(d.lender) ?? 0) + 1);
  return [...by.entries()].map(([lender, count]) => ({ lender, count })).sort((a, b) => b.count - a.count || a.lender.localeCompare(b.lender));
}

/** Compact money for KPI tiles: $2.21M, $240,000, $45,500. */
export function formatCompactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
