/**
 * Sales & Marketing — the module, inside the BES FullSuite shell.
 *
 *   BES Agency Sidebar │ Sales & Marketing pane │ the selected view
 *
 * Dee, 2026-09-12: "KEEP THE SECOND CREDITOPS NAVIGATION PANE. This is
 * critical." The same shape is used here, because it is the same idea: the
 * platform on the left, whose work you are looking at in the middle, the work
 * itself on the right.
 *
 * ── ONE TASK ENGINE ─────────────────────────────────────────────────────────
 *
 * Global views read every marketing workspace the person may see; a partner
 * view reads one. Both read `marketing_work`, both open the same canonical
 * work item drawer, and a task created here is a `work_items` row — so time,
 * production, EOD, attention, files, comments and history all work without any
 * of them being taught what marketing is (rule 17).
 *
 * Authorization is the database's. `marketing.workspace.view` decides whether
 * a workspace exists for this reader at all and `marketing.tasks.manage`
 * whether they may change it; this page renders what row-level security
 * returns and hides controls it would refuse. Hiding is courtesy — the refusal
 * is real either way (rule 1).
 */
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Megaphone } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAgencyMembers, useAgencyTeams } from "@/lib/data/use-agency-work";
import { setItemFieldValue } from "@/lib/data/workspaces";
import { applyMarketingImport, fetchImportTargets } from "@/lib/data/marketing";
import {
  useCampaigns, useCreateCampaign, useCreateMarketingWork, useMarketingCounters,
  useMarketingPartners, useMarketingWork, useMarketingWorkspaces, useSetWorkCampaign,
  useUpdateCampaign, marketingKeys,
} from "@/lib/data/use-marketing";
import { useQueryClient } from "@tanstack/react-query";
import {
  EMPTY_COUNTERS, GLOBAL_VIEWS, type Campaign, type GlobalViewId, type MarketingWorkItem,
} from "@/lib/marketing/marketing-domain";
import { MarketingTreeSidebar, type MarketingSelection } from "@/components/dashboard/marketing/MarketingTreeSidebar";
import { MarketingDashboard } from "@/components/dashboard/marketing/MarketingDashboard";
import { MarketingTaskList, type TaskListFilters } from "@/components/dashboard/marketing/MarketingTaskList";
import { ContentCalendar } from "@/components/dashboard/marketing/ContentCalendar";
import { CampaignsView } from "@/components/dashboard/marketing/CampaignsView";
import { PartnerWorkspaceHeader } from "@/components/dashboard/marketing/PartnerWorkspaceHeader";
import { NewMarketingTaskDialog } from "@/components/dashboard/marketing/NewMarketingTaskDialog";
import { SheetImportDialog } from "@/components/dashboard/marketing/SheetImportDialog";
import { MarketingItemDrawer } from "@/components/dashboard/marketing/MarketingItemDrawer";
import { PartnerFilesTab } from "@/components/agency/partner/PartnerFilesTab";
import { PartnerActivityTab } from "@/components/agency/partner/PartnerActivityTab";
import { PARTNER_VIEWS, type PartnerViewId } from "@/lib/marketing/marketing-domain";
import { partnerLabel } from "@/lib/partners/partner-label";
import { cn } from "@/lib/utils";

export function SalesMarketing() {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const workspaces = useMarketingWorkspaces();
  const partners = useMarketingPartners();
  const counters = useMarketingCounters();
  const members = useAgencyMembers();
  const teams = useAgencyTeams();

  const canWork = perms.can("marketing.tasks.manage");

  /* The URL is the source of truth for where you are, so a link to a
     partner's calendar is a link somebody can send. */
  const selection: MarketingSelection = useMemo(() => {
    const ws = params.get("ws");
    if (ws) return { kind: "workspace", workspaceId: ws, partnerId: params.get("partner") } as const;
    const view = params.get("view") as GlobalViewId | null;
    return { kind: "global", view: GLOBAL_VIEWS.some((v) => v.id === view) ? view! : "dashboard" };
  }, [params]);

  const partnerTab = (params.get("tab") as PartnerViewId) ?? "overview";
  const scopedWorkspaceId = selection.kind === "workspace" ? selection.workspaceId : null;

  const work = useMarketingWork(scopedWorkspaceId);
  const campaigns = useCampaigns(scopedWorkspaceId);
  const createWork = useCreateMarketingWork();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const setCampaign = useSetWorkCampaign();

  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importTargets, setImportTargets] = useState<{ id: string; title: string; externalRef: string | null }[]>([]);
  const [filters, setFilters] = useState<TaskListFilters>({ openOnly: true });

  const rows = useMemo(() => work.data ?? [], [work.data]);
  const allWorkspaces = workspaces.data ?? [];
  const internal = allWorkspaces.find((w) => !w.partnerGroupId) ?? null;
  const activeWorkspace = allWorkspaces.find((w) => w.id === scopedWorkspaceId) ?? null;
  const activePartner = selection.kind === "workspace"
    ? partners.data?.find((p) => p.id === selection.partnerId) ?? null
    : null;

  /* Statuses for the list and the filters. Every marketing workspace is seeded
     with the same set, so the first one is a faithful legend for the global
     view; the list still shows anything that falls outside it rather than
     dropping rows silently. */
  const statuses = (activeWorkspace ?? allWorkspaces[0])?.statuses ?? [];

  const openCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.isTerminal) continue;
      map.set(r.workspaceId, (map.get(r.workspaceId) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const go = useCallback((next: MarketingSelection, tab?: PartnerViewId) => {
    const p = new URLSearchParams();
    if (next.kind === "global") p.set("view", next.view);
    else {
      p.set("ws", next.workspaceId);
      if (next.partnerId) p.set("partner", next.partnerId);
      p.set("tab", tab ?? "overview");
    }
    setParams(p, { replace: false });
  }, [setParams]);

  const openItem = (item: MarketingWorkItem) => setOpenItemId(item.id);

  /* Rescheduling writes the workspace's own `publish_at` field on the item —
     the same field the drawer edits, so the calendar and the task detail can
     never disagree about when something goes out. */
  const reschedule = async (item: MarketingWorkItem, date: string) => {
    const field = allWorkspaces
      .find((w) => w.id === item.workspaceId)?.fields.find((f) => f.key === "publish_at");
    if (!field) {
      toast({
        title: "This workspace has no Publish Date field",
        description: "Add one in its settings and the calendar will start using it.",
        variant: "destructive",
      });
      return;
    }
    try {
      await setItemFieldValue(item.id, field.id, date);
      await qc.invalidateQueries({ queryKey: marketingKeys.all });
    } catch (e) {
      toast({ title: "Could not move that post", description: (e as Error).message, variant: "destructive" });
    }
  };

  const loading = work.isLoading || workspaces.isLoading;
  const importTarget = activeWorkspaceOrInternal(activeWorkspace, internal);

  /* The existing work is fetched WHEN THE DIALOG OPENS, not on every render of
     the module: it is only needed to decide create vs update, and nobody
     reading a dashboard should pay for it (rule 14). */
  const openImport = async () => {
    if (!importTarget) return;
    try {
      setImportTargets(await fetchImportTargets(importTarget.id));
      setImporting(true);
    } catch (e) {
      toast({ title: "Could not read this workspace", description: (e as Error).message, variant: "destructive" });
    }
  };

  const globalBody = () => {
    if (selection.kind !== "global") return null;
    switch (selection.view) {
      case "dashboard":
        return (
          <MarketingDashboard
            counters={counters.data ?? EMPTY_COUNTERS}
            work={rows}
            loading={counters.isLoading || loading}
            onJump={(f) => { setFilters({ openOnly: true, ...f }); go({ kind: "global", view: "tasks" }); }}
            onOpenItem={openItem}
          />
        );
      case "tasks":
        return (
          <MarketingTaskList
            items={rows} statuses={statuses} showPartner loading={loading} canWork={canWork}
            filters={filters} onFiltersChange={setFilters}
            onOpenItem={openItem} onNewTask={() => setCreatingTask(true)}
            onImport={canWork ? () => void openImport() : undefined}
          />
        );
      case "calendar":
        return (
          <ContentCalendar
            items={rows} showPartner canWork={canWork}
            onOpenItem={openItem} onReschedule={(i, d) => void reschedule(i, d)}
            onImport={canWork ? () => void openImport() : undefined}
          />
        );
      case "campaigns":
        return (
          <CampaignsView
            campaigns={campaigns.data ?? []} work={rows} loading={campaigns.isLoading}
            canWork={canWork} workspaceId={null}
            onCreate={async () => {}}
            onUpdate={(id, patch) => updateCampaign.mutate({ id, patch })}
            onOpenCampaign={(c) => { setFilters({ openOnly: true, campaignId: c.id }); go({ kind: "global", view: "tasks" }); }}
          />
        );
      default:
        return null;
    }
  };

  const partnerBody = () => {
    if (selection.kind !== "workspace" || !activeWorkspace) return null;
    switch (partnerTab) {
      case "overview":
        return (
          <PartnerWorkspaceHeader
            workspace={activeWorkspace}
            partnerName={activePartner
              ? partnerLabel({ business: activePartner.name, contact: activePartner.primaryContactName })
              : "BES Internal Marketing"}
            work={rows}
            campaigns={campaigns.data ?? []}
            onOpenItem={openItem}
            onGoToTasks={(f) => { setFilters({ openOnly: true, ...f }); go(selection, "tasks"); }}
          />
        );
      case "tasks":
        return (
          <MarketingTaskList
            items={rows} statuses={statuses} showPartner={false} loading={loading} canWork={canWork}
            filters={filters} onFiltersChange={setFilters}
            onOpenItem={openItem} onNewTask={() => setCreatingTask(true)}
            onImport={canWork ? () => void openImport() : undefined}
          />
        );
      case "calendar":
        return (
          <ContentCalendar
            items={rows} showPartner={false} canWork={canWork}
            onOpenItem={openItem} onReschedule={(i, d) => void reschedule(i, d)}
            onImport={canWork ? () => void openImport() : undefined}
          />
        );
      case "campaigns":
        return (
          <CampaignsView
            campaigns={campaigns.data ?? []} work={rows} loading={campaigns.isLoading}
            canWork={canWork} workspaceId={activeWorkspace.id}
            onCreate={async (input) => {
              await createCampaign.mutateAsync({
                workspaceId: activeWorkspace.id,
                agencyId: activeWorkspace.agencyId ?? auth.agencyId ?? "",
                partnerGroupId: activeWorkspace.partnerGroupId ?? null,
                ...input,
              });
            }}
            onUpdate={(id, patch) => updateCampaign.mutate({ id, patch })}
            onOpenCampaign={(c: Campaign) => { setFilters({ openOnly: true, campaignId: c.id }); go(selection, "tasks"); }}
          />
        );
      case "files":
        return activePartner
          ? <PartnerFilesTab groupId={activePartner.id} />
          : <Empty title="BES's own files" body="BES Internal Marketing has no partner to file documents against. Attach files to a task instead — they appear on its activity." />;
      case "activity":
        return activePartner
          ? <PartnerActivityTab groupId={activePartner.id} />
          : <Empty title="BES's own workspace" body="Activity here is recorded on each task. Open a task to see everything that happened to it." />;
      default:
        return null;
    }
  };

  return (
    <HqPageShell
      title="Sales & Marketing"
      description="Marketing and sales work for BES and for the partners who buy it."
      icon={Megaphone}
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        <MarketingTreeSidebar
          selection={selection}
          partners={partners.data ?? []}
          internalWorkspaceId={internal?.id ?? null}
          countFor={(id) => (id ? openCounts.get(id) : undefined)}
          onSelect={(next) => go(next, "overview")}
        />

        <div className="min-w-0 flex-1 space-y-3">
          {selection.kind === "workspace" && activeWorkspace && (
            <>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  {activePartner
                    ? partnerLabel({ business: activePartner.name, contact: activePartner.primaryContactName })
                    : activeWorkspace.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {activePartner ? "Marketing work BES does for this partner." : "BES's own content, campaigns and launches."}
                </p>
              </div>
              {/* Named, because the module pane above has buttons with the same
                  words on them — "Tasks" there means every partner, "Tasks"
                  here means this one. */}
              <nav aria-label="Workspace views" className="flex gap-1 overflow-x-auto border-b border-border">
                {PARTNER_VIEWS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => go(selection, t.id)}
                    aria-current={partnerTab === t.id ? "page" : undefined}
                    className={cn(
                      "shrink-0 border-b-2 px-3.5 py-2 text-xs font-bold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      partnerTab === t.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </>
          )}

          {work.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
              Could not load marketing work: {(work.error as Error).message}
            </div>
          )}

          {selection.kind === "global" ? globalBody() : partnerBody()}
        </div>
      </div>

      {creatingTask && activeWorkspaceOrInternal(activeWorkspace, internal) && (
        <NewMarketingTaskDialog
          workspace={activeWorkspaceOrInternal(activeWorkspace, internal)!}
          workspaces={allWorkspaces}
          campaigns={campaigns.data ?? []}
          members={members.data ?? []}
          agencyId={auth.agencyId ?? ""}
          onClose={() => setCreatingTask(false)}
          onCreate={async (input) => { await createWork.mutateAsync(input); setCreatingTask(false); }}
        />
      )}

      {importing && importTarget && (
        <SheetImportDialog
          workspaceName={importTarget.name}
          existing={importTargets}
          campaignNames={(campaigns.data ?? []).map((c) => c.name)}
          onClose={() => setImporting(false)}
          onApply={async (plan) => {
            const result = await applyMarketingImport([...plan.creates, ...plan.updates], {
              workspaceId: importTarget.id,
              agencyId: importTarget.agencyId ?? auth.agencyId ?? "",
              partnerGroupId: importTarget.partnerGroupId ?? null,
              statuses: importTarget.statuses,
              itemTypes: importTarget.itemTypes,
              fields: importTarget.fields,
              members: members.data ?? [],
              campaigns: campaigns.data ?? [],
            });
            await qc.invalidateQueries({ queryKey: marketingKeys.all });
            return result;
          }}
        />
      )}

      {openItemId && (
        <MarketingItemDrawer
          itemId={openItemId}
          workspaces={allWorkspaces}
          rows={rows}
          campaigns={campaigns.data ?? []}
          members={members.data ?? []}
          teams={teams.data ?? []}
          canWork={canWork}
          onSetCampaign={(itemId, campaignId) => setCampaign.mutate({ itemId, campaignId })}
          onClose={() => setOpenItemId(null)}
        />
      )}
    </HqPageShell>
  );
}

/** Creating a task needs a workspace; the global view falls back to BES's own. */
const activeWorkspaceOrInternal = <T,>(active: T | null, internal: T | null): T | null => active ?? internal;

const Empty = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{body}</p>
  </div>
);
