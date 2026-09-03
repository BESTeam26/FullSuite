/**
 * Client list filtering and sorting.
 *
 * The Main Client List in every division narrows the same way — partner scope,
 * assigned-to-me, status, free-text search — and sorts on the same common
 * fields. Only the division-specific columns (dispute round / open items vs
 * open files / requested amount) need their own comparison value, which the
 * caller supplies.
 *
 * This is list logic rather than presentation, so it lives in the domain layer
 * and can be unit-tested without rendering a table (rules 5 and 13).
 */

import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";
import { clientGroupLabel } from "@/lib/fulfillment/ops-client-domain";

export interface ClientListFilters {
  /** Partner scope key, or "all" for the cross-partner management view. */
  selectedScope: string;
  /** Free-text match against name, email and partner label. */
  search: string;
  /** Exact status match, or the "all" sentinel to disable. */
  statusFilter: string;
  /** Sentinel meaning "no status filter", e.g. "All Statuses". */
  allStatusesLabel: string;
  /** Restrict to the signed-in agent's own clients. */
  assignedOnly: boolean;
  /** Whose clients "assigned to me" means. */
  currentAgent: string;
}

export interface ClientListSort<T extends OpsClient> {
  field: string;
  direction: "asc" | "desc";
  /**
   * Comparison value for a division-specific column. Return undefined to fall
   * back to the shared handling.
   */
  extraSortValue?: (client: T, field: string) => string | number | undefined;
}

const matchesScope = <T extends OpsClient>(c: T, scope: string): boolean =>
  scope === "all" ||
  c.organizationId === scope ||
  c.outsourcingGroupId === scope;

const matchesSearch = <T extends OpsClient>(c: T, search: string): boolean => {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    c.name.toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q) ||
    clientGroupLabel(c).toLowerCase().includes(q)
  );
};

/** Comparison value for the fields every division shares. */
const sharedSortValue = <T extends OpsClient>(
  c: T,
  field: string,
): string | number | undefined => {
  switch (field) {
    case "client":
      return c.name;
    case "email":
      return c.email;
    case "status":
      return c.status;
    case "agent":
      return c.assignedAgent ?? "Unassigned";
    case "sla":
      // Clients with no SLA sort last rather than first.
      return c.slaHoursRemaining ?? 9999;
    case "lastActivity":
      return c.lastActivity;
    default:
      return undefined;
  }
};

export function filterAndSortClients<T extends OpsClient>(
  clients: T[],
  filters: ClientListFilters,
  sort: ClientListSort<T>,
): T[] {
  const list = clients.filter((c) => {
    if (!matchesScope(c, filters.selectedScope)) return false;
    if (filters.assignedOnly && c.assignedAgent !== filters.currentAgent)
      return false;
    if (
      filters.statusFilter !== filters.allStatusesLabel &&
      c.status !== filters.statusFilter
    )
      return false;
    return matchesSearch(c, filters.search);
  });

  const dir = sort.direction === "asc" ? 1 : -1;
  const valueOf = (c: T): string | number =>
    sort.extraSortValue?.(c, sort.field) ??
    sharedSortValue(c, sort.field) ??
    c.name;

  return [...list].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

/** Clients still counted as active work for the list's "N Active" chip. */
export const countActive = <T extends OpsClient>(
  clients: T[],
  inactiveStatuses: readonly string[],
): number => clients.filter((c) => !inactiveStatuses.includes(c.status)).length;
