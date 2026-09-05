/**
 * FundingOps for an organization — the SAME Company workspace BES uses,
 * scoped to the active organization's own clients and deals.
 *
 * Selection mirrors the agency page minus the Partner tree and Management
 * layer: the Company workspace, a Client workspace, or a Deal workspace — all
 * projections of the same canonical records (rule 2, rule 17).
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAgency } from "@/lib/agency-context";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { partnerForOrganization } from "@/lib/data/partners";
import { FundingOpsStoreProvider } from "@/lib/fulfillment/fundingops-client-store";
import { FundingDealStoreProvider } from "@/lib/fulfillment/funding-deal-store";
import { FundingOpsAccessProvider } from "@/lib/fulfillment/fundingops-access";
import type { FundingPartnerViewId } from "@/lib/fulfillment/fundingops-partners";
import { visibleFundingOpsViews } from "@/lib/fulfillment/workspace-views";
import { FundingOpsHeader } from "@/components/dashboard/fulfillment/FundingOpsHeader";
import { FundingOpsPartnerWorkspace } from "@/components/dashboard/fulfillment/FundingOpsPartnerWorkspace";
import { FundingClientWorkspace } from "@/components/dashboard/fulfillment/FundingClientWorkspace";
import { FundingDealWorkspace } from "@/components/dashboard/fulfillment/FundingDealWorkspace";
import { NoActiveOrganization } from "@/components/dashboard/NoActiveOrganization";

type Selection =
  | { kind: "company" }
  | { kind: "client"; clientId: string }
  | { kind: "deal"; dealId: string };

export default function OrganizationFundingOps() {
  return (
    <FundingOpsStoreProvider>
      <FundingDealStoreProvider>
        <FundingOpsAccessProvider>
          <OrganizationFundingOpsWorkspace />
        </FundingOpsAccessProvider>
      </FundingDealStoreProvider>
    </FundingOpsStoreProvider>
  );
}

function OrganizationFundingOpsWorkspace() {
  const { activeOrganization } = useAgency();
  const fulfillment = useFulfillment();
  const [selection, setSelection] = useState<Selection>({ kind: "company" });
  const [activeView, setActiveView] =
    useState<FundingPartnerViewId>("dashboard");
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedClient = searchParams.get("client");
  useEffect(() => {
    if (!linkedClient) return;
    setSelection({ kind: "client", clientId: linkedClient });
    setSearchParams({}, { replace: true });
  }, [linkedClient, setSearchParams]);

  if (!activeOrganization) return <NoActiveOrganization module="FundingOps" />;

  const partner = partnerForOrganization(
    "fundingOps",
    activeOrganization,
    fulfillment.engagements,
  );
  const views = visibleFundingOpsViews(activeOrganization.workspaceViews);
  const currentView = views.includes(activeView) ? activeView : "dashboard";
  const backToCompany = () => setSelection({ kind: "company" });
  const openClient = (clientId: string) =>
    setSelection({ kind: "client", clientId });
  const openDeal = (dealId: string) => setSelection({ kind: "deal", dealId });

  const headerName =
    selection.kind === "deal"
      ? "Deal Workspace"
      : selection.kind === "client"
        ? "Client Workspace"
        : `${activeOrganization.name} · FundingOps`;

  return (
    <div className="flex min-h-full flex-col bg-muted/20">
      <FundingOpsHeader partnerName={headerName} clientCount={null} />
      {selection.kind === "deal" ? (
        <div className="p-6">
          <FundingDealWorkspace dealId={selection.dealId} onBack={backToCompany} />
        </div>
      ) : selection.kind === "client" ? (
        <div className="p-6">
          <FundingClientWorkspace
            clientId={selection.clientId}
            onBack={backToCompany}
            onOpenDeal={openDeal}
          />
        </div>
      ) : (
        <FundingOpsPartnerWorkspace
          scopeId={activeOrganization.id}
          partner={partner}
          activeView={currentView}
          onViewChange={setActiveView}
          views={views}
          onOpenClient={openClient}
          onOpenDeal={openDeal}
        />
      )}
    </div>
  );
}
