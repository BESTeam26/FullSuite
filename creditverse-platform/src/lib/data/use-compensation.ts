/**
 * Compensation queries.
 *
 * Keyed by person, because that is how the screens ask. The arrangement and
 * the payroll record are separate keys: opening an arrangement invalidates
 * both, since a new rate changes what the next draft will pay.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchArrangements, fetchPayrollRecord, openArrangement, type NewArrangement } from "@/lib/data/compensation";

export function useArrangements(userId: string | null) {
  return useQuery({
    queryKey: ["compensation", "arrangements", userId],
    queryFn: () => fetchArrangements(userId as string),
    enabled: Boolean(userId),
  });
}

export function usePayrollRecord(userId: string | null) {
  return useQuery({
    queryKey: ["compensation", "record", userId],
    queryFn: () => fetchPayrollRecord(userId as string),
    enabled: Boolean(userId),
  });
}

export function useOpenArrangement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: NewArrangement) => openArrangement(a),
    onSuccess: (_d, a) => {
      void qc.invalidateQueries({ queryKey: ["compensation", "arrangements", a.userId] });
      void qc.invalidateQueries({ queryKey: ["compensation", "record", a.userId] });
      void qc.invalidateQueries({ queryKey: ["people", "payslips"] });
    },
  });
}
