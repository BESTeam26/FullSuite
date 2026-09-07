/**
 * Plans, shared by every screen that lists them. One cache key, so the sign-up
 * form and the billing screen do not each fetch the same eight rows.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchAllPlans, fetchPublicPlans } from "@/lib/data/plans";

export function usePlans() {
  return useQuery({ queryKey: ["plans", "all"], queryFn: fetchAllPlans, staleTime: 300_000 });
}

export function usePublicPlans() {
  return useQuery({ queryKey: ["plans", "public"], queryFn: fetchPublicPlans, staleTime: 300_000 });
}
