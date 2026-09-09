/**
 * Time tracking and EOD hooks — dual-mode, matching `use-work.ts`.
 *
 * live → TanStack Query against Supabase (RLS-scoped to the signed-in user).
 * demo → the engine's seed production logs, and an empty timesheet.
 *
 * Every hook reports its `source` so the screen can label demo figures honestly
 * rather than presenting a sample number as a real one (rule 12).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  clockIn as clockInRow,
  clockOut as clockOutRow,
  fetchOpenEntry,
  fetchTimeEntries,
  localWorkDate,
  type TimeEntry,
} from "@/lib/data/time-entries";
import {
  fetchEod,
  fetchProductionLogs,
  saveEod,
  type EodContext,
  type SaveEodInput,
} from "@/lib/data/eod";
import {
  deriveEodTotals,
  seedProductionLogs,
  type ProductionLog,
} from "@/lib/eod-production-engine";
import { summariseTime, weekStart, type TimeSummary } from "@/lib/time-domain";
import type { DataSource } from "@/lib/data/use-work";

const useLive = () => {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
};

/* ------------------------------------------------------------------ */
/* My Time                                                             */
/* ------------------------------------------------------------------ */

export interface TimesheetResult extends TimeSummary {
  entries: TimeEntry[];
  today: string;
  source: DataSource;
  isLoading: boolean;
  error: string | null;
  clockIn: (divisionId: string, taskNote?: string) => void;
  /** Stop the clock. `endedAt` is for a forgotten timer — the person states
      when they actually stopped; omitted means "now". */
  clockOut: (endedAt?: string) => void;
  isMutating: boolean;
  actionError: string | null;
}

/**
 * The current week's timesheet in ONE request, sliced in memory for the cards.
 * A query per card would be four round trips for four numbers (rule 14).
 */
export function useTimesheet(): TimesheetResult {
  const auth = useAuth();
  const live = useLive();
  const qc = useQueryClient();
  const userId = auth.user?.id ?? "";
  const agencyId = auth.agencyId;
  const today = localWorkDate();
  const from = weekStart();

  const q = useQuery({
    queryKey: ["time", "week", userId, from],
    queryFn: () => fetchTimeEntries(userId, from, today),
    enabled: live,
    staleTime: 15_000,
  });

  /* The running clock is a fact about ALL time, not about this week. Deriving
     it from the week's rows deadlocked the screen: a clock left running past
     a week boundary (Sunday's, when the week starts Monday) was invisible,
     unstoppable, and blocked every new clock-in — the database refused with
     "already clocked in" while the page showed nothing running. Found live on
     2026-09-08 with exactly such an entry. */
  const open = useQuery({
    queryKey: ["time", "open", userId],
    queryFn: () => fetchOpenEntry(userId),
    enabled: live,
    staleTime: 15_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["time", "week", userId, from] });
    void qc.invalidateQueries({ queryKey: ["time", "open", userId] });
  };

  const inM = useMutation({
    mutationFn: (v: { divisionId: string; taskNote?: string }) => {
      // Default deny rather than a non-null assertion: an unresolved agency
      // must fail loudly, not be asserted away.
      if (!agencyId) {
        return Promise.reject(
          new Error("No agency context — cannot start the clock."),
        );
      }
      return clockInRow({
        agencyId,
        employeeId: userId,
        divisionId: v.divisionId,
        taskNote: v.taskNote,
      });
    },
    onSuccess: invalidate,
  });
  const outM = useMutation({
    mutationFn: (endedAt?: string) => clockOutRow(userId, endedAt),
    onSuccess: invalidate,
  });

  const entries = live ? (q.data ?? []) : [];
  const summary = summariseTime(entries, today);

  return {
    ...summary,
    /* Unbounded truth wins over the week-window derivation. */
    openEntry: live ? (open.data ?? undefined) : summary.openEntry,
    entries,
    today,
    source: live ? "live" : "demo",
    isLoading: live ? q.isLoading : false,
    error: live ? ((q.error as Error | null)?.message ?? null) : null,
    clockIn: (divisionId, taskNote) => {
      if (live && agencyId) inM.mutate({ divisionId, taskNote });
    },
    clockOut: (endedAt?: string) => {
      if (live) outM.mutate(endedAt);
    },
    isMutating: inM.isPending || outM.isPending,
    actionError:
      (inM.error as Error | null)?.message ??
      (outM.error as Error | null)?.message ??
      null,
  };
}

/* ------------------------------------------------------------------ */
/* End of Day                                                          */
/* ------------------------------------------------------------------ */

export interface EodResult {
  workDate: string;
  logs: ProductionLog[];
  totals: ReturnType<typeof deriveEodTotals>;
  context: EodContext | null;
  source: DataSource;
  isLoading: boolean;
  error: string | null;
  save: (
    input: Omit<SaveEodInput, "agencyId" | "employeeId" | "workDate">,
  ) => void;
  isSaving: boolean;
  saveError: string | null;
  canSave: boolean;
}

/**
 * Today's EOD: the employee's context, plus totals DERIVED from production
 * logs rather than read from a stored column. Rule 1 of the engine — a stored
 * total can drift from the rows it claims to summarise.
 */
export function useEod(workDate: string = localWorkDate()): EodResult {
  const auth = useAuth();
  const live = useLive();
  const qc = useQueryClient();
  const userId = auth.user?.id ?? "";
  const agencyId = auth.agencyId;
  const employeeName = auth.displayName;

  const logsQ = useQuery({
    queryKey: ["eod", "logs", userId, workDate],
    queryFn: () => fetchProductionLogs(userId, workDate),
    enabled: live,
    staleTime: 15_000,
  });
  const eodQ = useQuery({
    queryKey: ["eod", "submission", userId, workDate],
    queryFn: () => fetchEod(userId, workDate, employeeName),
    enabled: live,
    staleTime: 15_000,
  });

  const saveM = useMutation({
    mutationFn: (
      v: Omit<SaveEodInput, "agencyId" | "employeeId" | "workDate">,
    ) =>
      agencyId
        ? saveEod({ ...v, agencyId, employeeId: userId, workDate })
        : Promise.reject(
            new Error("No agency context — cannot save this EOD report."),
          ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["eod", "submission", userId, workDate],
      }),
  });

  // Demo mode shows the engine's own seed logs so the screen is explorable,
  // and says so via `source`. The seed stamps its rows with the UTC date, so
  // the demo tally must match on that rather than the local work date — get it
  // wrong and every demo total silently reads zero.
  const logs = live ? (logsQ.data ?? []) : seedProductionLogs;
  const employeeId = live ? userId : "emp-1";
  const tallyDate = live ? workDate : new Date().toISOString().slice(0, 10);

  return {
    workDate,
    logs,
    totals: deriveEodTotals(logs, employeeId, tallyDate),
    context: live ? (eodQ.data ?? null) : null,
    source: live ? "live" : "demo",
    isLoading: live ? logsQ.isLoading || eodQ.isLoading : false,
    error: live
      ? ((logsQ.error as Error | null)?.message ??
        (eodQ.error as Error | null)?.message ??
        null)
      : null,
    save: (input) => {
      if (live && agencyId) saveM.mutate(input);
    },
    isSaving: saveM.isPending,
    saveError: (saveM.error as Error | null)?.message ?? null,
    canSave: live && Boolean(agencyId),
  };
}
