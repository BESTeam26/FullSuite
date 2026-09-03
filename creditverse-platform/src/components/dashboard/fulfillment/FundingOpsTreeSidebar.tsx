/**
 * FundingOps Tree Sidebar — ClickUp-style hierarchy.
 *
 *   FundingOps (Space)
 *   ├── Management layer (cross-partner views — aggregates ALL Partners)
 *   │   ├── Dashboard
 *   │   ├── Deal List
 *   │   ├── Readiness
 *   │   ├── Documents
 *   │   ├── Submissions
 *   │   ├── Stipulations
 *   │   ├── Offers
 *   │   └── Funded
 *   │
 *   ├── Outsourcing (Folder)
 *   │   └── Partner (expandable)
 *   │       └── Client / Borrower (expandable)
 *   │           └── Deal #FD-xxxx  ← opens the Deal Workspace
 *   └── FundingOps Users (Folder)
 *
 * The LEFT TREE is the client navigation — there is no separate "Clients" tab.
 * Selecting a Client opens the tabbed Client Workspace (Overview | Deal List |
 * Documents | Activity). Selecting a Deal opens the Deal Workspace.
 */

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Building2,
  User,
  Layers,
  LayoutDashboard,
  ListChecks,
  Users,
  ClipboardCheck,
  FileText,
  Send,
  FileCheck2,
  DollarSign,
  CheckCircle2,
} from "lucide-react";
import { useFundingDealStore } from "@/lib/fulfillment/funding-deal-store";
import {
  type FundingOpsPartner,
  FUNDING_OPS_PARTNERS,
} from "@/lib/fulfillment/fundingops-partners";
import { usePartners } from "@/lib/data/use-partners";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import { useFundingOpsAccess } from "@/lib/fulfillment/fundingops-access";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import {
  isActiveFunding,
  formatCurrency,
  clientGroupKey,
} from "@/lib/fulfillment/fundingops-domain";
import { cn } from "@/lib/utils";
import {
  OpsTreeFolder,
  OpsTreeHeader,
  OpsTreeManagementSection,
} from "./OpsTreeSidebarParts";

export type FundingOpsSelection =
  | { kind: "management"; view: string }
  | { kind: "partner"; partnerId: string }
  | { kind: "client"; clientId: string }
  | { kind: "deal"; dealId: string };

interface Props {
  selected: FundingOpsSelection;
  onSelect: (selection: FundingOpsSelection) => void;
}

const MANAGEMENT_VIEWS = [
  { id: "mgmt-dashboard", label: "Dashboard", icon: LayoutDashboard },
  /* Client-level view, the counterpart to CreditOps' Main Client List. Deal
     List stays alongside it for deal-level navigation. */
  { id: "mgmt-client-list", label: "Client List", icon: Users },
  { id: "mgmt-deal-list", label: "Deal List", icon: ListChecks },
  { id: "mgmt-readiness", label: "Readiness", icon: ClipboardCheck },
  { id: "mgmt-document", label: "Documents", icon: FileText },
  { id: "mgmt-submissions", label: "Submissions", icon: Send },
  { id: "mgmt-stipulations", label: "Stipulations", icon: FileCheck2 },
  { id: "mgmt-offers", label: "Offers", icon: DollarSign },
  { id: "mgmt-funded", label: "Funded", icon: CheckCircle2 },
];

/** Deals belonging to a client (flattened across all of the client's files). */
const useDealsForClient = () => {
  const { deals } = useFundingDealStore();
  return (clientId: string) => deals.filter((d) => d.clientId === clientId);
};

const dealCode = (dealId: string) =>
  `FD-${dealId.replace(/^fd-/, "").toUpperCase()}`;

export function FundingOpsTreeSidebar({ selected, onSelect }: Props) {
  /* Live organizations and outsourcing groups, falling back to the demo
     constants without a backend. The constants' scope ids are invented, so a
     live session must navigate by real ones or intake cannot save (rule 2). */
  const { partners } = usePartners("fundingOps", FUNDING_OPS_PARTNERS);
  const { canAccessManagement } = useFundingOpsAccess();
  const store = useFundingOpsStore();
  const dealsForClient = useDealsForClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    management: true,
    outsourcing: true,
    fundingops_users: true,
  });

  const toggleFolder = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const outsourcingPartners = partners.filter((p) => p.group === "outsourcing");
  const fundingopsUserPartners = partners.filter(
    (p) => p.group === "fundingops_users",
  );

  const countActiveForPartner = (scopeId: string) =>
    store.clients.filter(
      (c) => clientGroupKey(c) === scopeId && isActiveFunding(c.status),
    ).length;

  const totalActive = partners.reduce(
    (sum, p) => sum + countActiveForPartner(p.scopeId),
    0,
  );

  const isMgmtViewActive = (viewId: string) =>
    selected.kind === "management" && selected.view === viewId;
  const isPartnerActive = (partnerId: string) =>
    selected.kind === "partner" && selected.partnerId === partnerId;
  const isClientActive = (clientId: string) =>
    selected.kind === "client" && selected.clientId === clientId;
  const isDealActive = (dealId: string) =>
    selected.kind === "deal" && selected.dealId === dealId;

  const renderDeal = (dealId: string, lender: string, amount: number) => {
    const active = isDealActive(dealId);
    return (
      <button
        key={dealId}
        onClick={() => onSelect({ kind: "deal", dealId })}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          active
            ? "bg-primary font-bold text-primary-foreground"
            : "text-foreground hover:bg-muted/60",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Layers
            className={cn(
              "h-3 w-3 shrink-0",
              active ? "text-primary-foreground" : "text-muted-foreground",
            )}
          />
          <span className="truncate">{dealCode(dealId)}</span>
        </div>
        <span
          className={cn(
            "ml-1 shrink-0 text-[10px]",
            active ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {formatCurrency(amount)}
        </span>
      </button>
    );
  };

  const renderClient = (clientId: string, name: string) => {
    const deals = dealsForClient(clientId);
    const clientKey = `client-${clientId}`;
    const isOpen = expanded[clientKey];
    const clientActive = isClientActive(clientId);
    return (
      <div key={clientId}>
        <div className="flex items-center">
          <button
            onClick={() => {
              toggleFolder(clientKey);
              onSelect({ kind: "client", clientId });
            }}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              clientActive
                ? "bg-primary/10 font-bold text-primary"
                : "text-foreground hover:bg-muted/60",
            )}
          >
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </button>
          <span className="shrink-0 pr-1 text-[10px] text-muted-foreground">
            {deals.length}
          </span>
        </div>
        {isOpen && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
            {deals.length > 0 ? (
              deals.map((d) => renderDeal(d.id, d.lender, d.amount))
            ) : (
              <p className="px-2 py-1 text-[10px] italic text-muted-foreground">
                No deals yet
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderPartner = (partner: FundingOpsPartner) => {
    const count = countActiveForPartner(partner.scopeId);
    const partnerKey = `partner-${partner.id}`;
    const isSelected = isPartnerActive(partner.id);
    const isOpen = expanded[partnerKey];
    const partnerClients = store.clients.filter(
      (c) => clientGroupKey(c) === partner.scopeId,
    );
    const Chevron = isOpen ? ChevronDown : ChevronRight;
    return (
      <div key={partner.id}>
        <div
          onClick={() => {
            toggleFolder(partnerKey);
            onSelect({ kind: "partner", partnerId: partner.id });
          }}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            isSelected
              ? "bg-primary font-bold text-primary-foreground"
              : "text-foreground hover:bg-muted/60",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Chevron
              className={cn(
                "h-3 w-3 shrink-0",
                isSelected
                  ? "text-primary-foreground"
                  : "text-muted-foreground",
              )}
            />
            <Building2
              className={cn(
                "h-3.5 w-3.5",
                isSelected
                  ? "text-primary-foreground"
                  : "text-muted-foreground",
              )}
            />
            <span>{partner.name}</span>
          </div>
          <span
            className={cn(
              "text-[10px]",
              isSelected
                ? "text-primary-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {count}
          </span>
        </div>
        {isOpen && partnerClients.length > 0 && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
            {partnerClients.map((c) => renderClient(c.id, c.name))}
          </div>
        )}
      </div>
    );
  };

  const renderGroup = (
    key: string,
    label: string,
    partners: OpsPartner[],
    accent: string,
  ) => (
    <OpsTreeFolder
      label={label}
      accent={accent}
      count={partners.reduce(
        (sum, p) => sum + countActiveForPartner(p.scopeId),
        0,
      )}
      open={!!expanded[key]}
      onToggle={() => toggleFolder(key)}
    >
      {partners.map(renderPartner)}
    </OpsTreeFolder>
  );

  return (
    <div className="w-64 shrink-0 space-y-4 overflow-y-auto border-r border-border bg-card p-4 hidden md:block">
      <OpsTreeHeader label="FUNDINGOPS SPACE" totalActive={totalActive} />

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
          {renderGroup(
            "outsourcing",
            "OUTSOURCING",
            outsourcingPartners,
            "text-purple-500",
          )}
        </div>
        <div className="pt-1">
          {renderGroup(
            "fundingops_users",
            "FUNDINGOPS USERS",
            fundingopsUserPartners,
            "text-status-success",
          )}
        </div>
      </div>

      <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">
        The tree is the client navigation. Management views aggregate all
        Partners. Select a Client to open its workspace, or expand a Client to
        open a specific Deal.
      </p>
    </div>
  );
}
