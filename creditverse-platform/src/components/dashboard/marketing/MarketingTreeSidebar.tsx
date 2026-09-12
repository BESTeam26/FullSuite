/**
 * The Sales & Marketing second pane — the same ClickUp-shaped hierarchy
 * CreditOps uses, because it is the same idea:
 *
 *   Sales & Marketing (Space)
 *   ├── Global          cross-partner views over every workspace
 *   │   ├── Dashboard · Tasks · Content Calendar · Campaigns
 *   ├── BES Internal Marketing   BES's own work, an agency-owned workspace
 *   └── Partners        one per partner with a live engagement, A→Z
 *
 * Dee, 2026-09-12: "KEEP THE SECOND CREDITOPS NAVIGATION PANE. This is
 * critical." The module pane is how a person moves between whose work they are
 * looking at without losing the platform around them.
 *
 * The partner list is DERIVED from live Sales & Marketing engagements
 * (`marketing_partners`) and sorted A→Z, so nobody maintains it and pausing an
 * engagement removes the partner without touching a single task.
 */
import { Megaphone, LayoutDashboard, CheckSquare, CalendarDays, Flag, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLOBAL_VIEWS, type GlobalViewId, type MarketingPartner } from "@/lib/marketing/marketing-domain";

const VIEW_ICON: Record<GlobalViewId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  tasks: CheckSquare,
  calendar: CalendarDays,
  campaigns: Flag,
};

export type MarketingSelection =
  | { kind: "global"; view: GlobalViewId }
  | { kind: "workspace"; workspaceId: string; partnerId: string | null };

const Row = ({
  active, label, icon: Icon, count, indent, onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
  indent?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? "true" : undefined}
    title={label}
    className={cn(
      "flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-xs transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      indent ? "pl-6" : "pl-3",
      active
        ? "bg-primary/10 font-semibold text-foreground"
        : "text-foreground hover:bg-muted",
    )}
  >
    <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {count !== undefined && (
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{count}</span>
    )}
  </button>
);

export function MarketingTreeSidebar({
  selection,
  partners,
  internalWorkspaceId,
  countFor,
  onSelect,
}: {
  selection: MarketingSelection;
  partners: MarketingPartner[];
  /** BES's own workspace, when it exists. */
  internalWorkspaceId: string | null;
  /** Open items in a workspace, for the badge. */
  countFor: (workspaceId: string | null) => number | undefined;
  onSelect: (next: MarketingSelection) => void;
}) {
  const isWorkspace = (id: string | null) =>
    selection.kind === "workspace" && id !== null && selection.workspaceId === id;

  return (
    <nav aria-label="Sales & Marketing" className="w-full shrink-0 space-y-4 lg:w-60">
      <div>
        <p className="flex items-center gap-2 px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Megaphone className="h-3.5 w-3.5" /> Global
        </p>
        <ul className="space-y-0.5">
          {GLOBAL_VIEWS.map((v) => (
            <li key={v.id}>
              <Row
                active={selection.kind === "global" && selection.view === v.id}
                label={v.label}
                icon={VIEW_ICON[v.id]}
                onClick={() => onSelect({ kind: "global", view: v.id })}
              />
            </li>
          ))}
        </ul>
      </div>

      {internalWorkspaceId && (
        <div>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            BES
          </p>
          <Row
            active={isWorkspace(internalWorkspaceId)}
            label="BES Internal Marketing"
            icon={Megaphone}
            count={countFor(internalWorkspaceId)}
            onClick={() => onSelect({ kind: "workspace", workspaceId: internalWorkspaceId, partnerId: null })}
          />
        </div>
      )}

      <div>
        <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Partners
        </p>
        {partners.length === 0 ? (
          <p className="px-3 text-[11px] leading-relaxed text-muted-foreground">
            No partner has a live Sales &amp; Marketing engagement yet. This list follows the
            engagements — nobody adds to it by hand.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {partners.map((p) => (
              <li key={p.id}>
                <Row
                  active={isWorkspace(p.workspaceId)}
                  label={p.name}
                  icon={Building2}
                  count={countFor(p.workspaceId)}
                  indent
                  onClick={() =>
                    p.workspaceId &&
                    onSelect({ kind: "workspace", workspaceId: p.workspaceId, partnerId: p.id })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
