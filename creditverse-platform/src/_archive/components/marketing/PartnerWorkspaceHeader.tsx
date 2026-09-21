/**
 * A partner's marketing workspace at a glance.
 *
 * Dee, 2026-09-13: "Overview should immediately tell me: Open Tasks, Due
 * Today, Overdue, Content This Week, Awaiting Internal Review, Awaiting
 * Partner Approval, Changes Requested." Then upcoming content, current
 * campaigns, recent activity.
 *
 * Every tile is a link into that partner's task list filtered to exactly the
 * rows it counted, for the same reason the module dashboard works that way —
 * a count nobody can open is a count nobody can act on.
 */
import { ContentCard as ContentPreview } from "./ContentCard";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  approvalStateOf, campaignProgress, contentThisWeek, isoDay,
  type Campaign, type MarketingWorkItem, type WorkFilters,
} from "@/lib/marketing/marketing-domain";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

export function PartnerWorkspaceHeader({
  workspace,
  partnerName,
  work,
  campaigns,
  onOpenItem,
  onGoToTasks,
  onOpenCampaign,
}: {
  workspace: Workspace;
  partnerName: string;
  work: MarketingWorkItem[];
  campaigns: Campaign[];
  onOpenItem: (item: MarketingWorkItem) => void;
  onGoToTasks: (filter: Partial<WorkFilters>) => void;
  onOpenCampaign: (campaign: Campaign) => void;
}) {
  const now = Date.now();
  const today = isoDay(new Date());
  const open = work.filter((w) => !w.isTerminal);

  const tiles: { label: string; value: number; tone: string; filter: Partial<WorkFilters> }[] = [
    { label: "Open tasks", value: open.length, tone: "text-foreground", filter: {} },
    {
      label: "Due today",
      value: open.filter((w) => w.dueAt?.slice(0, 10) === today).length,
      tone: "text-amber-700",
      filter: {},
    },
    {
      label: "Overdue",
      value: open.filter((w) => w.dueAt && new Date(w.dueAt).getTime() < now).length,
      tone: "text-red-700",
      filter: {},
    },
    { label: "Content this week", value: contentThisWeek(open).length, tone: "text-violet-700", filter: {} },
    {
      label: "Awaiting internal review",
      value: work.filter((w) => w.statusKey === "internal_review").length,
      tone: "text-violet-700",
      filter: { statusKey: "internal_review" },
    },
    {
      label: "Awaiting partner approval",
      value: work.filter((w) => approvalStateOf(w) === "awaiting").length,
      tone: "text-purple-700",
      filter: { approvalState: "awaiting" },
    },
    {
      label: "Changes requested",
      value: work.filter((w) => approvalStateOf(w) === "changes_requested").length,
      tone: "text-orange-700",
      filter: { approvalState: "changes_requested" },
    },
  ];

  const upcoming = open
    .filter((w) => w.publishOn && w.publishOn >= today)
    .sort((a, b) => (a.publishOn ?? "").localeCompare(b.publishOn ?? ""))
    .slice(0, 8);
  const running = campaigns.filter((c) => c.status === "active" || c.status === "planned");
  const recent = [...work]
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onGoToTasks(t.filter)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
              {t.label}
            </span>
            <span className={cn("mt-1 block text-xl font-bold tabular-nums", t.value === 0 ? "text-muted-foreground" : t.tone)}>
              {t.value}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ContentCard title="Upcoming content">
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing scheduled. Give a task a Publish Date and it appears here and on the calendar.
            </p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((w) => (
                <li key={w.id}>
                  <ContentPreview
                    item={w}
                    showPartner={false}
                    draggable={false}
                    dragging={false}
                    onOpen={() => onOpenItem(w)}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                  />
                </li>
              ))}
            </ul>
          )}
        </ContentCard>

        <ContentCard title="Current campaigns">
          {running.length === 0 ? (
            <p className="text-xs text-muted-foreground">No campaign is planned or active for {partnerName}.</p>
          ) : (
            <ul className="space-y-2">
              {running.map((c) => {
                const p = campaignProgress(work, c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onOpenCampaign(c)}
                      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      <span className="flex items-center justify-between text-xs">
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary">{c.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{p.done}/{p.total}</span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${p.percent}%` }}
                          role="progressbar"
                          aria-valuenow={p.percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${c.name} progress`}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ContentCard>

        <ContentCard title="Recent activity">
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing has happened here yet.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {recent.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(w)}
                    className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{w.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{w.statusLabel}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatDate((w.updatedAt ?? w.createdAt).slice(0, 10))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ContentCard>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {workspace.name} · statuses, item types and content fields are this workspace's own rows, so they
        can be renamed without a release.
      </p>
    </div>
  );
}
