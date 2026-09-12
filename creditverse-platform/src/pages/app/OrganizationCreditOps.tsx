/**
 * CreditOps for an organization — the SAME Partner workspace BES uses, scoped
 * to the active organization's own client records.
 *
 * No copies and no second engine: the client list, client workspace, dispute
 * engine, activity, documents and queues are the components the agency page
 * mounts, reading the canonical rows Row Level Security already lets the
 * organization see. BES-only chrome — the Partner tree, the Management layer,
 * webhooks — is simply not mounted here (rule 2, rule 17).
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAgency } from "@/lib/agency-context";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { partnerForOrganization } from "@/lib/data/partners";
import { CreditOpsStoreProvider } from "@/lib/fulfillment/creditops-client-store";
import { CreditOpsAccessProvider, useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import type { PartnerViewId } from "@/lib/fulfillment/creditops-partners";
import { visibleCreditOpsViews } from "@/lib/fulfillment/workspace-views";
import { CreditOpsHeader } from "@/components/dashboard/fulfillment/CreditOpsHeader";
import { CreditOpsPartnerWorkspace } from "@/components/dashboard/fulfillment/CreditOpsPartnerWorkspace";
import { StatusGuideModal } from "@/components/dashboard/fulfillment/StatusGuideModal";
import { NoActiveOrganization } from "@/components/dashboard/NoActiveOrganization";

export default function OrganizationCreditOps() {
  return (
    <CreditOpsStoreProvider>
      <CreditOpsAccessProvider>
        <OrganizationCreditOpsWorkspace />
      </CreditOpsAccessProvider>
    </CreditOpsStoreProvider>
  );
}

function OrganizationCreditOpsWorkspace() {
  const { activeOrganization } = useAgency();
  const fulfillment = useFulfillment();
  const access = useCreditOpsAccess();
  const [activeView, setActiveView] = useState<PartnerViewId>("dashboard");
  const [isStatusGuideOpen, setIsStatusGuideOpen] = useState(false);
  /* Deep link from search / notifications: ?client=<id> opens the Main Client
     List on that record. The id is only ever handed to the RLS-scoped list;
     an id the person may not see resolves to nothing. */
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedClient = searchParams.get("client");
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  useEffect(() => {
    if (!linkedClient) return;
    setOpenClientId(linkedClient);
    setActiveView("main-list");
    setSearchParams({}, { replace: true });
  }, [linkedClient, setSearchParams]);

  if (!activeOrganization) return <NoActiveOrganization module="CreditOps" />;

  const partner = partnerForOrganization(
    "creditOps",
    activeOrganization,
    fulfillment.engagements,
  );
  /* The organization decides which views its people see (Settings →
     Workspace views). A hidden view that is somehow active falls back to the
     dashboard rather than rendering an unlisted tab. */
  const organizationViews = visibleCreditOpsViews(activeOrganization.workspaceViews);
  /* Then the role's own view list (Settings → Roles & access), if configured;
     the dashboard always survives so the page is never empty. */
  const views = access.allowedViews.length
    ? organizationViews.filter((v) => v === "dashboard" || access.allowedViews.includes(v))
    : organizationViews;
  const currentView = views.includes(activeView) ? activeView : "dashboard";

  return (
    <div className="flex min-h-full flex-col bg-muted/20">
      <CreditOpsHeader
        partnerName={`${activeOrganization.name} · CreditOps`}
        clientCount={null}
        onOpenStatusGuide={() => setIsStatusGuideOpen(true)}
      />
      <CreditOpsPartnerWorkspace
        scopeId={activeOrganization.id}
        partner={partner}
        activeView={currentView}
        onViewChange={setActiveView}
        views={views}
        /* No global CreditOps layer above an organization's own page, so its
           department queues live here — the one place they can. */
        level="organization"
        openClientId={openClientId}
      />
      <StatusGuideModal
        isOpen={isStatusGuideOpen}
        onClose={() => setIsStatusGuideOpen(false)}
      />
    </div>
  );
}
