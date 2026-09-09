/**
 * The four layers Dee locked on 2026-09-08, as the interface reads them.
 *
 *   PROJECT JOURNEY  where the whole build is: info gathering → planning →
 *                    building → testing → launch → support → complete
 *   ENGINE PROGRESS  how far one purchased engine has got
 *   WORK UNIT STATE  what one person's task is doing right now
 *   QA RESULT        whether the check passed, separately from the status
 *
 * All four are DERIVED in the database and never stored, so nobody can set a
 * project to "testing" while its build work is untouched. This file holds
 * only the labels and ordering the screen needs — the judgements themselves
 * live in `crm_project_journey`, `crm_engine_state` and `crm_work_unit_state`
 * (migration 0222), which is what makes them the same in a report, an EOD and
 * a dashboard.
 */

/* ── Layer 1: the project journey ────────────────────────────────────────── */

export const JOURNEY_STAGES = [
  "info_gathering",
  "planning_designing",
  "building",
  "testing",
  "launch",
  "support",
  "complete",
] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export const JOURNEY_LABEL: Record<JourneyStage, string> = {
  info_gathering: "Gathering information",
  planning_designing: "Planning & designing",
  building: "Building",
  testing: "Testing",
  launch: "Launch",
  support: "Support",
  complete: "Complete",
};

/** How far through the journey a stage sits, for a progress rail. */
export const journeyIndex = (stage: string): number =>
  JOURNEY_STAGES.indexOf(stage as JourneyStage);

/* ── Layer 2: engine state ───────────────────────────────────────────────── */

export type EngineState =
  | "PLANNED"
  | "BUILDING"
  | "QA"
  | "ACTIVE"
  | "SUPPORT"
  | "COMPLETE";

export const ENGINE_STATE_LABEL: Record<EngineState, string> = {
  PLANNED: "Planned",
  BUILDING: "Building",
  QA: "In QA",
  ACTIVE: "Live",
  SUPPORT: "In support",
  COMPLETE: "Complete",
};

/**
 * ACTIVE is not the end. Dee §10: "do not confuse Launch with Completed."
 *
 * An engine goes live for the client, runs through the support period, and
 * only then completes. A screen that treated ACTIVE as done would close
 * projects that still owe three months of support.
 */
export const engineIsFinished = (state: EngineState): boolean =>
  state === "COMPLETE";

/* ── Layer 3: work unit state ────────────────────────────────────────────── */

/* "IN PROGRESS" with a space, exactly as `crm_work_unit_state` returns it.
   Tidying it to IN_PROGRESS here would make every comparison silently false. */
export type WorkUnitState =
  | "PLANNED"
  | "READY"
  | "IN PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "QA"
  | "COMPLETED";

export const WORK_UNIT_LABEL: Record<WorkUnitState, string> = {
  PLANNED: "Planned",
  READY: "Ready",
  "IN PROGRESS": "In progress",
  WAITING: "Waiting",
  BLOCKED: "Blocked",
  QA: "QA",
  COMPLETED: "Completed",
};

/**
 * The order a queue should show them in: what needs a person first, first.
 *
 * BLOCKED outranks WAITING deliberately — both are stopped, but blocked means
 * somebody at BES must act, and waiting means somebody outside must. Putting
 * them together would hide the half that is BES's to fix.
 */
export const WORK_UNIT_URGENCY: Record<WorkUnitState, number> = {
  BLOCKED: 0,
  QA: 1,
  "IN PROGRESS": 2,
  READY: 3,
  WAITING: 4,
  PLANNED: 5,
  COMPLETED: 6,
};

/* ── Layer 4: QA result, which is NOT a status ───────────────────────────── */

/* Lower case, because these are `work_qa_result` values verbatim. The unit
   and engine states above are UPPER case for the opposite reason: they are
   computed by `crm_work_unit_state` and `crm_engine_state`, not stored, and
   the database returns them that way. Matching each source exactly is what
   lets a value be compared without translating it first. */
export type QaResult = "pending" | "passed" | "needs_fix";

export const QA_LABEL: Record<QaResult, string> = {
  pending: "QA pending",
  passed: "QA passed",
  needs_fix: "Needs fix",
};

/* ── Health, and why a project is not fine ───────────────────────────────── */

/* Lower case, as `crm_project_health` returns it. Health is not a grade — it
   names the ONE thing standing in the way, so the reader knows what to do
   rather than how worried to be. */
export type ProjectHealth =
  | "on_track"
  | "at_risk"
  | "blocked"
  | "waiting"
  | "qa"
  | "support";

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
  waiting: "Waiting",
  qa: "In QA",
  support: "In support",
};

/** Health that means somebody at BES should look now. */
export const healthNeedsUs = (health: ProjectHealth): boolean =>
  health === "blocked" || health === "at_risk";

/**
 * Why waiting is stopped, in the words the person reading it needs.
 *
 * The distinction that matters is who has to act. "Waiting on the client" is
 * not a BES failure and chasing it is a different job from unblocking it.
 */
export type WaitingReason =
  | "client"
  | "third_party"
  | "internal"
  | "approval"
  | "external_platform"
  | "other";

export const WAITING_LABEL: Record<WaitingReason, string> = {
  client: "Waiting on the client",
  third_party: "Waiting on a third party",
  internal: "Waiting on BES",
  approval: "Waiting for approval",
  external_platform: "Waiting on an external platform",
  other: "Waiting",
};

/** Who has to move for this to start again. */
export const waitingIsOurs = (reason: WaitingReason): boolean =>
  reason === "internal" || reason === "approval";

/**
 * A single sentence saying what a project needs, or nothing when it needs
 * nothing. The dashboard shows this instead of four separate counters that a
 * reader has to combine themselves.
 */
export const attentionSummary = (counts: {
  blocked: number;
  waitingClient: number;
  inQa: number;
  overdue: number;
}): string | null => {
  const parts: string[] = [];
  if (counts.blocked > 0) parts.push(`${counts.blocked} blocked`);
  if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`);
  if (counts.inQa > 0) parts.push(`${counts.inQa} waiting on QA`);
  if (counts.waitingClient > 0) parts.push(`${counts.waitingClient} waiting on the client`);
  if (parts.length === 0) return null;
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};
