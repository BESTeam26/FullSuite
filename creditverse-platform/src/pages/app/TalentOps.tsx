/**
 * TalentOps — BES staffing for an organization's own operations (rule 17).
 *
 * The bridge: an organization shares a Custom Workspace (or one board) under a
 * live TalentOps engagement; BES sees and works exactly that. Every number on
 * this page is derived from records RLS returned to the signed-in BES user —
 * shared workspaces, their items, the engagements behind them. Nothing here is
 * a roster, a rating or a placement count that no table holds; those areas
 * say so instead of showing sample figures.
 */
import { useMemo, useState } from "react";
import { UserCheck, Users, Briefcase, Activity, LayoutGrid, BarChart3 } from "lucide-react";
import {
  DivisionLayout,
  DivisionTable,
  ContentCard,
  EmptyTab,
  StatusPill,
  type DivisionTab,
} from "@/components/dashboard/DivisionLayout";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgency } from "@/lib/agency-context";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { isEngagementLive } from "@/lib/data/fulfillment-engagements";
import { useAllWorkspaceItems, useSharedWorkspaces } from "@/lib/data/use-workspaces";
import { useActiveShares } from "@/lib/data/use-workspace-shares";
import { openItemCount, type Workspace, type WorkspaceItem } from "@/lib/workspaces/workspace-domain";
import { WorkspaceBoard } from "@/components/workspaces/WorkspaceBoard";
import { WorkItemDrawer } from "@/components/workspaces/WorkItemDrawer";
import { cn } from "@/lib/utils";

export default function TalentOps() {
  const auth = useAuth();
  const { subAccounts } = useAgency();
  const { workspaces, isLoading: wsLoading, error: wsError } = useSharedWorkspaces();
  const { items } = useAllWorkspaceItems();
  const { shares } = useActiveShares();
  const { engagements } = useFulfillment();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<WorkspaceItem | null>(null);
  const meId = auth.user?.id ?? null;

  const talentOps = engagements.filter((e) => e.service === "talentops" && isEngagementLive(e));
  const orgName = (id: string | undefined) =>
    subAccounts.find((s) => s.id === id)?.name ?? workspaces.find((w) => w.organizationId === id)?.organizationName ?? "Organization";

  const perWorkspace = useMemo(
    () =>
      workspaces.map((w) => {
        const mine = items.filter((i) => i.workspaceId === w.id);
        return { workspace: w, total: mine.length, open: openItemCount(w.statuses, mine), assignees: new Set(mine.map((i) => i.assignedTo).filter(Boolean)).size };
      }),
    [workspaces, items],
  );
  const openTotal = perWorkspace.reduce((n, p) => n + p.open, 0);
  const assignees = new Set(items.map((i) => i.assignedTo).filter(Boolean)).size;
  const selected = workspaces.find((w) => w.id === selectedId) ?? workspaces[0] ?? null;
  const canWork = (w: Workspace) => shares.some((s) => s.workspaceId === w.id && s.access === "work");

  const nothingShared = (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <LayoutGrid className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">No workspaces are shared with BES</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        An organization shares a workspace under an active TalentOps engagement; only then does its work appear here.
      </p>
    </div>
  );

  const tabs: DivisionTab[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: BarChart3,
      render: () =>
        wsError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">Could not load shared work: {wsError}</div>
        ) : wsLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : workspaces.length === 0 ? (
          nothingShared
        ) : (
          <ContentCard title="Shared workspaces">
            <DivisionTable
              columns={["Workspace", "Organization", "Open", "Total", "Assignees", "Access"]}
              rows={perWorkspace.map((p) => [
                p.workspace.name,
                p.workspace.organizationName ?? orgName(p.workspace.organizationId),
                p.open,
                p.total,
                p.assignees,
                <StatusPill status={canWork(p.workspace) ? "Active" : "View only"} />,
              ])}
            />
          </ContentCard>
        ),
    },
    {
      id: "work",
      label: "Shared Work",
      icon: Activity,
      render: () =>
        workspaces.length === 0 ? (
          nothingShared
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <nav aria-label="Shared workspaces" className="w-full shrink-0 lg:w-56">
              <ul className="space-y-1">
                {workspaces.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(w.id)}
                      aria-current={selected?.id === w.id ? "true" : undefined}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        selected?.id === w.id ? "bg-primary/10 font-semibold text-foreground" : "text-foreground hover:bg-muted",
                      )}
                    >
                      <span className="block truncate">{w.name}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">{w.organizationName ?? orgName(w.organizationId)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            {selected && (
              <WorkspaceBoard
                key={selected.id}
                workspace={selected}
                meId={meId}
                readOnly={!canWork(selected)}
                subtitle={`Shared by ${selected.organizationName ?? orgName(selected.organizationId)} under TalentOps`}
                onOpenItem={setOpenItem}
              />
            )}
            {selected && (
              <WorkItemDrawer key={openItem?.id ?? "none"} itemId={openItem?.id ?? null} workspace={selected} members={[]} teams={[]} canAssign={false} readOnly={!canWork(selected)} onClose={() => setOpenItem(null)} />
            )}
          </div>
        ),
    },
    {
      id: "partners",
      label: "Partners",
      icon: Users,
      render: () =>
        talentOps.length === 0 ? (
          <EmptyTab label="No active TalentOps engagements" />
        ) : (
          <ContentCard title="Organizations with an active TalentOps engagement">
            <DivisionTable
              columns={["Organization", "Since", "Shared workspaces", "Status"]}
              rows={talentOps.map((e) => [
                orgName(e.organizationId),
                e.effectiveFrom,
                workspaces.filter((w) => w.organizationId === e.organizationId).length,
                <StatusPill status="Active" />,
              ])}
            />
          </ContentCard>
        ),
    },
    { id: "agents", label: "Assigned Agents", icon: UserCheck, render: () => <EmptyTab label="Agent roster, roles and ratings are not recorded yet — nothing to show" /> },
    { id: "workload", label: "Workload", icon: Briefcase, render: () => <EmptyTab label="Workload distribution & capacity planning — not built" /> },
  ];

  return (
    <DivisionLayout
      title="TalentOps"
      description="BES staff working inside organizations' own workspaces — shared under TalentOps engagements, never copied"
      icon={UserCheck}
      stats={[
        { label: "Shared workspaces", value: workspaces.length, icon: LayoutGrid },
        { label: "Open shared items", value: openTotal, icon: Activity },
        { label: "Distinct assignees", value: assignees, icon: UserCheck },
        { label: "TalentOps partners", value: talentOps.length, icon: Users },
      ]}
      tabs={tabs}
    />
  );
}
