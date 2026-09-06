/**
 * The figures on BES HQ's own home, counted in the database.
 *
 * Head counts only — `select id, { count: "exact", head: true }` returns a
 * number and no rows, so the dashboard never pulls a tenant's records to show
 * a tile (rule 14). Every count is bounded by the caller's own row-level
 * security, so a restricted BES user sees smaller numbers rather than a
 * refusal, which is the correct behaviour for a summary.
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
  const count = async (table: string, apply?: (q: ReturnType<typeof sb.from>) => unknown) => {
    const query = sb.from(table as never).select("id", { count: "exact", head: true });
    const { count: n, error } = await (apply ? (apply(query as never) as typeof query) : query);
    if (error) throw error;
    return n ?? 0;
  };
  const [organizations, creditClients, fundingFiles, fundedFiles, liveEngagements] = await Promise.all([
    count("organizations"),
    count("fulfillment_clients"),
    count("funding_files"),
    count("funding_files", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("stage", "Funded")),
    count("fulfillment_engagements", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("status", "active")),
  ]);
  return { organizations, creditClients, fundingFiles, fundedFiles, liveEngagements };
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
