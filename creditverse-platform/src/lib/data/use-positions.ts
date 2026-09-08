/**
 * Positions, as hooks. One key, shared by the chart and the manage screen.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignToPosition, endAssignment, fetchPositionHistory, fetchPositions,
  savePosition, setPositionArchived, type AssignmentType, type SavePositionInput,
} from "@/lib/data/positions";
import { useAuth } from "@/lib/auth/auth-context";

export const positionsKey = (agencyId: string | null) => ["agency", "positions", agencyId ?? ""] as const;

export function usePositions() {
  const auth = useAuth();
  const agencyId = auth.agencyId ?? null;
  return useQuery({
    queryKey: positionsKey(agencyId),
    queryFn: () => fetchPositions(agencyId!),
    enabled: !!agencyId,
    staleTime: 60_000,
  });
}

export function usePositionHistory(scope: { positionId: string } | { userId: string } | null) {
  return useQuery({
    queryKey: ["agency", "position-history", JSON.stringify(scope)],
    queryFn: () => fetchPositionHistory(scope!),
    enabled: !!scope,
    staleTime: 60_000,
  });
}

export function usePositionActions() {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: positionsKey(agencyId) });
    void qc.invalidateQueries({ queryKey: ["agency", "position-history"] });
  };
  return {
    save: useMutation({
      mutationFn: (v: Omit<SavePositionInput, "agencyId">) => savePosition({ ...v, agencyId }),
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: (v: { id: string; archived: boolean }) => setPositionArchived(v.id, v.archived),
      onSuccess: refresh,
    }),
    assign: useMutation({
      mutationFn: (v: { positionId: string; userId: string; assignmentType: AssignmentType; note?: string }) =>
        assignToPosition({ ...v, agencyId }),
      onSuccess: refresh,
    }),
    end: useMutation({ mutationFn: (id: string) => endAssignment(id), onSuccess: refresh }),
  };
}
