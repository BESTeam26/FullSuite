import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchAttendanceCorrections, recordAttendanceCorrection,
} from "@/lib/data/attendance-corrections";
import type { Classification, Correction } from "@/lib/attendance/attendance-score";

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

/**
 * The latest correction per day, in the shape the engine takes.
 *
 * Append-only means a day can carry several; the most recent decision stands,
 * and the ones before it remain in the table as history.
 */
export function latestPerDay(
  rows: { userId: string; workDate: string; classification: Classification; reason: string; decidedByName: string | null; decidedAt: string }[],
  userId: string,
): Correction[] {
  const byDay = new Map<string, Correction>();
  for (const r of rows.filter((x) => x.userId === userId)) {
    byDay.set(r.workDate, {
      day: r.workDate,
      to: r.classification,
      reason: r.reason,
      by: r.decidedByName ?? "a manager",
      at: r.decidedAt,
    });
  }
  return [...byDay.values()];
}
