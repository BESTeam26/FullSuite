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

import { useCallback, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { clientGroupKey } from "@/lib/fulfillment/ops-client-domain";
import { isActiveClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { CreditOpsHeader } from "@/components/dashboard/fulfillment/CreditOpsHeader";
import {
  CreditOpsTreeSidebar,
  type CreditOpsSelection,
} from "@/components/dashboard/fulfillment/CreditOpsTreeSidebar";
import { CreditOpsManagementDashboard } from "@/components/dashboard/fulfillment/CreditOpsManagementDashboard";
import { CreditOpsGlobalQueue } from "@/components/dashboard/fulfillment/CreditOpsGlobalQueue";
import { CreditOpsWebhookPanel } from "@/components/dashboard/fulfillment/CreditOpsWebhookPanel";
import { CreditOpsPartnerWorkspace } from "@/components/dashboard/fulfillment/CreditOpsPartnerWorkspace";
import { FulfillmentClientsPanel } from "@/components/dashboard/fulfillment/FulfillmentClientsPanel";
import { StatusGuideModal } from "@/components/dashboard/fulfillment/StatusGuideModal";
import {
  CreditOpsStoreProvider,
  useCreditOpsStore,
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
  type PartnerViewId,
} from "@/lib/fulfillment/creditops-partners";
import { creditOpsViewsForPerson } from "@/lib/fulfillment/workspace-views";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePartners } from "@/lib/data/use-partners";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";

/** Connects the store's status-change hook to the webhook bridge. */
function WebhookBridge() {
  const webhooks = useCreditOpsWebhooks();
  useEffect(() => {
    setStatusChangeHandler((payload) => webhooks.pushStatusChange(payload));
    return () => setStatusChangeHandler(null);
  }, [webhooks]);
  return null;
}


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
  const { partners } = usePartners("creditOps", CREDIT_OPS_PARTNERS);
  const { canAccessManagement, myDepartments } = useCreditOpsAccess();
  /* Which cross-partner views this person may open. The whole layer used to
     be management-only; Dee's ruling (2026-09-11) is that the Dashboard and
     the Main Client List are the SHARED CreditOps workspace, and only the
     Escalation Queue and the CRM Signal Log stay management tooling. Row
     Level Security still decides which client rows arrive in either. */
  const mayOpen = useCallback(
    (view: string) => {
      if (view === "mgmt-webhooks") return canAccessManagement;
      const id = view.replace(/^mgmt-/, "");
      return creditOpsViewsForPerson({ departments: myDepartments, canAccessManagement }).includes(
        id as PartnerViewId,
      );
    },
    [myDepartments, canAccessManagement],
  );
  /* Everybody lands on the shared dashboard now — there is no longer a layer
     an agent is kept out of wholesale. */
  const [selection, setSelection] = useState<CreditOpsSelection>({
    kind: "management",
    view: "mgmt-dashboard",
  });
  const [activeView, setActiveView] = useState<PartnerViewId>("dashboard");
  /* The partner a global queue was opened for, so it arrives filtered. Cleared
     when a queue is chosen from the navigation, which means "all partners". */
  const [queuePartnerScope, setQueuePartnerScope] = useState<string | null>(null);
  const [isStatusGuideOpen, setIsStatusGuideOpen] = useState(false);

  // Deep link (notifications): /app/creditops?client=<id>. The client is
  // resolved through the store, which is already RLS-scoped, so an id the
  // caller may not see resolves to nothing and nothing is claimed. On a hit:
  // select its Partner, open the client list on that record, drop the param.
  const { clients } = useCreditOpsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedClient = searchParams.get("client");
  const [linkedOpenClientId, setLinkedOpenClientId] = useState<string | null>(null);
  useEffect(() => {
    // The store exposes no loading flag; an empty list means "not yet" (or
    // nothing visible), so wait rather than conclude the record is gone.
    if (!linkedClient || clients.length === 0) return;
    const client = clients.find((c) => c.id === linkedClient);
    const owner = client
      ? partners.find((p) => p.scopeId === clientGroupKey(client))
      : undefined;
    if (client && owner) {
      setSelection({ kind: "partner", partnerId: owner.id });
      setActiveView("main-list");
      setLinkedOpenClientId(client.id);
    }
    setSearchParams({}, { replace: true });
  }, [linkedClient, clients, partners, setSearchParams]);

  // A view the person may not open must not stay selected — for instance when
  // their department assignment changes mid-session. The shared dashboard is
  // always available, so there is somewhere honest to land.
  useEffect(() => {
    if (selection.kind === "management" && !mayOpen(selection.view)) {
      setSelection({ kind: "management", view: "mgmt-dashboard" });
    }
  }, [mayOpen, selection]);

  const partner =
    selection.kind === "partner"
      ? partners.find((p) => p.id === selection.partnerId)
      : undefined;

  /* Header count from the store's RLS-scoped rows — the seed array counted
     sample clients no matter which live Partner was open. */
  const partnerActiveCount = partner
    ? clients.filter(
        (c) =>
          (c.organizationId === partner.scopeId ||
            c.outsourcingGroupId === partner.scopeId) &&
          isActiveClient(c),
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

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <CreditOpsTreeSidebar
            selected={selection}
            onSelect={(sel) => {
              setSelection(sel);
              /* Chosen from the navigation, a queue means every partner. */
              setQueuePartnerScope(null);
              if (sel.kind === "partner") setActiveView("dashboard");
            }}
          />

          <div className="flex-1 overflow-y-auto">
            {selection.kind === "management" ? (
              mayOpen(selection.view) ? (
                <ManagementView
                  view={selection.view}
                  partnerScope={queuePartnerScope}
                  onNavigateToView={(v) =>
                    setSelection({ kind: "management", view: v })
                  }
                />
              ) : (
                <AccessDeniedNotice />
              )
            ) : partner ? (
              <CreditOpsPartnerWorkspace
                scopeId={partner.scopeId}
                partner={partner}
                activeView={activeView}
                onViewChange={setActiveView}
                openClientId={linkedOpenClientId}
                /* A summary tile opens the ONE global queue, narrowed to this
                   partner — not a second queue inside the workspace. */
                onOpenGlobalQueue={(queueId) => {
                  setQueuePartnerScope(partner.scopeId);
                  setSelection({ kind: "management", view: `mgmt-${queueId}` });
                }}
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

/* Reached only by typing a URL or by an assignment changing mid-session: the
   navigation never offers a view this appears for. */
function AccessDeniedNotice() {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-sm">
        <LayoutDashboard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-foreground">
          Not part of your workspace
        </p>
        <p className="text-xs text-muted-foreground">
          This queue belongs to a department you are not assigned to. You can
          still look up any CreditOps client in the Main Client List.
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
  partnerScope,
  onNavigateToView,
}: {
  view: string;
  /** Narrow a queue to one partner, when it was opened from that partner. */
  partnerScope: string | null;
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
        <CreditOpsGlobalQueue queueType={queueType} partnerScope={partnerScope} />
      </div>
    );
  }

  return null;
}
