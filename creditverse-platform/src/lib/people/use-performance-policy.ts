/** The performance weighting row, cached — it changes a few times a year. */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { DEFAULT_PERFORMANCE_POLICY, mapPerformancePolicy, type PerformancePolicy } from "./performance-policy";

export async function fetchPerformancePolicy(): Promise<PerformancePolicy> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("performance_policy").select("*").maybeSingle();
  if (error) throw error;
  return mapPerformancePolicy(data as unknown as Record<string, unknown> | null);
}

export function usePerformancePolicy(): PerformancePolicy {
  const auth = useAuth();
  const q = useQuery({
    queryKey: ["performance", "policy"],
    queryFn: fetchPerformancePolicy,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 300_000,
  });
  return q.data ?? DEFAULT_PERFORMANCE_POLICY;
}
