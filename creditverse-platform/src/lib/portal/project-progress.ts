/**
 * A partner's build, as the partner reads it (Dee, 2026-10-01,
 * PARTNER_PORTAL_DOCTRINE.md: Projects & Services shows "progress ·
 * milestones · deliverables · approvals needed").
 *
 * Pure shaping over what the partner-scoped functions return — nothing here
 * decides visibility. `my_partner_project_engines()` gives counts per engine,
 * `my_partner_milestones()` only what BES published.
 */

export type EngineStage = "not_started" | "in_progress" | "complete";

export interface PartnerProjectEngine {
  projectId: string;
  engineKey: string;
  label: string;
  units: number;
  completed: number;
  /** null when the engine holds no work yet — not "0% done". */
  percent: number | null;
  stage: EngineStage;
}

export interface PartnerMilestone {
  id: string;
  projectId: string;
  label: string;
  engineLabel: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  linkUrl: string | null;
}

export const ENGINE_STAGE_LABEL: Record<EngineStage, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export interface ProjectMilestones {
  /** Reached, newest first. */
  reached: PartnerMilestone[];
  /** Still to come, soonest first. */
  upcoming: PartnerMilestone[];
  /** Reached milestones BES attached something to — what was delivered. */
  deliverables: PartnerMilestone[];
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);

export function milestonesFor(projectId: string, all: readonly PartnerMilestone[]): ProjectMilestones {
  const mine = all.filter((m) => m.projectId === projectId);
  const reached = mine.filter((m) => m.completedAt).sort((a, b) => time(b.completedAt) - time(a.completedAt));
  const upcoming = mine.filter((m) => !m.completedAt).sort((a, b) => time(a.scheduledAt) - time(b.scheduledAt));
  return { reached, upcoming, deliverables: reached.filter((m) => !!m.linkUrl) };
}

export const enginesFor = (projectId: string, all: readonly PartnerProjectEngine[]) =>
  all.filter((e) => e.projectId === projectId);

/** Kinds on Actions Needed that are about a build or an approval, not a client file. */
const PROJECT_ACTION_SOURCES = new Set(["requirement", "signature_request"]);
const PROJECT_ACTION_KINDS = new Set(["approval", "project_approval", "information_request"]);
export const isProjectAction = (a: { source: string; kind: string }) =>
  PROJECT_ACTION_SOURCES.has(a.source) || PROJECT_ACTION_KINDS.has(a.kind);
