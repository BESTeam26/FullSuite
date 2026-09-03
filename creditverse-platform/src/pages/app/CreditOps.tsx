/**
 * CreditOps Division Workspace — ClickUp-style Partner workspace + Management layer.
 *
 * Three structural columns. One workspace navigation. That's it.
 *
 *   BES Agency Sidebar | CreditOps Tree | Selected View (Management or Partner)
 *
 * The Management layer sits above individual Partner workspaces. Its views
 * aggregate authorized records from ALL Partners. Partner workspaces scope to
 * one Partner. Same canonical client records — different scope.
 */

import { useState, useEffect } from "react";
import { CreditOpsHeader } from "@/components/dashboard/fulfillment/CreditOpsHeader";
import {
  CreditOpsTreeSidebar,
  type CreditOpsSelection,
} from "@/components/dashboard/fulfillment/CreditOpsTreeSidebar";
import { CreditOpsManagementDashboard } from "@/components/dashboard/fulfillment/CreditOpsManagementDashboard";
import { CreditOpsGlobalQueue } from "@/components/dashboard/fulfillment/CreditOpsGlobalQueue";
import { CreditOpsWebhookPanel } from "@/components/dashboard/fulfillment/CreditOpsWebhookPanel";
import { CreditOpsDashboardView } from "@/components/dashboard/fulfillment/CreditOpsDashboardView";
import { FulfillmentClientsPanel } from "@/components/dashboard/fulfillment/FulfillmentClientsPanel";
import { QueueView } from "@/components/dashboard/fulfillment/QueueViews";
import { StatusGuideModal } from "@/components/dashboard/fulfillment/StatusGuideModal";
import {
  CreditOpsStoreProvider,
  setStatusChangeHandler,
} from "@/lib/fulfillment/creditops-client-store";
import {
  CreditOpsWebhookProvider,
  useCreditOpsWebhooks,
} from "@/lib/fulfillment/creditops-webhooks";
import {
  CreditOpsAccessProvider,
  useCreditOpsAccess,
} from "@/lib/fulfillment/creditops-access";
import {
  CREDIT_OPS_PARTNERS,
  PARTNER_VIEWS,
  type PartnerViewId,
} from "@/lib/fulfillment/creditops-partners";
import { seedFulfillmentClients } from "@/lib/fulfillment/fulfillment-client-seed";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

/** Connects the store's status-change hook to the webhook bridge. */
function WebhookBridge() {
  const webhooks = useCreditOpsWebhooks();
  useEffect(() => {
    setStatusChangeHandler((payload) => webhooks.pushStatusChange(payload));
    return () => setStatusChangeHandler(null);
  }, [webhooks]);
  return null;
}

const INACTIVE_STATUSES = [
  "Completed",
  "Archived",
  "Archived / Inactive",
  "Graduated",
];
const isActive = (status: string) => !INACTIVE_STATUSES.includes(status);

export default function CreditOps() {
  return (
    <CreditOpsStoreProvider>
      <CreditOpsAccessProvider>
        <CreditOpsWebhookProvider>
          <CreditOpsWorkspace />
        </CreditOpsWebhookProvider>
      </CreditOpsAccessProvider>
    </CreditOpsStoreProvider>
  );
}

function CreditOpsWorkspace() {
  const { canAccessManagement } = useCreditOpsAccess();
  const [selection, setSelection] = useState<CreditOpsSelection>(() =>
    // Non-management roles never start on the Management layer — they land
    // on their first authorized Partner workspace instead.
    canAccessManagement
      ? { kind: "management", view: "mgmt-dashboard" }
      : { kind: "partner", partnerId: CREDIT_OPS_PARTNERS[0]?.id ?? "" },
  );
  const [activeView, setActiveView] = useState<PartnerViewId>("dashboard");
  const [isStatusGuideOpen, setIsStatusGuideOpen] = useState(false);

  // If the role loses Management access while a Management view is selected,
  // fall back to the first Partner workspace so nothing restricted renders.
  useEffect(() => {
    if (!canAccessManagement && selection.kind === "management") {
      setSelection({
        kind: "partner",
        partnerId: CREDIT_OPS_PARTNERS[0]?.id ?? "",
      });
    }
  }, [canAccessManagement, selection]);

  const partner =
    selection.kind === "partner"
      ? CREDIT_OPS_PARTNERS.find((p) => p.id === selection.partnerId)
      : undefined;

  const partnerActiveCount = partner
    ? seedFulfillmentClients.filter(
        (c) =>
          (c.organizationId === partner.scopeId ||
            c.outsourcingGroupId === partner.scopeId) &&
          isActive(c.status),
      ).length
    : 0;

  const headerName =
    selection.kind === "management"
      ? "CreditOps Management"
      : (partner?.name ?? "Select a Partner");
  const headerCount =
    selection.kind === "management" ? null : partnerActiveCount;

  return (
    <>
      <WebhookBridge />
      <div className="flex min-h-screen flex-col bg-muted/20">
        <CreditOpsHeader
          partnerName={headerName}
          clientCount={headerCount}
          onOpenStatusGuide={() => setIsStatusGuideOpen(true)}
        />

        <div className="flex flex-1 overflow-hidden">
          <CreditOpsTreeSidebar
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
                />
              ) : (
                <AccessDeniedNotice />
              )
            ) : partner ? (
              <PartnerWorkspace
                scopeId={partner.scopeId}
                partner={partner}
                activeView={activeView}
                onViewChange={setActiveView}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center">
                <div>
                  <LayoutDashboard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-semibold text-foreground">
                    Select a Partner workspace
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Choose a Partner from the left to open its CreditOps
                    workspace.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <StatusGuideModal
          isOpen={isStatusGuideOpen}
          onClose={() => setIsStatusGuideOpen(false)}
        />
      </div>
    </>
  );
}

/* Management layer is restricted to management roles. */
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
          restricted to CreditOps Admin / Manager roles. Your role is scoped to
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
}: {
  view: string;
  onNavigateToView: (v: string) => void;
}) {
  // Map management view ids to the actual queue types
  const queueMap: Record<string, string> = {
    "mgmt-dispute-queue": "dispute-queue",
    "mgmt-onboarding-queue": "onboarding-queue",
    "mgmt-support-queue": "support-queue",
    "mgmt-escalation-queue": "escalation-queue",
    "mgmt-complaints-queue": "complaints-queue",
    "mgmt-bureau-queue": "bureau-queue",
  };

  if (view === "mgmt-dashboard") {
    return (
      <div className="p-6">
        <CreditOpsManagementDashboard onNavigateToView={onNavigateToView} />
      </div>
    );
  }

  if (view === "mgmt-main-list") {
    return (
      <div className="p-6">
        <FulfillmentClientsPanel selectedScope="all" />
      </div>
    );
  }

  if (view === "mgmt-webhooks") {
    return (
      <div className="p-6">
        <CreditOpsWebhookPanel />
      </div>
    );
  }

  const queueType = queueMap[view];
  if (queueType) {
    return (
      <div className="p-6">
        <CreditOpsGlobalQueue queueType={queueType} />
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Partner workspace (single Partner)                                  */
/* ------------------------------------------------------------------ */

interface PartnerWorkspaceProps {
  scopeId: string;
  partner: (typeof CREDIT_OPS_PARTNERS)[number];
  activeView: PartnerViewId;
  onViewChange: (view: PartnerViewId) => void;
}

function PartnerWorkspace({
  scopeId,
  partner,
  activeView,
  onViewChange,
}: PartnerWorkspaceProps) {
  return (
    <div className="flex flex-col">
      {/* ONE workspace navigation row — the 9 views of this Partner */}
      <div className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-4">
        {PARTNER_VIEWS.map((view) => (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3.5 py-3 text-xs font-bold transition-all",
              activeView === view.id
                ? "border-emerald-600 bg-emerald-500/10 text-emerald-700"
                : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeView === "main-list" ? (
          <FulfillmentClientsPanel selectedScope={scopeId} partner={partner} />
        ) : activeView === "dashboard" ? (
          <CreditOpsDashboardView
            selectedScope={scopeId}
            onNavigateToView={(v) => onViewChange(v as PartnerViewId)}
          />
        ) : (
          <QueueView queueType={activeView} selectedScope={scopeId} />
        )}
      </div>
    </div>
  );
}
