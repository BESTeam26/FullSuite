import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createCreditReport,
  fetchClientReports,
  fetchReportItems,
  type CreateCreditReportInput,
} from "@/lib/data/credit-reports";

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
    reports: q.data ?? [],
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
  return { items: q.data ?? [], isLoading: live && !!reportId && q.isLoading, error: q.error ? (q.error as Error).message : null };
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
