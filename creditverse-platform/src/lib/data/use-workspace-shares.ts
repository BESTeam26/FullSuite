import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createWorkspaceShare,
  fetchActiveShares,
  revokeWorkspaceShare,
  type CreateShareInput,
} from "@/lib/data/workspace-shares";

const useLive = () => {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
};

export const sharesKey = (workspaceId?: string) => ["workspaces", "shares", workspaceId ?? "all"] as const;

export function useActiveShares(workspaceId?: string) {
  const live = useLive();
  const q = useQuery({
    queryKey: sharesKey(workspaceId),
    queryFn: () => fetchActiveShares(workspaceId),
    enabled: live,
    staleTime: 60_000,
  });
  return { shares: q.data ?? [], isLoading: live && q.isLoading, error: q.error ? (q.error as Error).message : null };
}

/** A share changes what BES can see: invalidate shares, workspaces and the work engine. */
const useInvalidateShares = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["workspaces"] });
    void qc.invalidateQueries({ queryKey: ["work"] });
  };
};

export function useCreateShare() {
  const invalidate = useInvalidateShares();
  return useMutation({ mutationFn: (input: CreateShareInput) => createWorkspaceShare(input), onSuccess: invalidate });
}

export function useRevokeShare() {
  const invalidate = useInvalidateShares();
  return useMutation({ mutationFn: (id: string) => revokeWorkspaceShare(id), onSuccess: invalidate });
}
