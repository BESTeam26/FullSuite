/**
 * Partner hooks — dual-mode, matching the other `use-*` hooks.
 *
 * live → organizations + outsourcing groups from the database.
 * demo → the division's hardcoded partner constants.
 *
 * The constants stay as the demo fallback so the workspace is still explorable
 * without a backend, but a live session must never navigate by them: their
 * scope ids are invented, and a client attached to one could not be saved.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchPartners, type PartnerProduct } from "@/lib/data/partners";
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

  const q = useQuery({
    queryKey: ["partners", product],
    queryFn: () => fetchPartners(product),
    enabled: live,
    // Partners change rarely; a longer window keeps the tree off the wire on
    // every navigation (rule 14).
    staleTime: 5 * 60_000,
  });

  const partners = live ? (q.data ?? []) : demoFallback;
  return {
    partners,
    source: live ? "live" : "demo",
    isLoading: live ? q.isLoading : false,
    error: live ? ((q.error as Error | null)?.message ?? null) : null,
    byScope: (scopeId) => partners.find((p) => p.scopeId === scopeId),
  };
}
