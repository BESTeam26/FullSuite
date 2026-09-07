/**
 * One client's report chronology (CR-3).
 *
 * Two bounded requests in PARALLEL — every snapshot's items, and every
 * snapshot's per-bureau values — assembled into the pure domain's input. Never
 * one request per report and never one per account.
 *
 * The report list it builds on is `useClientReports`, so the query key is
 * shared: a screen already showing the import history makes no second request
 * for it.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchBureauValuesForReports, fetchReportItemsForReports } from "@/lib/data/credit-reports";
import { useClientReports } from "@/lib/data/use-credit-reports";
import type { ChronologySnapshot } from "@/lib/credit-report/chronology";

const NO_SNAPSHOTS: ChronologySnapshot[] = [];

export function useChronology(fulfillmentClientId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const { reports, isLoading: loadingReports } = useClientReports(fulfillmentClientId);
  const ids = reports.map((r) => r.id);

  const q = useQuery({
    queryKey: ["credit-reports", "chronology", fulfillmentClientId, ids.join(",")],
    queryFn: async (): Promise<ChronologySnapshot[]> => {
      const [itemsByReport, valuesByReport] = await Promise.all([
        fetchReportItemsForReports(ids),
        fetchBureauValuesForReports(ids),
      ]);
      return reports.map((r) => {
        const items: ChronologySnapshot["items"] = {};
        for (const item of itemsByReport[r.id] ?? []) {
          items[item.accountRef] = {
            name: item.name,
            accountType: item.subtype,
            openDate: item.openDate,
          };
        }
        return {
          reportId: r.id,
          pulledAt: r.pulledAt,
          bureaus: r.bureaus,
          /* CR-14's verdict, straight from the database. Null is UNKNOWN, and
             the domain treats it as "cannot prove an absence". */
          quality: r.importQuality,
          items,
          observations: valuesByReport[r.id] ?? {},
        };
      });
    },
    enabled: live && ids.length > 1,
    staleTime: 60_000,
  });

  return {
    /* A chronology needs at least two snapshots to be a chronology. */
    snapshots: q.data ?? NO_SNAPSHOTS,
    snapshotCount: reports.length,
    isLoading: live && (loadingReports || (ids.length > 1 && q.isLoading)),
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}
