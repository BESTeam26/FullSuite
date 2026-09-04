/**
 * The single place the interface asks "may BES work this?".
 *
 * One query, one cache key, shared by every consumer. The alternative — each
 * panel asking about its own partner — is the per-component lookup and request
 * waterfall rule 14 forbids, and it would put an authorization decision in
 * twenty places instead of one (rule 5).
 *
 * The database still decides. `bes_may_fulfil()` runs inside RLS, so a screen
 * that got this wrong would show an empty panel, never someone else's data.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  besMayFulfil,
  fetchFulfillmentEngagements,
  servicesFor,
  type FulfillmentEngagement,
  type FulfillmentService,
} from "@/lib/data/fulfillment-engagements";
import type { DataSource } from "@/lib/data/use-work";

export interface FulfillmentResult {
  engagements: FulfillmentEngagement[];
  source: DataSource;
  isLoading: boolean;
  error: string | null;
  /** May BES work this partner's records for this service, right now? */
  mayFulfil: (scopeId: string | undefined, service: FulfillmentService) => boolean;
  /** Which services BES is engaged to perform for this partner. */
  servicesFor: (scopeId: string | undefined) => FulfillmentService[];
}

export function useFulfillment(): FulfillmentResult {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";

  const q = useQuery({
    queryKey: ["fulfillment", "engagements"],
    queryFn: fetchFulfillmentEngagements,
    enabled: live,
    // Engagements change when a contract does, not during a work session.
    staleTime: 5 * 60_000,
  });

  const engagements = useMemo(() => q.data ?? [], [q.data]);

  return {
    engagements,
    source: live ? "live" : "demo",
    isLoading: live ? q.isLoading : false,
    error: live ? ((q.error as Error | null)?.message ?? null) : null,
    // Demo mode has no engagement records; without a backend the workspace is
    // explorable, so it answers yes rather than hiding everything.
    mayFulfil: (scopeId, service) =>
      live ? besMayFulfil(engagements, scopeId, service) : true,
    servicesFor: (scopeId) =>
      live
        ? servicesFor(engagements, scopeId)
        : (["creditops", "fundingops"] as FulfillmentService[]),
  };
}
