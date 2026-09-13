/**
 * How the partner's client list is counted and narrowed.
 *
 * Pure, so the four numbers on the summary strip and the rows under them can
 * never disagree: they are the same predicate applied twice. A count computed
 * one way and a table filtered another is how a partner reads "3 waiting" over
 * an empty list.
 */
import type { PartnerPortalClient } from "@/lib/data/agency-partners";

export interface ClientFilters {
  search?: string;
  status?: string | null;
  round?: string | null;
  department?: string | null;
  actionNeeded?: boolean;
  /** One of the summary strip's four buckets. */
  bucket?: ClientBucket | null;
}

export type ClientBucket = "active" | "waiting" | "action" | "closed";

export const BUCKET_LABEL: Record<ClientBucket, string> = {
  active: "Active",
  waiting: "Waiting",
  action: "Action needed",
  closed: "Completed / Archived",
};

const CLOSED = new Set(["completed", "archived", "graduated", "cancelled"]);

/**
 * Which bucket a client sits in. Deliberately exclusive and in this order:
 * a closed file is closed whatever else is true of it, and an action the
 * PARTNER owes outranks BES waiting on somebody else.
 */
export function bucketOf(c: PartnerPortalClient): ClientBucket {
  if (CLOSED.has((c.lifecycle ?? "").toLowerCase())) return "closed";
  if (c.actionNeeded) return "action";
  if (c.waiting) return "waiting";
  return "active";
}

export function bucketCounts(clients: PartnerPortalClient[]): Record<ClientBucket, number> {
  const counts: Record<ClientBucket, number> = { active: 0, waiting: 0, action: 0, closed: 0 };
  for (const c of clients) counts[bucketOf(c)] += 1;
  return counts;
}

export function filterClients(clients: PartnerPortalClient[], f: ClientFilters): PartnerPortalClient[] {
  const q = f.search?.trim().toLowerCase() ?? "";
  return clients.filter((c) => {
    if (f.bucket && bucketOf(c) !== f.bucket) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.round && c.round !== f.round) return false;
    if (f.department && c.currentDepartment !== f.department) return false;
    if (f.actionNeeded && !c.actionNeeded) return false;
    if (!q) return true;
    return [c.name, c.email, c.publicId, c.currentWork, c.actionTitle]
      .some((v) => v?.toLowerCase().includes(q));
  });
}

/** Distinct values present in the rows, so a filter never offers an empty result. */
export const optionsIn = (clients: PartnerPortalClient[], key: "status" | "round" | "currentDepartment"): string[] =>
  [...new Set(clients.map((c) => c[key]).filter((v): v is string => !!v?.trim()))]
    .sort((a, b) => a.localeCompare(b));
