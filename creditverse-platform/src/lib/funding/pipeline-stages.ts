/**
 * The FundingOS pipeline (Dee's design): 17 primary stages in five phases —
 * the spine every funding file moves along — plus the two other axes a file
 * carries, secondary status (disposition) and waiting-on (who owns the next
 * action). Stored as enums (migration 0060); this module is the interface's
 * single copy of the vocabulary and of how departments map onto the spine.
 */
import type { FundingFileStage, FundingSecondaryStatus, FundingWaitingOn } from "@/lib/fulfillment/fundingops-domain";
import type { FundingDepartment } from "@/lib/fulfillment/fundingops-store-types";

export type PipelinePhaseKey = "intake" | "preparation" | "submission" | "decision" | "closing";
export interface PipelineStage { number: number; label: FundingFileStage; phase: PipelinePhaseKey }
export interface PipelinePhase { key: PipelinePhaseKey; label: string; stages: PipelineStage[] }

const stage = (number: number, label: FundingFileStage, phase: PipelinePhaseKey): PipelineStage => ({ number, label, phase });

export const PIPELINE_PHASES: readonly PipelinePhase[] = [
  { key: "intake", label: "Intake", stages: [stage(1, "New Application", "intake"), stage(2, "Application Review", "intake")] },
  { key: "preparation", label: "Preparation", stages: [stage(3, "Document Collection", "preparation"), stage(4, "File Review", "preparation"), stage(5, "Needs Client Action", "preparation"), stage(6, "Ready for Funding Review", "preparation")] },
  { key: "submission", label: "Submission", stages: [stage(7, "Lender Selection", "submission"), stage(8, "Ready for Submission", "submission"), stage(9, "Submitted", "submission")] },
  { key: "decision", label: "Decision", stages: [stage(10, "Lender Review", "decision"), stage(11, "Additional Requirements", "decision"), stage(12, "Conditional Approval", "decision"), stage(13, "Offer Received", "decision"), stage(14, "Offer Accepted", "decision")] },
  { key: "closing", label: "Closing", stages: [stage(15, "Final Approval", "closing"), stage(16, "Funding", "closing"), stage(17, "Funded", "closing")] },
];
export const PIPELINE_STAGES: readonly PipelineStage[] = PIPELINE_PHASES.flatMap((p) => p.stages);
export const stageByLabel = (label: FundingFileStage): PipelineStage => PIPELINE_STAGES.find((s) => s.label === label) ?? PIPELINE_STAGES[0];

export const SECONDARY_STATUSES: readonly FundingSecondaryStatus[] = [
  "Active Funding", "Funded", "Not Funding Ready", "No Current Program Fit", "Endorsed to Readiness", "Client Declined Offer",
  "Lender Declined", "Withdrawn", "Unable to Contact", "Duplicate", "Verification Concern", "Closed", "Renewal Candidate",
];
export const WAITING_ON: readonly FundingWaitingOn[] = ["Client", "Internal Team", "Lender", "Third Party", "Documents", "Approval", "No Action Required"];

/** A file is on the active flow while its disposition is Active Funding (or Funded, which is the end of the flow). */
export const onPipeline = (secondary: FundingSecondaryStatus | undefined): boolean => !secondary || secondary === "Active Funding" || secondary === "Funded";

/**
 * Departments are the team axis (who does the work); the spine is where the
 * file is. A department's queue collects the stages it works. Decided by Dee
 * 2026-09-05: departments stay under the 17-stage spine.
 */
export const DEPARTMENT_STAGES: Record<FundingDepartment, FundingFileStage[]> = {
  "Readiness Review": ["New Application", "Application Review", "Ready for Funding Review"],
  "Document Review": ["Document Collection", "File Review", "Needs Client Action"],
  "Lender Matching": ["Lender Selection", "Ready for Submission"],
  Submissions: ["Submitted", "Lender Review"],
  Stipulations: ["Additional Requirements", "Conditional Approval"],
  Offers: ["Offer Received", "Offer Accepted"],
  "Funded Deals": ["Final Approval", "Funding", "Funded"],
};
export const stagesForDepartment = (department: FundingDepartment): FundingFileStage[] => DEPARTMENT_STAGES[department];

export interface PhaseCount<T> { phase: PipelinePhase; total: number; byStage: Map<number, T[]> }

/** Group files by phase and stage for the board; off-pipeline files (dispositions) are returned apart. */
export function groupByPhase<T extends { stage: FundingFileStage; secondaryStatus?: FundingSecondaryStatus }>(files: T[]): { phases: PhaseCount<T>[]; offPipeline: T[] } {
  const byStage = new Map<number, T[]>();
  const offPipeline: T[] = [];
  for (const f of files) {
    if (!onPipeline(f.secondaryStatus)) { offPipeline.push(f); continue; }
    const n = stageByLabel(f.stage).number;
    (byStage.get(n) ?? byStage.set(n, []).get(n)!).push(f);
  }
  const phases = PIPELINE_PHASES.map((phase) => {
    const m = new Map<number, T[]>();
    let total = 0;
    for (const s of phase.stages) { const rows = byStage.get(s.number) ?? []; m.set(s.number, rows); total += rows.length; }
    return { phase, total, byStage: m };
  });
  return { phases, offPipeline };
}
