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
 *   ├── Managed Ops (Folder)     BES owns the execution
 *   │   ├── Partner A (List/Workspace)
 *   │   └── ...
 *   ├── Outsourcing (Folder)     BES supplies the people
 *   └── Needs Review (Folder)    not enough service data to say
 *
 * The Management layer sits above individual Partner workspaces. Its views
 * aggregate authorized records from ALL Partners. Partner workspaces scope to
 * one Partner. Same canonical client records — different scope.
 *
 * ── THE FOLDERS ARE DATA NOW (0301-0304) ────────────────────────────────────
 *
 * They used to be computed here from the RECORD TYPE: an `organizations` row
 * rendered under Managed Ops, an `outsourcing_groups` row under Outsourcing.
 * Nobody had ever chosen any of it, which is why every partner BES has sat in
 * Outsourcing whatever BES was actually doing for them.
 *
 * A folder is now a `module_categories` row, and an account's folder is
 * derived from its SERVICE relationship — a CreditOps fulfilment service means
 * BES owns the execution, so Managed Ops. Dragging is the exception, not the
 * filing system: it pins one account against the derivation and nothing else.
 *
 * CREDITOPS USERS is gone. An organization with no live CreditOps engagement
 * is not work in progress. They keep their SaaS tenancy and every customer
 * administration surface — those read the organizations table directly and
 * know nothing about this sidebar.
 *
 * Counts show ACTIVE clients only (excludes Completed / Archived / Graduated).
 */

import { useCallback, useMemo, useState, type DragEvent } from "react";
import { Building2, FileText, LayoutDashboard, BarChart3, Webhook, Wand2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCategoryMove } from "./use-category-move";
import {
  CREDIT_OPS_PARTNERS,
  type CreditOpsPartner,
} from "@/lib/fulfillment/creditops-partners";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import { cn } from "@/lib/utils";
import { usePartners } from "@/lib/data/use-partners";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import type { ModuleCategory } from "@/lib/data/module-categories";
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
 * The demo fixtures have no engagements and so no category. They keep their
 * legacy bucket so the backend-less workspace is still explorable.
 * `creditops_users` is deliberately absent: that folder is gone.
 */
const LEGACY_DEMO_BUCKET: Record<string, string> = {
  managed: "managed_ops",
  outsourcing: "outsourcing",
};

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
  const move = useCategoryMove("creditops");
  /* Collapsed is the exception, so an unlisted folder reads as open and a new
     category does not arrive shut. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [overCategory, setOverCategory] = useState<string | null>(null);
  const isOpen = (key: string) => !collapsed[key];
  const toggleFolder = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  /**
   * Accounts per category.
   *
   * The demo fixtures have no engagements and so no category; they keep their
   * legacy bucket so the backend-less workspace still explores. `creditops_users`
   * is deliberately not mapped — that folder is gone, and a fixture in it is a
   * fixture nobody should be navigating by anyway.
   */
  const byCategory = useMemo(() => {
    const map = new Map<string, OpsPartner[]>();
    for (const c of move.categories) map.set(c.id, []);
    for (const p of partners) {
      const id =
        move.categoryIdOf(p) ??
        move.categories.find((c) => c.key === LEGACY_DEMO_BUCKET[p.group])?.id ??
        null;
      if (id && map.has(id)) map.get(id)!.push(p);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [partners, move]);

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

  /**
   * One account.
   *
   * Draggable only when the viewer may reorganise AND the row has a live
   * engagement to move. Native HTML5 drag is what keeps click working: a press
   * without movement never fires `dragstart`, so the browser supplies the
   * movement threshold and normal navigation is untouched.
   */
  const renderPartner = (partner: OpsPartner) => {
    const count = countFor(partner.scopeId);
    const isSelected = isPartnerActive(partner.id);
    const draggable = move.canMove && !!partner.engagementId;
    const isDragging = move.draggingId === partner.engagementId;
    const here = move.categoryIdOf(partner);

    return (
      <div
        key={partner.id}
        draggable={draggable}
        onDragStart={(e: DragEvent<HTMLDivElement>) => {
          if (!partner.engagementId) return;
          move.setDraggingId(partner.engagementId);
          e.dataTransfer.effectAllowed = "move";
          /* Something has to be set or Firefox refuses to start the drag; the
             payload is never read, because the id is already in state. */
          e.dataTransfer.setData("text/plain", partner.engagementId);
        }}
        onDragEnd={() => { move.setDraggingId(null); setOverCategory(null); }}
        className={cn(
          "group/row flex w-full items-center gap-1 rounded-md pr-1 transition-colors",
          isSelected ? "bg-primary" : "hover:bg-muted/60",
          isDragging && "opacity-40",
          draggable && "cursor-grab active:cursor-grabbing",
        )}
      >
        <button
          onClick={() => onSelect({ kind: "partner", partnerId: partner.id })}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium",
            isSelected ? "font-bold text-primary-foreground" : "text-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Building2
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isSelected ? "text-primary-foreground" : "text-muted-foreground",
              )}
            />
            <span className="truncate">{partner.name}</span>
            {partner.categorySource === "manual" && (
              /* So a placement that stopped following the service records says
                 so, rather than looking like the system's own answer. */
              <span
                title="Moved here by BES — automatic placement is not managing this one"
                className={cn(
                  "shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
                  isSelected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                Set
              </span>
            )}
          </span>
          <span
            className={cn(
              "ml-2 shrink-0 text-[10px]",
              isSelected ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {count}
          </span>
        </button>

        {/* Keyboard- and touch-reachable equivalent of the drag. Appears on
            hover or focus so every row is not permanently cluttered. */}
        {draggable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Move ${partner.name} to another category`}
                className={cn(
                  "shrink-0 rounded p-1 opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/row:opacity-100",
                  isSelected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">Move to…</DropdownMenuLabel>
              {move.categories.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  disabled={c.id === here}
                  onSelect={() => move.move(partner, c.id)}
                  className="text-xs"
                >
                  {c.label}
                  {c.id === here && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={partner.categorySource !== "manual"}
                onSelect={() => move.followAuto(partner)}
                className="text-xs"
              >
                <Wand2 className="mr-2 h-3.5 w-3.5" />
                Follow automatic placement
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  /**
   * A category folder, and a drop target.
   *
   * It accepts a drop whenever a drag is in flight, including when it holds
   * nothing — Dee has to be able to move the first account into an empty
   * category, so an empty folder still renders, still highlights, and says
   * what it is for instead of looking broken.
   */
  const renderCategory = (category: ModuleCategory) => {
    const inHere = byCategory.get(category.id) ?? [];
    const isTarget = overCategory === category.id;
    const dragging = move.draggingId !== null;
    return (
      <div
        key={category.id}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          if (!dragging || !move.canMove) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOverCategory(category.id);
          /* Open a shut folder so the drop lands somewhere the eye can see. */
          if (collapsed[category.id]) setCollapsed((p) => ({ ...p, [category.id]: false }));
        }}
        onDragLeave={(e: DragEvent<HTMLDivElement>) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setOverCategory((c) => (c === category.id ? null : c));
        }}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setOverCategory(null);
          const dragged = partners.find((p) => p.engagementId === move.draggingId);
          move.setDraggingId(null);
          if (dragged) move.move(dragged, category.id);
        }}
        className={cn(
          "rounded-lg transition-colors",
          isTarget && "bg-primary/10 ring-1 ring-primary/40",
          dragging && !isTarget && "ring-1 ring-dashed ring-border",
        )}
      >
        <OpsTreeFolder
          label={category.label.toUpperCase()}
          accent={category.isFallback ? "text-status-warning" : "text-purple-500"}
          count={inHere.reduce((sum, p) => sum + countFor(p.scopeId), 0)}
          open={isOpen(category.id)}
          onToggle={() => toggleFolder(category.id)}
        >
          {inHere.length > 0 ? (
            inHere.map(renderPartner)
          ) : (
            <p className="px-2 py-1.5 text-[11px] italic text-muted-foreground">
              {category.isFallback
                ? "Nothing needs review."
                : move.canMove
                  ? "Empty — drag an account here."
                  : "No accounts."}
            </p>
          )}
        </OpsTreeFolder>
      </div>
    );
  };

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
            open={isOpen("management")}
            onToggle={() => toggleFolder("management")}
            isActive={isMgmtViewActive}
            onSelect={(view) => onSelect({ kind: "management", view })}
          />
        )}

        {/* A folder per category, in the catalogue's order. Needs Review is
            hidden when empty: an incomplete-data folder should appear because
            there IS incomplete data, not sit there permanently. */}
        {move.categories
          .filter((c) => !c.isFallback || (byCategory.get(c.id)?.length ?? 0) > 0)
          .map((c) => (
            <div key={c.id} className="pt-1">
              {renderCategory(c)}
            </div>
          ))}
      </div>
      {/* What used to be a paragraph of explanation living in the rail is now
          in the page header, where there is room to read it. A navigation rail
          is for navigation (Dee, §8). */}
    </ModuleRail>
  );
}
