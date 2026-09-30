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

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { clientGroupKey } from "@/lib/fulfillment/ops-client-domain";
import { partnerForClient } from "@/lib/fulfillment/creditops-case-selection";
import { returnTo } from "@/lib/nav/return-to";
import { ClientWorkWorkspace } from "@/components/dashboard/fulfillment/ClientWorkWorkspace";
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
  /* ── WHICH LIST YOU ARE ON LIVES IN THE ADDRESS ─────────────────────────
     Dee, 2026-09-26: "if I select a client and go back to client list, I
     wanna make sure we go back to the actual list we're working on and not on
     the main list or other list."

     This used to be two `useState`s, so `/app/creditops` meant "whatever the
     defaults are" and there was no way for Back to land anywhere else. Opening
     a client leaves the page entirely — a client is its own route, which is
     what makes it linkable — and returning rebuilt the page from scratch on
     the shared Main Client List, whichever partner you had been working.

     In the URL, the selection survives the round trip, a browser refresh, and
     being sent to somebody else. `?partner=<id>` selects a partner folder and
     `view` is then its workspace tab; with no `partner`, `view` is the
     management destination. Everybody still lands on the shared dashboard
     when the address says nothing.

     The setters keep the shapes the call sites already use, so choosing a
     partner, opening a queue and switching tabs are unchanged apart from
     where the answer is stored. */
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const selection = useMemo<CreditOpsSelection>(() => {
    const partnerId = searchParams.get("partner");
    if (partnerId) return { kind: "partner", partnerId };
    const view = searchParams.get("view");
    return {
      kind: "management",
      view: view?.startsWith("mgmt-") ? view : "mgmt-main-list",
    };
  }, [searchParams]);

  const activeView = ((searchParams.get("view") ?? "main-list") as PartnerViewId);

  /**
   * Patch the query string, composing with any patch made earlier in the same
   * click.
   *
   * ── THE BUG THIS FIXES (mine, 2026-09-27) ──────────────────────────────
   *
   * `setSearchParams(fn)` hands `fn` the params from the LAST RENDER — it
   * closes over them (react-router-dom 6.30, `useSearchParams`). Two calls in
   * one event handler therefore BOTH start from the pre-click value, and the
   * second silently discards what the first wrote.
   *
   * Choosing a partner did exactly that: `setSelection` wrote
   * `partner=X&view=main-list`, then the workspace tab was set from a copy
   * that had never had `partner` — so it was dropped, and clicking a partner
   * in the tree appeared to do nothing or left you on the previous one. That
   * is Dee's report of 2026-09-28: "regardless of which Partner I click …
   * not responding or not loading correctly."
   *
   * The ref carries the params FORWARD within a tick and is reset from the
   * router on every render, so a second patch builds on the first instead of
   * on a stale snapshot. Reading `window.location` would also work under
   * BrowserRouter and silently not under MemoryRouter, which is how the test
   * for this caught it.
   */
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;

  const patchParams = useCallback(
    (patch: (p: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(paramsRef.current);
      patch(next);
      /* So the NEXT patch in this same tick composes with this one. */
      paramsRef.current = next;
      /* To the CreditOps path EXPLICITLY, not "?query" relative to wherever
         we are. A client is open at /app/creditops/cases/:id inside this
         same shell (Dee, 2026-09-29: "Clicking another Partner from the
         sidebar should take me directly to that Partner's client list
         without needing to close the current client first"); a relative
         write would have kept the case open under the new partner. The
         shell stays mounted across it — only the pane's content changes. */
      navigate({ pathname: "/app/creditops", search: `?${next.toString()}` }, { replace });
    },
    [navigate],
  );

  const setSelection = useCallback(
    (sel: CreditOpsSelection) =>
      patchParams((p) => {
        if (sel.kind === "partner") {
          p.set("partner", sel.partnerId);
          /* A partner folder opens on its client list; its tab id lives in the
             same `view` param, which the management ids never collide with
             because those are all prefixed `mgmt-`. */
          p.set("view", "main-list");
        } else {
          p.delete("partner");
          p.set("view", sel.view);
        }
      }),
    [patchParams],
  );

  const setActiveView = useCallback(
    (view: PartnerViewId) => patchParams((p) => p.set("view", view)),
    [patchParams],
  );
  /* The partner a global queue was opened for, so it arrives filtered. Cleared
     when a queue is chosen from the navigation, which means "all partners". */
  const [queuePartnerScope, setQueuePartnerScope] = useState<string | null>(null);
  const [isStatusGuideOpen, setIsStatusGuideOpen] = useState(false);

  // Deep link (notifications): /app/creditops?client=<id>. The client is
  // resolved through the store, which is already RLS-scoped, so an id the
  // caller may not see resolves to nothing and nothing is claimed. On a hit:
  // select its Partner, open the client list on that record, drop the param.
  const { clients } = useCreditOpsStore();

  /* ── A CLIENT OPEN INSIDE THIS SHELL ──────────────────────────────────
     Dee, 2026-09-29: "Keep the CreditOps workspace sidebar permanently
     visible… The Client Workspace should open in the content area to the
     right of that CreditOps sidebar, not replace it."

     /app/creditops/cases/:id renders THIS page, not a separate one, so the
     tree, the header and every cached query stay exactly where they were —
     the address is kept (linkable, "open in new tab") and the shell is
     kept. Only the pane changes.

     While a client is open, the tree highlights the partner that client
     belongs to, derived from the record rather than from the URL — the
     URL names the client, the client names the partner. */
  const { id: openCaseId = null } = useParams<{ id: string }>();
  const location = useLocation();
  const caseSelection = useMemo(
    () => partnerForClient(clients, partners, openCaseId),
    [clients, partners, openCaseId],
  );
  const treeSelection: CreditOpsSelection = caseSelection ?? selection;

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
    } else if (client) {
      /* Visible, but not inside a partner folder we can name. The shared Main
         Client List is universal by Dee's instruction, so it always has
         somewhere honest to open — better than silently doing nothing, which
         is what a link to such a client used to do. */
      setSelection({ kind: "management", view: "mgmt-main-list" });
      setLinkedOpenClientId(client.id);
    }
    /* Drop ONLY the deep-link param. This used to clear the whole query,
       which now would erase the partner and view it had just set. */
    patchParams((p) => p.delete("client"), true);
  }, [linkedClient, clients, partners, patchParams, setSelection, setActiveView]);

  // A view the person may not open must not stay selected — for instance when
  // their department assignment changes mid-session. The shared dashboard is
  // always available, so there is somewhere honest to land.
  useEffect(() => {
    if (selection.kind === "management" && !mayOpen(selection.view)) {
      setSelection({ kind: "management", view: "mgmt-main-list" });
    }
  }, [mayOpen, selection]);

  /* From the case-aware selection: with a client open, this is the partner
     the client belongs to, so the header and the tree agree. */
  const partner =
    treeSelection.kind === "partner"
      ? partners.find((p) => p.id === treeSelection.partnerId)
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

  /* "CreditOps Management" is a manager's title (Dee, 2026-09-19); an agent
     works in CreditOps. */
  const headerName =
    treeSelection.kind === "management"
      ? (canAccessManagement ? "CreditOps Management" : "CreditOps")
      : (partner?.name ?? "Select a Partner");
  const headerCount =
    treeSelection.kind === "management" ? null : partnerActiveCount;

  return (
    <>
      <WebhookBridge />
      {/* An app FRAME, not a long page: the shell is exactly one
          viewport tall and each pane scrolls inside itself, so the
          partner tree and the header stay put while the client list
          moves. `dvh` rather than `vh` because on a phone `100vh`
          measures the viewport WITHOUT the browser chrome and cuts the
          last row off (rule 25: mobile is production). */}
      <div className="flex h-dvh flex-col overflow-hidden bg-muted/20">
        <CreditOpsHeader
          partnerName={headerName}
          clientCount={headerCount}
          onOpenStatusGuide={() => setIsStatusGuideOpen(true)}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <CreditOpsTreeSidebar
            selected={treeSelection}
            onSelect={(sel) => {
              /* The sidebar has already painted the choice; the navigation
                 (and the pane it renders) is a transition. setSelection
                 already opens a partner on its client list: ONE navigation. */
              startTransition(() => {
                setSelection(sel);
                /* Chosen from the navigation, a queue means every partner. */
                setQueuePartnerScope(null);
              });
            }}
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {openCaseId ? (
              /* The client, INSIDE the shell. Everything around it — tree,
                 header, partner highlight — is the same mounted instance the
                 list had. No max-width: the work area and the activity rail
                 share whatever this pane has (Dee: "fit responsively inside
                 the remaining content width"). */
              <div className="p-4 md:p-6">
                <ClientWorkWorkspace
                  clientId={openCaseId}
                  onBack={() => navigate(returnTo(location.state, "/app/creditops"))}
                  backLabel="Back to clients"
                  /* Complete & next client stays in the shell, and carries the
                     same return address so Back still lands on the list. */
                  onOpenClient={(id) =>
                    navigate(`/app/creditops/cases/${id}`, { state: location.state })
                  }
                />
              </div>
            ) : selection.kind === "management" ? (
              mayOpen(selection.view) ? (
                <ManagementView
                  view={selection.view}
                  partnerScope={queuePartnerScope}
                  openClientId={linkedOpenClientId}
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
  openClientId,
  onNavigateToView,
}: {
  view: string;
  /** Narrow a queue to one partner, when it was opened from that partner. */
  partnerScope: string | null;
  /** A client to open on arrival, from ?client= — see the deep link above. */
  openClientId?: string | null;
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
        <FulfillmentClientsPanel selectedScope="all" initialOpenClientId={openClientId ?? null} />
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
