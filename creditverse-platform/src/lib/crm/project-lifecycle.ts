/**
 * Where a BES CRM project sits in its life, read from the record.
 *
 * Derived, never stored as a status: `completed_at` and `archived_at` are the
 * events, and this is the reading of them. A status column would be a second
 * opinion about the same two timestamps, and the two would eventually differ.
 *
 * A project is work underneath a partner's service engagement. None of this
 * says anything about the partner, the engagement, or SaaS tenancy.
 */
export type ProjectLifecycleState = "active" | "completed" | "archived";

interface LifecycleFields {
  completedAt: string | null;
  archivedAt: string | null;
  deletionBlockers: string[];
}

export function lifecycleStateOf(p: Pick<LifecycleFields, "completedAt" | "archivedAt">): ProjectLifecycleState {
  /* Archived wins: a completed build later archived is archived, and reading
     it the other way leaves it in a Completed list nobody is tidying. */
  if (p.archivedAt) return "archived";
  if (p.completedAt) return "completed";
  return "active";
}

export function isActiveProject(p: Pick<LifecycleFields, "completedAt" | "archivedAt">): boolean {
  return lifecycleStateOf(p) === "active";
}

/**
 * Whether permanent deletion is safe.
 *
 * The database decides and returns the reasons; this only reads them. Any one
 * reason is enough — they are things that would be destroyed, not a score.
 */
export function isDeletable(p: Pick<LifecycleFields, "deletionBlockers">): boolean {
  return p.deletionBlockers.length === 0;
}
