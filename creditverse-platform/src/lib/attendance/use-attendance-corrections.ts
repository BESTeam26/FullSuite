import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchAttendanceCorrections, recordAttendanceCorrection,
} from "@/lib/data/attendance-corrections";
import type { Classification } from "@/lib/attendance/attendance-score";

export function useAttendanceCorrections(fromDate: string, toDate: string) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["attendance", "corrections", fromDate, toDate],
    queryFn: () => fetchAttendanceCorrections(fromDate, toDate),
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 30_000,
  });
}

export function useRecordCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; workDate: string; classification: Classification; reason: string }) =>
      recordAttendanceCorrection(v),
    onSuccess: () => {
      /* The score is DERIVED from these, so everything showing one is stale. */
      void qc.invalidateQueries({ queryKey: ["attendance", "corrections"] });
      void qc.invalidateQueries({ queryKey: ["people", "attendance"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export { latestPerDay } from "./corrections-latest";
