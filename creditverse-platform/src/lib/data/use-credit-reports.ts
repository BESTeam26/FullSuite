import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createCreditReport,
  fetchClientReports,
  fetchOrganizationReportCount,
  fetchReportItems,
  fetchReportItemsForReports,
  type CreateCreditReportInput,
} from "@/lib/data/credit-reports";
import { evaluateReports } from "@/lib/dispute/reporting-integrity-engine";
import { buildIdentityInput } from "@/lib/dispute/metro2/identity-input";
import { runSection } from "@/lib/dispute/metro2/run-section";
import { SECTION_A_RULES } from "@/lib/dispute/metro2/section-a-identity";
import { metro2FindingsToIntegrity } from "@/lib/dispute/metro2/to-integrity-finding";
import { useClientProfileForCase } from "@/lib/data/use-client-address";

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
 * Every deterministic finding CreditOps has about this client's reports.
 *
 * Two engines, one list, because a reviewer works one queue and a finding has
 * one place to be dispositioned:
 *
 *   reporting-integrity-engine   the report against itself and against its own
 *                                earlier snapshots
 *   Metro 2 Section A            the report's personal information against
 *                                what the client's own record says
 *
 * Section A is folded in HERE rather than given its own persistence, so an
 * identity defect travels the same chain as every other finding — saved to the
 * client record, dispositioned by a person, and only then available to a
 * letter. Nothing on this path creates or sends a dispute.
 *
 * The two loads run in PARALLEL, not in sequence: the identity row is fetched
 * under the same query key `Metro2IdentitySection` already uses, so the two
 * screens share one request rather than making two, and neither waits for the
 * other. Section A itself is pure computation over data already in hand.
 *
 * Nothing is persisted by this hook; the same inputs always give the same
 * findings, and a rule version travels with each one.
 */
export function useReportIntegrityFindings(fulfillmentClientId: string | null) {
  const { reports, latest, live, isLoading: loadingReports } = useClientReports(fulfillmentClientId);
  const ids = reports.map((r) => r.id);
  const latestId = latest?.id ?? null;

  const identity = useClientProfileForCase(fulfillmentClientId ?? undefined);

  const q = useQuery({
    queryKey: ["credit-reports", "integrity", fulfillmentClientId, ids.join(",")],
    queryFn: async () => {
      const byReport = await fetchReportItemsForReports(ids);
      return {
        integrity: evaluateReports(reports.map((r) => ({ reportId: r.id, pulledAt: r.pulledAt, items: byReport[r.id] ?? [] }))),
        /* Kept so Section A runs over the newest snapshot without a second
           request for items this query already holds. */
        latestItems: latestId ? byReport[latestId] ?? [] : [],
      };
    },
    enabled: live && ids.length > 0,
    staleTime: 60_000,
  });

  const findings = useMemo(() => {
    if (!q.data) return NO_FINDINGS;
    /* Absent identity is absent, never assumed: with no verified record to
       compare against, Section A's rules answer UNKNOWN, and an unknown does
       not become a finding. */
    if (!latestId || !identity.data) return q.data.integrity;
    const built = buildIdentityInput(q.data.latestItems, identity.data);
    const sectionA = metro2FindingsToIntegrity(runSection(SECTION_A_RULES, built.input), { reportId: latestId });
    return sectionA.length === 0 ? q.data.integrity : [...q.data.integrity, ...sectionA];
  }, [q.data, identity.data, latestId]);

  return {
    findings,
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

export function useOrganizationReportCount(organizationId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({
    queryKey: ["credit-reports", "organization-count", organizationId],
    queryFn: () => fetchOrganizationReportCount(organizationId!),
    enabled: live && !!organizationId,
    staleTime: 60_000,
  });
}
