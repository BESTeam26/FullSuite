/**
 * Partner hooks — dual-mode, matching the other `use-*` hooks.
 *
 * live → organizations + outsourcing groups from the database.
 * demo → the division's hardcoded partner constants.
 *
 * The constants stay as the demo fallback so the workspace is still explorable
 * without a backend, but a live session must never navigate by them: their
 * scope ids are invented, and a client attached to one could not be saved.
 *
 * Composed from the canonical cached queries rather than a private fetch.
 * `["organizations", userId]` is the same key the agency context uses and
 * `["fulfillment","engagements"]` the same one `useFulfillment` uses, so
 * TanStack serves one request each no matter how many panels ask (rule 14).
 * The previous `fetchPartners` opened a second path to both tables, which is
 * why the ops routes read `organizations` and `fulfillment_engagements` twice.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { fetchOrganizations } from "@/lib/data/organizations";
import {
  buildPartners,
  fetchOutsourcingGroups,
  type PartnerProduct,
} from "@/lib/data/partners";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import type { DataSource } from "@/lib/data/use-work";

export interface PartnersResult {
  partners: OpsPartner[];
  source: DataSource;
  isLoading: boolean;
  error: string | null;
  /** Resolve a scope id back to its partner, for headers and breadcrumbs. */
  byScope: (scopeId: string) => OpsPartner | undefined;
}

export function usePartners(
  product: PartnerProduct,
  demoFallback: OpsPartner[],
): PartnersResult {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const userId = auth.user?.id ?? "";

  /* Shared with the agency context under the identical key — one request. */
  const orgsQ = useQuery({
    queryKey: ["organizations", userId],
    queryFn: () => fetchOrganizations(userId),
    enabled: live,
    staleTime: 30_000,
  });

  const groupsQ = useQuery({
    queryKey: ["outsourcing-groups"],
    queryFn: fetchOutsourcingGroups,
    enabled: live,
    // Partners change rarely; a longer window keeps the tree off the wire on
    // every navigation (rule 14).
    staleTime: 5 * 60_000,
  });

  /* The canonical engagement cache. Not re-fetched here. */
  const fulfillment = useFulfillment();

  const livePartners = useMemo(
    () =>
      buildPartners(
        product,
        orgsQ.data ?? [],
        groupsQ.data ?? [],
        fulfillment.engagements,
      ),
    [product, orgsQ.data, groupsQ.data, fulfillment.engagements],
  );

  const partners = live ? livePartners : demoFallback;
  const error =
    (orgsQ.error as Error | null)?.message ??
    (groupsQ.error as Error | null)?.message ??
    fulfillment.error ??
    null;

  return {
    partners,
    source: live ? "live" : "demo",
    isLoading: live
      ? orgsQ.isLoading || groupsQ.isLoading || fulfillment.isLoading
      : false,
    error: live ? error : null,
    byScope: (scopeId) => partners.find((p) => p.scopeId === scopeId),
  };
}
