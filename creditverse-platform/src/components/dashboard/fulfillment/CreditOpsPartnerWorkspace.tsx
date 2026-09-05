/**
 * CreditOps Partner workspace — ONE workspace navigation row over the nine
 * views of a single Partner (Dashboard, SOPs & Logins, Main Client List and the
 * queues). Every view is a filtered projection of the same canonical client
 * records for `scopeId` (an organization id or an outsourcing group id).
 *
 * Shared by the BES agency division page and by an organization's own
 * CreditOps page: same components, same rows, a different scope. Row Level
 * Security decides what each side actually receives.
 */
import { FulfillmentClientsPanel } from "./FulfillmentClientsPanel";
import { CreditOpsDashboardView } from "./CreditOpsDashboardView";
import { QueueView } from "./QueueViews";
import {
  PARTNER_VIEWS,
  type PartnerViewId,
} from "@/lib/fulfillment/creditops-partners";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import { cn } from "@/lib/utils";

export interface CreditOpsPartnerWorkspaceProps {
  /** Client to open on arrival (deep link); null means none. */
  openClientId?: string | null;
  scopeId: string;
  partner: OpsPartner;
  activeView: PartnerViewId;
  onViewChange: (view: PartnerViewId) => void;
  /** Views to offer, in order. Defaults to all nine (the agency always sees all). */
  views?: readonly PartnerViewId[];
}

export function CreditOpsPartnerWorkspace({
  scopeId,
  partner,
  activeView,
  onViewChange,
  openClientId = null,
  views,
}: CreditOpsPartnerWorkspaceProps) {
  const offered = views
    ? PARTNER_VIEWS.filter((v) => views.includes(v.id))
    : PARTNER_VIEWS;
  return (
    <div className="flex flex-col">
      {/* ONE workspace navigation row — the 9 views of this Partner */}
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
        {activeView === "main-list" ? (
          <FulfillmentClientsPanel
            selectedScope={scopeId}
            partner={partner}
            initialOpenClientId={openClientId}
          />
        ) : activeView === "dashboard" ? (
          <CreditOpsDashboardView
            selectedScope={scopeId}
            partnerName={partner.name}
            onNavigateToView={(v) => onViewChange(v as PartnerViewId)}
          />
        ) : (
          <QueueView queueType={activeView} selectedScope={scopeId} />
        )}
      </div>
    </div>
  );
}
