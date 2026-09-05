import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchLenderRelationship, fetchPolicyUpdates } from "@/lib/data/lender-relationship";

export const lenderRelationshipKey = (lenderId: string) => ["fundingops", "lender-relationship", lenderId] as const;
export const policyUpdatesKey = ["fundingops", "policy-updates"] as const;

function useLive() { const auth = useAuth(); return auth.mode === "live" && auth.status === "signed-in"; }

/** Contacts and partner status for the selected lender only — fetched when a lender is selected. */
export function useLenderRelationship(lenderId: string | null) {
  const live = useLive();
  return useQuery({ queryKey: lenderRelationshipKey(lenderId ?? ""), queryFn: () => fetchLenderRelationship(lenderId!), enabled: live && !!lenderId, staleTime: 30_000 });
}
export function usePolicyUpdates() {
  const live = useLive();
  return useQuery({ queryKey: policyUpdatesKey, queryFn: fetchPolicyUpdates, enabled: live, staleTime: 30_000 });
}
export function useInvalidateLender() {
  const qc = useQueryClient();
  return (lenderId?: string) => {
    if (lenderId) void qc.invalidateQueries({ queryKey: lenderRelationshipKey(lenderId) });
    void qc.invalidateQueries({ queryKey: policyUpdatesKey });
    void qc.invalidateQueries({ queryKey: ["fundingops", "lender-catalogue"] });
  };
}
