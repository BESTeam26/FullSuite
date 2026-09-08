/**
 * CreditOps Tree Sidebar — ClickUp-style hierarchy.
 *
 *   CreditOps (Space)
 *   ├── Management layer (cross-partner views — aggregates ALL Partners)
 *   │   ├── Dashboard
 *   │   ├── Main Client List
 *   │   ├── Dispute Queue
 *   │   ├── ... (all queues)
 *   │   └── Webhooks
 *   │
 *   ├── ManagedOps (Folder)
 *   │   ├── Partner A (List/Workspace)
 *   │   └── ...
 *   ├── Outsourcing (Folder)
 *   │   └── ...
 *   └── CreditOps Users (Folder)
 *       └── ...
 *
 * The Management layer sits above individual Partner workspaces. Its views
 * aggregate authorized records from ALL Partners. Partner workspaces scope to
 * one Partner. Same canonical client records — different scope.
 *
 * Counts show ACTIVE clients only (excludes Completed / Archived / Graduated).
 */

import { useCallback, useMemo, useState } from "react";
import { Building2, FileText, LayoutDashboard, BarChart3, Webhook } from "lucide-react";
import {
  CREDIT_OPS_PARTNERS,
  type CreditOpsPartner,
} from "@/lib/fulfillment/creditops-partners";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import { cn } from "@/lib/utils";
import { usePartners } from "@/lib/data/use-partners";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import {
  OpsTreeFolder,
  OpsTreeManagementSection,
} from "./OpsTreeSidebarParts";
import { ModuleRail, type ModuleRailItem } from "@/components/dashboard/module-rail/ModuleRail";

export type CreditOpsSelection =
  { kind: "management"; view: string } | { kind: "partner"; partnerId: string };

interface CreditOpsTreeSidebarProps {
  selected: CreditOpsSelection;
  onSelect: (selection: CreditOpsSelection) => void;
}

/* Statuses that are NOT counted as active volume */
const INACTIVE_STATUSES = [
  "Completed",
  "Archived",
  "Archived / Inactive",
  "Graduated",
];

const isActive = (status: string) => !INACTIVE_STATUSES.includes(status);

/**
 * Active clients per partner, counted from the canonical list.
 *
 * This counted `seedFulfillmentClients` while the partner tree above it
 * listed *live* partners. Seed clients carry invented scope ids, so nothing
 * ever matched a real partner and every count in the tree read 0 — beside a
 * client list showing seventeen. The array is the one the store already holds
 * for this page, so deriving the count from it costs no request (rule 14).
 */
const countActiveForPartner = (
  clients: readonly { organizationId?: string; outsourcingGroupId?: string; status: string }[],
  scopeId: string,
) =>
  clients.filter(
    (c) =>
      (c.organizationId === scopeId || c.outsourcingGroupId === scopeId) &&
      isActive(c.status),
  ).length;

const MANAGEMENT_VIEWS = [
  { id: "mgmt-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "mgmt-main-list", label: "Main Client List", icon: BarChart3 },
  { id: "mgmt-dispute-queue", label: "Dispute Queue", icon: BarChart3 },
  { id: "mgmt-onboarding-queue", label: "Onboarding Queue", icon: BarChart3 },
  { id: "mgmt-support-queue", label: "Support Queue", icon: BarChart3 },
  { id: "mgmt-escalation-queue", label: "Escalation Queue", icon: BarChart3 },
  {
    id: "mgmt-complaints-queue",
    label: "Complaints & Mailing",
    icon: BarChart3,
  },
  { id: "mgmt-bureau-queue", label: "Bureau Calling", icon: BarChart3 },
  /* The outbound-CRM signal log: what this platform pushed to GHL /
     DisputeFox and when. An audit trail needs a screen (rule 10). */
  { id: "mgmt-webhooks", label: "CRM Signal Log", icon: Webhook },
];

export function CreditOpsTreeSidebar({
  selected,
  onSelect,
}: CreditOpsTreeSidebarProps) {
  /* Live organizations and outsourcing groups. The constants remain only as
     the demo fallback — their scope ids are invented, so a live session must
     navigate by real ones or intake cannot save (rule 2). */
  const { partners } = usePartners("creditOps", CREDIT_OPS_PARTNERS);
  const { canAccessManagement } = useCreditOpsAccess();
  /* The same array the client list renders — one source, so the tree count and
     the list can never disagree. */
  const { clients } = useCreditOpsStore();
  const countFor = useCallback(
    (scopeId: string) => countActiveForPartner(clients, scopeId),
    [clients],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    management: true,
    managed: true,
    outsourcing: true,
    creditops_users: true,
  });

  const toggleFolder = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const managedPartners = partners.filter((p) => p.group === "managed");
  const outsourcingPartners = partners.filter((p) => p.group === "outsourcing");
  const creditopsUserPartners = partners.filter(
    (p) => p.group === "creditops_users",
  );

  const totalActive = partners.reduce(
    (sum, p) => sum + countFor(p.scopeId),
    0,
  );

  /* useCallback so the rail's nav model can depend on them by name rather
     than on `selected` and a lint suppression. */
  const isMgmtViewActive = useCallback(
    (viewId: string) => selected.kind === "management" && selected.view === viewId,
    [selected],
  );
  const isPartnerActive = useCallback(
    (partnerId: string) => selected.kind === "partner" && selected.partnerId === partnerId,
    [selected],
  );

  const renderPartner = (partner: OpsPartner) => {
    const count = countFor(partner.scopeId);
    const isSelected = isPartnerActive(partner.id);
    return (
      <button
        key={partner.id}
        onClick={() => onSelect({ kind: "partner", partnerId: partner.id })}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          isSelected
            ? "bg-primary font-bold text-primary-foreground"
            : "text-foreground hover:bg-muted/60",
        )}
      >
        <div className="flex items-center gap-1.5">
          <Building2
            className={cn(
              "h-3.5 w-3.5",
              isSelected ? "text-primary-foreground" : "text-muted-foreground",
            )}
          />
          <span>{partner.name}</span>
        </div>
        <span
          className={cn(
            "text-[10px]",
            isSelected ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      </button>
    );
  };

  const renderGroup = (
    key: string,
    label: string,
    partners: CreditOpsPartner[],
    accent: string,
  ) => (
    <OpsTreeFolder
      label={label}
      accent={accent}
      count={partners.reduce(
        (sum, p) => sum + countFor(p.scopeId),
        0,
      )}
      open={!!expanded[key]}
      onToggle={() => toggleFolder(key)}
    >
      {partners.map(renderPartner)}
    </OpsTreeFolder>
  );

  /* ── ONE nav model, two presentations (Dee, §28) ─────────────────────
     The collapsed icon rail is built from the SAME authorized arrays the
     expanded tree renders below. Two lists would drift, and the way they
     drift is a destination somebody is no longer authorized for surviving in
     the collapsed rail after being removed from the expanded one. */
  const railItems = useMemo<ModuleRailItem[]>(() => {
    const views: ModuleRailItem[] = canAccessManagement
      ? MANAGEMENT_VIEWS.map((v) => ({
          id: v.id,
          label: v.label,
          icon: v.icon,
          active: isMgmtViewActive(v.id),
          onSelect: () => onSelect({ kind: "management", view: v.id }),
        }))
      : [];
    const partnerItems: ModuleRailItem[] = partners.map((p) => ({
      id: p.id,
      label: p.name,
      icon: Building2,
      badge: countFor(p.scopeId),
      badgeLabel: { one: "active client", many: "active clients" },
      active: isPartnerActive(p.id),
      onSelect: () => onSelect({ kind: "partner", partnerId: p.id }),
    }));
    return [...views, ...partnerItems];
  }, [canAccessManagement, partners, countFor, isMgmtViewActive, isPartnerActive, onSelect]);

  return (
    <ModuleRail
      module="creditops"
      title="CreditOps Space"
      icon={FileText}
      badge={{ value: totalActive, label: "active" }}
      items={railItems}
    >
      {/* Management layer — management role only. Agents are scoped to their
          Partner workspace and never see cross-partner aggregate views. */}
      <div className="space-y-2 text-xs">
        {canAccessManagement && (
          <OpsTreeManagementSection
            views={MANAGEMENT_VIEWS}
            icon={LayoutDashboard}
            open={!!expanded.management}
            onToggle={() => toggleFolder("management")}
            isActive={isMgmtViewActive}
            onSelect={(view) => onSelect({ kind: "management", view })}
          />
        )}

        <div className="pt-1">
          {renderGroup("managed", "MANAGED OPS", managedPartners, "text-status-warning")}
        </div>
        <div className="pt-1">
          {renderGroup("outsourcing", "OUTSOURCING", outsourcingPartners, "text-purple-500")}
        </div>
        <div className="pt-1">
          {renderGroup("creditops_users", "CREDITOPS USERS", creditopsUserPartners, "text-status-success")}
        </div>
      </div>
      {/* What used to be a paragraph of explanation living in the rail is now
          in the page header, where there is room to read it. A navigation rail
          is for navigation (Dee, §8). */}
    </ModuleRail>
  );
}
