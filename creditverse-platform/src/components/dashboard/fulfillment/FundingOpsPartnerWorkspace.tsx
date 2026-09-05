/**
 * FundingOps Partner workspace — ONE workspace navigation row over the views
 * of a single Company/Partner (Dashboard, SOPs & Logins, Deal List, Readiness,
 * Documents, Submissions, Stipulations, Offers, Funded). Every view is a
 * filtered projection of the same canonical client and deal records for
 * `scopeId` (an organization id or an outsourcing group id).
 *
 * Shared by the BES agency division page and by an organization's own
 * FundingOps page: same components, same rows, a different scope.
 */
import { FundingOpsDashboardView } from "./FundingOpsDashboardView";
import { FundingDealListPanel } from "./FundingDealListPanel";
import { FundingClientsPanel } from "./FundingClientsPanel";
import { FundingQueueView } from "./FundingQueueViews";
import { EditableSopsAndLoginsView } from "./EditableSopsAndLoginsView";
import {
  FUNDING_PARTNER_VIEWS,
  type FundingPartnerViewId,
} from "@/lib/fulfillment/fundingops-partners";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import { cn } from "@/lib/utils";

export interface FundingOpsPartnerWorkspaceProps {
  scopeId: string;
  partner: OpsPartner;
  activeView: FundingPartnerViewId;
  onViewChange: (view: FundingPartnerViewId) => void;
  onOpenClient: (clientId: string) => void;
  onOpenDeal: (dealId: string) => void;
  /** Views to offer, in order. Defaults to all (the agency always sees all). */
  views?: readonly FundingPartnerViewId[];
}

export function FundingOpsPartnerWorkspace({
  scopeId,
  partner,
  activeView,
  onViewChange,
  onOpenClient,
  onOpenDeal,
  views,
}: FundingOpsPartnerWorkspaceProps) {
  const offered = views
    ? FUNDING_PARTNER_VIEWS.filter((v) => views.includes(v.id))
    : FUNDING_PARTNER_VIEWS;
  const queueMap: Record<string, string> = {
    readiness: "readiness-queue",
    submissions: "submissions-queue",
    stipulations: "stipulations-queue",
    offers: "offers-queue",
    funded: "funded-queue",
  };

  return (
    <div className="flex flex-col">
      {/* ONE workspace navigation row — the views of this Partner */}
      <div className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-4">
        {offered.map((view) => (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3.5 py-3 text-xs font-bold transition-all",
              activeView === view.id
                ? "border-emerald-600 bg-emerald-500/10 text-status-success"
                : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeView === "dashboard" ? (
          <FundingOpsDashboardView
            selectedScope={scopeId}
            partnerName={partner.name}
            onNavigateToView={(v) => onViewChange(v as FundingPartnerViewId)}
          />
        ) : activeView === "sops-logins" ? (
          <EditableSopsAndLoginsView selectedScope={scopeId} />
        ) : activeView === "client-list" ? (
          /* Operational client list: current department, work status, open work;
             opens the client's operational file (separation step 3). */
          <FundingClientsPanel selectedScope={scopeId} partner={partner} />
        ) : activeView === "deal-list" ? (
          <FundingDealListPanel
            selectedScope={scopeId}
            onOpenDeal={onOpenDeal}
          />
        ) : activeView === "documents" ? (
          <FundingQueueView
            queueType="document-queue"
            selectedScope={scopeId}
            onOpenClient={onOpenClient}
          />
        ) : queueMap[activeView] ? (
          <FundingQueueView
            queueType={queueMap[activeView]}
            selectedScope={scopeId}
            onOpenClient={onOpenClient}
          />
        ) : (
          <FundingDealListPanel
            selectedScope={scopeId}
            onOpenDeal={onOpenDeal}
          />
        )}
      </div>
    </div>
  );
}
