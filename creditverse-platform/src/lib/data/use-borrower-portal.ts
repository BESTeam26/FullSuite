import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchBorrowerPortal } from "@/lib/data/borrower-portal";

export const borrowerPortalKey = ["portal", "funding"] as const;
export function useBorrowerPortal(enabled = true) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: borrowerPortalKey, queryFn: fetchBorrowerPortal, enabled: live && enabled, staleTime: 30_000 });
}
export function useInvalidateBorrowerPortal() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: borrowerPortalKey });
}
