/**
 * Figures for an organization's Home, per module, from the SAME queries the
 * module workspaces use — identical query keys, so opening Home and then the
 * CreditOps workspace costs one request, not two (rule 14). Only entitled
 * modules are fetched; a module that is off is never requested.
 *
 * Every count is over rows RLS returned. Nothing is sampled or floored.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchFulfillmentClients } from "@/lib/data/fulfillment-clients";
import { fetchFundingClients } from "@/lib/data/funding-clients";
import { isActiveFunding } from "@/lib/fulfillment/fundingops-domain";

const CREDIT_INACTIVE = new Set(["Completed", "Archived", "Graduated"]);

export interface CreditOpsHomeFigures {
  active: number;
  processing: number;
  awaiting: number;
  attention: number;
}
export interface FundingOpsHomeFigures {
  active: number;
  funded: number;
  overdue: number;
}

export function useOrganizationHomeFigures(
  organizationId: string | null,
  options: { creditOps: boolean; fundingOps: boolean },
) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";

  const credit = useQuery({
    queryKey: ["creditops", "clients"],
    queryFn: fetchFulfillmentClients,
    enabled: live && !!organizationId && options.creditOps,
    staleTime: 15_000,
  });
  const funding = useQuery({
    queryKey: ["fundingops", "clients"],
    queryFn: fetchFundingClients,
    enabled: live && !!organizationId && options.fundingOps,
    staleTime: 15_000,
  });

  const creditRows = (credit.data ?? []).filter((c) => c.organizationId === organizationId);
  const creditActive = creditRows.filter((c) => !CREDIT_INACTIVE.has(c.status));
  const creditOps: CreditOpsHomeFigures = {
    active: creditActive.length,
    processing: creditActive.filter((c) => ["Ready for Processing", "In Processing", "Ready for QA"].includes(c.status)).length,
    awaiting: creditActive.filter((c) => ["In Dispute", "Awaiting Response"].includes(c.status)).length,
    attention: creditActive.filter((c) => c.status === "Attention" || (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4)).length,
  };

  const fundingRows = (funding.data ?? []).filter((c) => c.organizationId === organizationId);
  const fundingActive = fundingRows.filter((c) => isActiveFunding(c.status));
  const fundingOps: FundingOpsHomeFigures = {
    active: fundingActive.length,
    funded: fundingRows.filter((c) => c.status === "Funded").length,
    overdue: fundingActive.filter((c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24).length,
  };

  return {
    creditOps,
    fundingOps,
    isLoading: (options.creditOps && credit.isLoading) || (options.fundingOps && funding.isLoading),
    error: (credit.error as Error | null)?.message ?? (funding.error as Error | null)?.message ?? null,
  };
}
