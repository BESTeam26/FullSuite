import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchCommissionRecords, fetchFundedDealRecords, fetchOfferRecords, fetchRenewalRecords, fetchSubmissionRecords } from "@/lib/data/funding-records";

export type FundingRecordKind = "submissions" | "offers" | "funded" | "commissions" | "renewals";
/** Under the "fundingops" prefix so `useInvalidateFundingFile` refreshes these after any file write. */
export const fundingRecordsKey = (kind: FundingRecordKind) => ["fundingops", "records", kind] as const;

const FETCHERS = {
  submissions: fetchSubmissionRecords,
  offers: fetchOfferRecords,
  funded: fetchFundedDealRecords,
  commissions: fetchCommissionRecords,
  renewals: fetchRenewalRecords,
} as const;

function useLive() {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in";
}
/** One list, fetched only while its tab is open. */
export function useSubmissionRecords(enabled: boolean) { const live = useLive(); return useQuery({ queryKey: fundingRecordsKey("submissions"), queryFn: FETCHERS.submissions, enabled: live && enabled, staleTime: 30_000 }); }
export function useOfferRecords(enabled: boolean) { const live = useLive(); return useQuery({ queryKey: fundingRecordsKey("offers"), queryFn: FETCHERS.offers, enabled: live && enabled, staleTime: 30_000 }); }
export function useFundedDealRecords(enabled: boolean) { const live = useLive(); return useQuery({ queryKey: fundingRecordsKey("funded"), queryFn: FETCHERS.funded, enabled: live && enabled, staleTime: 30_000 }); }
export function useCommissionRecords(enabled: boolean) { const live = useLive(); return useQuery({ queryKey: fundingRecordsKey("commissions"), queryFn: FETCHERS.commissions, enabled: live && enabled, staleTime: 30_000 }); }
export function useRenewalRecords(enabled: boolean) { const live = useLive(); return useQuery({ queryKey: fundingRecordsKey("renewals"), queryFn: FETCHERS.renewals, enabled: live && enabled, staleTime: 30_000 }); }
