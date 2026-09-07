import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchEodActivity, fetchEodDay, fetchTeamEod, runEodCutoff, saveEodDay,
  type EodNotes,
} from "@/lib/data/eod-day";

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const eodActivityKey = (employeeId: string, date: string) => ["eod", "activity", employeeId, date] as const;
export const eodDayKey = (employeeId: string, date: string) => ["eod", "day", employeeId, date] as const;
export const teamEodKey = (agencyId: string, date: string) => ["eod", "team", agencyId, date] as const;

function useCtx() {
  const auth = useAuth();
  return {
    live: auth.mode === "live" && auth.status === "signed-in",
    agencyId: auth.agencyId ?? null,
    userId: auth.user?.id ?? null,
    name: auth.profile?.full_name ?? auth.user?.email ?? "You",
  };
}

/** The day, rebuilt from real activity. Refetched on focus so it stays live. */
export function useEodActivity(date: string, employeeId?: string) {
  const { live, userId } = useCtx();
  const id = employeeId ?? userId;
  return useQuery({
    queryKey: eodActivityKey(id ?? "", date),
    queryFn: () => fetchEodActivity(id!, date),
    enabled: live && !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useEodDay(date: string, employeeId?: string) {
  const { live, userId, name } = useCtx();
  const id = employeeId ?? userId;
  return useQuery({
    queryKey: eodDayKey(id ?? "", date),
    queryFn: () => fetchEodDay(id!, date, name),
    enabled: live && !!id,
    staleTime: 15_000,
  });
}

export function useSaveEod(date: string) {
  const qc = useQueryClient();
  const { agencyId, userId } = useCtx();
  return useMutation({
    mutationFn: (v: { notes: EodNotes; submit: boolean }) =>
      saveEodDay({ agencyId: agencyId!, employeeId: userId!, workDate: date, notes: v.notes, submit: v.submit, actorId: userId! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: eodDayKey(userId ?? "", date) });
      qc.invalidateQueries({ queryKey: teamEodKey(agencyId ?? "", date) });
    },
  });
}

/**
 * The manager's day. Runs the cutoff first, so a report left open past the
 * agency's cutoff is already marked auto-submitted by the time the table
 * renders — rather than sitting as "missing" until a scheduler happens to run.
 */
export function useTeamEod(date: string) {
  const { live, agencyId } = useCtx();
  return useQuery({
    queryKey: teamEodKey(agencyId ?? "", date),
    queryFn: async () => {
      await runEodCutoff(agencyId!).catch(() => 0);
      return fetchTeamEod(agencyId!, date);
    },
    enabled: live && !!agencyId,
    staleTime: 30_000,
  });
}
