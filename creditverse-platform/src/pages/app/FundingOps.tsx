/**
 * FundingOps Division Workspace — ClickUp-style Partner workspace + Management layer.
 *
 * Information architecture (Agency fulfillment workspace):
 *
 *   BES Agency Sidebar | FundingOps Tree | Selected View
 *
 * The LEFT TREE is the client navigation (Partner → Client → Deal). There is
 * no separate "Clients" tab. Selection kinds:
 *
 *   management → cross-partner aggregate views (Dashboard, Deal List, queues)
 *   partner    → one Company workspace (Dashboard | SOPs & Logins | Deal List |
 *                Readiness | Documents | Submissions | Stipulations | Offers |
 *                Funded). SOPs & Logins is company-level only.
 *   client     → tabbed Client Workspace (Overview | Deal List | Documents |
 *                Activity). No SOPs & Logins here.
 *   deal       → the ClickUp-style Deal Workspace.
 *
 * Deal List is scope-aware: management = all deals, company = that company's
 * deals, client = that client's deals. Same canonical records — filtered
 * projections only, never duplicated.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { FundingOpsHeader } from "@/components/dashboard/fulfillment/FundingOpsHeader";
import {
  FundingOpsTreeSidebar,
  type FundingOpsSelection,
} from "@/components/dashboard/fulfillment/FundingOpsTreeSidebar";
import { FundingOpsManagementDashboard } from "@/components/dashboard/fulfillment/FundingOpsManagementDashboard";
import { FundingGlobalQueue } from "@/components/dashboard/fulfillment/FundingGlobalQueue";
import { FundingClientsPanel } from "@/components/dashboard/fulfillment/FundingClientsPanel";
import { FundingClientWorkspace } from "@/components/dashboard/fulfillment/FundingClientWorkspace";
import { FundingDealWorkspace } from "@/components/dashboard/fulfillment/FundingDealWorkspace";
import { FundingOpsPartnerWorkspace } from "@/components/dashboard/fulfillment/FundingOpsPartnerWorkspace";
import { FundingDealListPanel } from "@/components/dashboard/fulfillment/FundingDealListPanel";
import {
  FundingOpsStoreProvider,
  useFundingOpsStore,
  setFundingStatusChangeHandler,
} from "@/lib/fulfillment/fundingops-client-store";
import { FundingDealStoreProvider } from "@/lib/fulfillment/funding-deal-store";
import {
  FundingOpsAccessProvider,
  useFundingOpsAccess,
} from "@/lib/fulfillment/fundingops-access";
import {
  FUNDING_OPS_PARTNERS,
  type FundingPartnerViewId,
} from "@/lib/fulfillment/fundingops-partners";
import { isActiveFunding } from "@/lib/fulfillment/fundingops-domain";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePartners } from "@/lib/data/use-partners";

export default function FundingOps() {
  return (
    <FundingOpsStoreProvider>
      <FundingDealStoreProvider>
        <FundingOpsAccessProvider>
          <FundingOpsWorkspace />
        </FundingOpsAccessProvider>
      </FundingDealStoreProvider>
    </FundingOpsStoreProvider>
  );
}

function FundingOpsWorkspace() {
  const { clients } = useFundingOpsStore();
  const { canAccessManagement } = useFundingOpsAccess();
  /* Live partners, so a selected partner's scope id is one the database
     recognises and intake can actually save against (rule 2). */
  const { partners } = usePartners("fundingOps", FUNDING_OPS_PARTNERS);
  const [selection, setSelection] = useState<FundingOpsSelection>(() =>
    canAccessManagement
      ? { kind: "management", view: "mgmt-dashboard" }
      : { kind: "partner", partnerId: partners[0]?.id ?? "" },
  );
  const [activeView, setActiveView] =
    useState<FundingPartnerViewId>("dashboard");

  // Deep link (notifications): /app/fundingops?client=<id> opens that client
  // workspace once. The workspace itself reads the record under RLS, so an
  // id the caller may not see renders as not found, never as someone else's.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedClient = searchParams.get("client");
  useEffect(() => {
    if (!linkedClient) return;
    setSelection({ kind: "client", clientId: linkedClient });
    setSearchParams({}, { replace: true });
  }, [linkedClient, setSearchParams]);

  // If the role loses Management access while a Management view is selected,
  // fall back to the first Partner workspace.
  useEffect(() => {
    if (!canAccessManagement && selection.kind === "management") {
      setSelection({
        kind: "partner",
        partnerId: partners[0]?.id ?? "",
      });
    }
  }, [canAccessManagement, selection]);

  const partner =
    selection.kind === "partner"
      ? partners.find((p) => p.id === selection.partnerId)
      : undefined;

  /* Header count from the store's RLS-scoped rows, not the seed array. */
  const partnerActiveCount = partner
    ? clients.filter(
        (c) =>
          (c.organizationId === partner.scopeId ||
            c.outsourcingGroupId === partner.scopeId) &&
          isActiveFunding(c.status),
      ).length
    : 0;

  const headerName =
    selection.kind === "management"
      ? "FundingOps Management"
      : selection.kind === "deal"
        ? "Deal Workspace"
        : selection.kind === "client"
          ? "Client Workspace"
          : (partner?.name ?? "Select a Partner");
  const headerCount =
    selection.kind === "management" ||
    selection.kind === "deal" ||
    selection.kind === "client"
      ? null
      : partnerActiveCount;

  const openClient = (clientId: string) =>
    setSelection({ kind: "client", clientId });
  const openDeal = (dealId: string) => setSelection({ kind: "deal", dealId });

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <FundingOpsHeader partnerName={headerName} clientCount={headerCount} />

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <FundingOpsTreeSidebar
          selected={selection}
          onSelect={(sel) => {
            setSelection(sel);
            if (sel.kind === "partner") setActiveView("dashboard");
          }}
        />

        <div className="flex-1 overflow-y-auto">
          {selection.kind === "management" ? (
            canAccessManagement ? (
              <ManagementView
                view={selection.view}
                onNavigateToView={(v) =>
                  setSelection({ kind: "management", view: v })
                }
                onOpenClient={openClient}
                onOpenDeal={openDeal}
              />
            ) : (
              <AccessDeniedNotice />
            )
          ) : selection.kind === "deal" ? (
            <div className="p-6">
              <FundingDealWorkspace
                dealId={selection.dealId}
                onBack={() =>
                  setSelection({
                    kind: "partner",
                    partnerId: partners[0]?.id ?? "",
                  })
                }
              />
            </div>
          ) : selection.kind === "client" ? (
            <div className="p-6">
              <FundingClientWorkspace
                clientId={selection.clientId}
                onBack={() =>
                  setSelection({
                    kind: "partner",
                    partnerId: partners[0]?.id ?? "",
                  })
                }
                onOpenDeal={openDeal}
              />
            </div>
          ) : partner ? (
            <FundingOpsPartnerWorkspace
              scopeId={partner.scopeId}
              partner={partner}
              activeView={activeView}
              onViewChange={setActiveView}
              onOpenClient={openClient}
              onOpenDeal={openDeal}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center">
              <div>
                <LayoutDashboard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">
                  Select a Partner workspace
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose a Partner from the left to open its FundingOps
                  workspace.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccessDeniedNotice() {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-sm">
        <LayoutDashboard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-foreground">
          Management access required
        </p>
        <p className="text-xs text-muted-foreground">
          The Management layer aggregates records across all Partners and is
          restricted to FundingOps Admin / Manager roles. Your role is scoped to
          a Partner workspace.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Management view (cross-partner)                                     */
/* ------------------------------------------------------------------ */

function ManagementView({
  view,
  onNavigateToView,
  onOpenClient,
  onOpenDeal,
}: {
  view: string;
  onNavigateToView: (v: string) => void;
  onOpenClient: (clientId: string) => void;
  onOpenDeal: (dealId: string) => void;
}) {
  const queueMap: Record<string, string> = {
    "mgmt-readiness": "readiness-queue",
    "mgmt-document": "document-queue",
    "mgmt-submissions": "submissions-queue",
    "mgmt-stipulations": "stipulations-queue",
    "mgmt-offers": "offers-queue",
    "mgmt-funded": "funded-queue",
  };

  if (view === "mgmt-dashboard") {
    return (
      <div className="p-6">
        <FundingOpsManagementDashboard
          onNavigateToView={onNavigateToView}
          onOpenClient={onOpenClient}
        />
      </div>
    );
  }

  if (view === "mgmt-client-list") {
    return (
      <div className="p-6">
        <FundingClientsPanel selectedScope="all" />
      </div>
    );
  }

  if (view === "mgmt-deal-list") {
    return (
      <div className="p-6">
        <FundingDealListPanel selectedScope="all" onOpenDeal={onOpenDeal} />
      </div>
    );
  }

  const queueType = queueMap[view];
  if (queueType) {
    return (
      <div className="p-6">
        <FundingGlobalQueue queueType={queueType} onOpenClient={onOpenClient} />
      </div>
    );
  }

  return null;
}

/* Keep the status-change handler export referenced so the store's webhook
   bridge can be wired later without changing this file's public surface. */
export { setFundingStatusChangeHandler };
