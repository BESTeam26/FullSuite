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

import { useState } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Building2,
  LayoutDashboard,
  BarChart3,
} from "lucide-react";
import { seedFulfillmentClients } from "@/lib/fulfillment/fulfillment-client-seed";
import {
  CREDIT_OPS_PARTNERS,
  type CreditOpsPartner,
} from "@/lib/fulfillment/creditops-partners";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import { cn } from "@/lib/utils";

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

const countActiveForPartner = (scopeId: string) =>
  seedFulfillmentClients.filter(
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
];

export function CreditOpsTreeSidebar({
  selected,
  onSelect,
}: CreditOpsTreeSidebarProps) {
  const { canAccessManagement } = useCreditOpsAccess();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    management: true,
    managed: true,
    outsourcing: true,
    creditops_users: true,
  });

  const toggleFolder = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const managedPartners = CREDIT_OPS_PARTNERS.filter(
    (p) => p.group === "managed",
  );
  const outsourcingPartners = CREDIT_OPS_PARTNERS.filter(
    (p) => p.group === "outsourcing",
  );
  const creditopsUserPartners = CREDIT_OPS_PARTNERS.filter(
    (p) => p.group === "creditops_users",
  );

  const totalActive = CREDIT_OPS_PARTNERS.reduce(
    (sum, p) => sum + countActiveForPartner(p.scopeId),
    0,
  );

  const isMgmtViewActive = (viewId: string) =>
    selected.kind === "management" && selected.view === viewId;

  const isPartnerActive = (partnerId: string) =>
    selected.kind === "partner" && selected.partnerId === partnerId;

  const renderPartner = (partner: (typeof CREDIT_OPS_PARTNERS)[number]) => {
    const count = countActiveForPartner(partner.scopeId);
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
  ) => {
    const groupActive = partners.reduce(
      (sum, p) => sum + countActiveForPartner(p.scopeId),
      0,
    );
    return (
      <div>
        <button
          onClick={() => toggleFolder(key)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 font-semibold text-foreground hover:bg-muted"
        >
          <div className="flex items-center gap-2">
            {expanded[key] ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <FolderOpen className={cn("h-3.5 w-3.5", accent)} />
            <span className="text-xs">{label}</span>
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {groupActive}
          </span>
        </button>
        {expanded[key] && (
          <div className="ml-4 mt-1 space-y-1 border-l border-border pl-2">
            {partners.map(renderPartner)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 shrink-0 space-y-4 border-r border-border bg-card p-4 hidden md:block">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-foreground">
            CREDITOPS SPACE
          </span>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
          {totalActive} active
        </span>
      </div>

      <div className="space-y-2 text-xs">
        {/* Management layer — management role only. Agents are scoped to
            their Partner workspace and never see cross-partner aggregate views. */}
        {canAccessManagement && (
          <div>
            <button
              onClick={() => toggleFolder("management")}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 font-semibold text-foreground hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                {expanded.management ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs">MANAGEMENT</span>
              </div>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                ALL
              </span>
            </button>
            {expanded.management && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
                {MANAGEMENT_VIEWS.map((v) => {
                  const Icon = v.icon;
                  const active = isMgmtViewActive(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() =>
                        onSelect({ kind: "management", view: v.id })
                      }
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "bg-primary/10 font-bold text-primary"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{v.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="pt-1">
          {renderGroup(
            "managed",
            "MANAGED OPS",
            managedPartners,
            "text-amber-500",
          )}
        </div>
        <div className="pt-1">
          {renderGroup(
            "outsourcing",
            "OUTSOURCING",
            outsourcingPartners,
            "text-purple-500",
          )}
        </div>
        <div className="pt-1">
          {renderGroup(
            "creditops_users",
            "CREDITOPS USERS",
            creditopsUserPartners,
            "text-emerald-500",
          )}
        </div>
      </div>

      <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">
        Management views aggregate all Partners. Partner workspaces scope to one
        Partner. One client record, many operational views.
      </p>
    </div>
  );
}
