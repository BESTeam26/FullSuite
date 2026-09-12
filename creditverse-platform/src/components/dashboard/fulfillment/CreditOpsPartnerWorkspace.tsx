/**
 * CreditOps Partner workspace — ONE workspace navigation row over the views of
 * a single Partner (Dashboard, Main Client List, the department queues and
 * SOPs & Logins). Every view is a filtered projection of the same canonical
 * client records for `scopeId` (an organization id or an outsourcing group id).
 *
 * Which tabs appear follows the person: Dashboard, Main Client List and SOPs &
 * Logins for everybody, then the queues for the departments they actually
 * work, then the management-only views (Dee, 2026-09-11).
 *
 * Shared by the BES agency division page and by an organization's own
 * CreditOps page: same components, same rows, a different scope. Row Level
 * Security decides what each side actually receives.
 */
import { useEffect } from "react";
import { FulfillmentClientsPanel } from "./FulfillmentClientsPanel";
import { CreditOpsDashboardView } from "./CreditOpsDashboardView";
import { QueueView } from "./QueueViews";
import {
  PARTNER_VIEWS,
  type PartnerViewId,
} from "@/lib/fulfillment/creditops-partners";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import { creditOpsViewsForPerson } from "@/lib/fulfillment/workspace-views";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import { cn } from "@/lib/utils";

export interface CreditOpsPartnerWorkspaceProps {
  /** Client to open on arrival (deep link); null means none. */
  openClientId?: string | null;
  scopeId: string;
  partner: OpsPartner;
  activeView: PartnerViewId;
  onViewChange: (view: PartnerViewId) => void;
  /** The organization's own configured views. Narrowed further by the person. */
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
  const { myDepartments, canAccessManagement } = useCreditOpsAccess();
  /* Two independent filters, and a view has to survive both:
       · what the ORGANIZATION shows its people (`views`, from settings)
       · what THIS PERSON'S job includes (department and capability)
     Dee, 2026-09-11: "Do not show every department tab to every employee."
     Presentation only — the rows behind a hidden queue were already
     protected by their own policies (rule 1). */
  const mine = new Set(creditOpsViewsForPerson({ departments: myDepartments, canAccessManagement }));
  const offered = PARTNER_VIEWS.filter(
    (v) => mine.has(v.id) && (!views || views.includes(v.id)),
  );

  /* A tab that is no longer offered must not stay selected — the person would
     be looking at a queue their navigation says they do not work. */
  useEffect(() => {
    if (offered.length > 0 && !offered.some((v) => v.id === activeView)) {
      onViewChange(offered[0].id);
    }
  }, [offered, activeView, onViewChange]);
  return (
    <div className="flex flex-col">
      {/* ONE workspace navigation row — the views this person's job includes */}
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
