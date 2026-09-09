/**
 * Hooks over the people-management data layer. Query keys are shared
 * deliberately (rule 14): the attendance table and the leave queue both live
 * on Team EOD and refresh together after a decision.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  adjustPayslip, cancelLeave, createCutoff, decideLeave, fetchAttendance,
  fetchCutoffs, fetchLeaveTypes, fetchMyLeave, fetchMyPayslips, fetchPayRates,
  fetchPayslips, fetchPendingLeave, fetchSchedules, generatePayroll,
  releasePayroll, setPayRate, setWorkSchedule, submitLeave,
  type PayRate, type ScheduleInput,
} from "@/lib/data/people-management";

function useLive() {
  const auth = useAuth();
  return {
    live: auth.mode === "live" && auth.status === "signed-in",
    userId: auth.user?.id ?? "",
    agencyId: auth.agencyId ?? null,
  };
}

/* ── Schedules ─────────────────────────────────────────────────────────── */

export function useSchedules() {
  const { live } = useLive();
  return useQuery({ queryKey: ["people", "schedules"], queryFn: fetchSchedules, enabled: live, staleTime: 60_000 });
}

export function useSetSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleInput) => setWorkSchedule(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["people", "schedules"] });
      void qc.invalidateQueries({ queryKey: ["people", "attendance"] });
    },
  });
}

/* ── Leave ─────────────────────────────────────────────────────────────── */

export function useLeaveTypes() {
  const { live } = useLive();
  return useQuery({ queryKey: ["people", "leave-types"], queryFn: fetchLeaveTypes, enabled: live, staleTime: 300_000 });
}

export function useMyLeave() {
  const { live, userId } = useLive();
  return useQuery({
    queryKey: ["people", "leave", "mine", userId],
    queryFn: () => fetchMyLeave(userId),
    enabled: live && !!userId,
    staleTime: 30_000,
  });
}

export function usePendingLeave() {
  const { live } = useLive();
  return useQuery({ queryKey: ["people", "leave", "pending"], queryFn: fetchPendingLeave, enabled: live, staleTime: 30_000 });
}

export function useLeaveActions() {
  const qc = useQueryClient();
  const { agencyId, userId } = useLive();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["people", "leave"] });
    void qc.invalidateQueries({ queryKey: ["people", "attendance"] });
  };
  return {
    submit: useMutation({
      mutationFn: (v: { typeId: string; startsOn: string; endsOn: string; reason?: string }) => {
        if (!agencyId || !userId) return Promise.reject(new Error("No agency context."));
        return submitLeave({ agencyId, userId, ...v });
      },
      onSuccess: refresh,
    }),
    cancel: useMutation({ mutationFn: (id: string) => cancelLeave(id), onSuccess: refresh }),
    decide: useMutation({
      mutationFn: (v: { id: string; approve: boolean; note?: string }) => decideLeave(v.id, v.approve, v.note),
      onSuccess: refresh,
    }),
  };
}

/* ── Attendance ────────────────────────────────────────────────────────── */

export function useAttendanceRange(fromDate: string, toDate: string) {
  const { live } = useLive();
  return useQuery({
    queryKey: ["people", "attendance", fromDate, toDate],
    queryFn: () => fetchAttendance(fromDate, toDate),
    enabled: live,
    staleTime: 30_000,
  });
}

/* ── Payroll ───────────────────────────────────────────────────────────── */

export function usePayRates() {
  const { live } = useLive();
  return useQuery({ queryKey: ["people", "pay-rates"], queryFn: fetchPayRates, enabled: live, staleTime: 60_000 });
}

export function useSetPayRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; rateType: PayRate["rateType"]; rateCents: number; currency?: string }) =>
      setPayRate(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["people", "pay-rates"] }),
  });
}

export function useCutoffs() {
  const { live } = useLive();
  return useQuery({ queryKey: ["people", "payroll", "cutoffs"], queryFn: fetchCutoffs, enabled: live, staleTime: 30_000 });
}

export function usePayslips(cutoffId: string | null) {
  const { live } = useLive();
  return useQuery({
    queryKey: ["people", "payroll", "slips", cutoffId],
    queryFn: () => fetchPayslips(cutoffId as string),
    enabled: live && !!cutoffId,
    staleTime: 15_000,
  });
}

export function useMyPayslips() {
  const { live, userId } = useLive();
  return useQuery({
    queryKey: ["people", "payroll", "mine", userId],
    queryFn: () => fetchMyPayslips(userId),
    enabled: live && !!userId,
    staleTime: 60_000,
  });
}

export function usePayrollActions() {
  const qc = useQueryClient();
  const { agencyId } = useLive();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["people", "payroll"] });
  return {
    createCutoff: useMutation({
      mutationFn: (v: { periodStart: string; periodEnd: string }) => {
        if (!agencyId) return Promise.reject(new Error("No agency context."));
        return createCutoff(agencyId, v.periodStart, v.periodEnd);
      },
      onSuccess: refresh,
    }),
    generate: useMutation({ mutationFn: (id: string) => generatePayroll(id), onSuccess: refresh }),
    adjust: useMutation({
      mutationFn: (v: { payslipId: string; cents: number; note: string }) =>
        adjustPayslip(v.payslipId, v.cents, v.note),
      onSuccess: refresh,
    }),
    release: useMutation({ mutationFn: (id: string) => releasePayroll(id), onSuccess: refresh }),
  };
}
