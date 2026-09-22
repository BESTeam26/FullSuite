/**
 * The figures on BES HQ's own home, counted in the database.
 *
 * ONE call, not five. `agency_overview_counts()` returns all five numbers from
 * a single query, so the dashboard never pulls a tenant's records to show a
 * tile (rule 14). It is SECURITY INVOKER, so every count stays bounded by the
 * caller's own row-level security and a restricted BES user sees smaller
 * numbers rather than a refusal — the correct behaviour for a summary.
 *
 * It also excludes [TEST] fixtures. Five separate head counts did not, while
 * the lists under the tiles did, so Dee's home read "4 organizations" above a
 * panel saying "0 companies" (2026-09-22). A number that disagrees with the
 * list beneath it is the one somebody quotes.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

export interface AgencyOverview {
  organizations: number;
  creditClients: number;
  fundingFiles: number;
  /** Files that reached the Funded stage. */
  fundedFiles: number;
  liveEngagements: number;
}

async function fetchAgencyOverview(): Promise<AgencyOverview> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("agency_overview_counts" as never);
  if (error) throw error;
  const row = (data as unknown as Array<Record<string, number>> | null)?.[0];
  return {
    organizations: row?.organizations ?? 0,
    creditClients: row?.credit_clients ?? 0,
    fundingFiles: row?.funding_files ?? 0,
    fundedFiles: row?.funded_files ?? 0,
    liveEngagements: row?.live_engagements ?? 0,
  };
}

export function useAgencyOverview() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && auth.isAgencyStaff;
  return useQuery({
    queryKey: ["agency", "overview"],
    queryFn: fetchAgencyOverview,
    enabled: live,
    staleTime: 60_000,
  });
}
