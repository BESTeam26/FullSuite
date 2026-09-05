import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createCreditReport,
  fetchClientReports,
  fetchReportItems,
  fetchReportItemsForReports,
  type CreateCreditReportInput,
} from "@/lib/data/credit-reports";
import { evaluateReports } from "@/lib/dispute/reporting-integrity-engine";

/* Stable empty results. A hook that returns `q.data ?? []` hands consumers a
   new array every render; an effect keyed on it then sets state forever
   ("Maximum update depth exceeded") on any client with nothing imported. */
const NO_REPORTS: never[] = [];
const NO_ITEMS: never[] = [];
const NO_FINDINGS: never[] = [];

export const clientReportsKey = (clientId: string | null) => ["credit-reports", "client", clientId];
export const reportItemsKey = (reportId: string | null) => ["credit-reports", "items", reportId];

/** The client's import history (newest first) — one bounded query. */
export function useClientReports(fulfillmentClientId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: clientReportsKey(fulfillmentClientId),
    queryFn: () => fetchClientReports(fulfillmentClientId as string),
    enabled: live && !!fulfillmentClientId,
    staleTime: 30_000,
  });
  return {
    reports: q.data ?? NO_REPORTS,
    latest: q.data?.[0] ?? null,
    isLoading: live && !!fulfillmentClientId && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}

/** Items of one report — fetched only when that report is opened. */
export function useReportItems(reportId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: reportItemsKey(reportId),
    queryFn: () => fetchReportItems(reportId as string),
    enabled: live && !!reportId,
    staleTime: 60_000,
  });
  return { items: q.data ?? NO_ITEMS, isLoading: live && !!reportId && q.isLoading, error: q.error ? (q.error as Error).message : null };
}

/**
 * Credit Reporting Integrity findings for a client: every stored import's items
 * in one query, then the deterministic engine over the latest snapshot and the
 * chronology. Nothing is persisted; the same inputs always give the same
 * findings (rule catalogue version travels with each finding).
 */
export function useReportIntegrityFindings(fulfillmentClientId: string | null) {
  const { reports, live, isLoading: loadingReports } = useClientReports(fulfillmentClientId);
  const ids = reports.map((r) => r.id);
  const q = useQuery({
    queryKey: ["credit-reports", "integrity", fulfillmentClientId, ids.join(",")],
    queryFn: async () => {
      const byReport = await fetchReportItemsForReports(ids);
      return evaluateReports(reports.map((r) => ({ reportId: r.id, pulledAt: r.pulledAt, items: byReport[r.id] ?? [] })));
    },
    enabled: live && ids.length > 0,
    staleTime: 60_000,
  });
  return {
    findings: q.data ?? NO_FINDINGS,
    reportCount: reports.length,
    isLoading: live && (loadingReports || (ids.length > 0 && q.isLoading)),
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}

export function useImportCreditReport(fulfillmentClientId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCreditReportInput) => createCreditReport(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clientReportsKey(fulfillmentClientId) });
    },
  });
}
