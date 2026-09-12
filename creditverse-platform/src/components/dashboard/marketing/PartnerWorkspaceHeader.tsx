/**
 * A partner's marketing workspace at a glance: what is open, what is late,
 * what is with them, and which campaigns are running.
 *
 * Every number is a link into that partner's task list filtered to exactly the
 * rows it counted, for the same reason the module dashboard works that way — a
 * count nobody can open is a count nobody can act on.
 */
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { campaignProgress, type Campaign, type MarketingWorkItem } from "@/lib/marketing/marketing-domain";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

export function PartnerWorkspaceHeader({
  workspace,
  partnerName,
  work,
  campaigns,
  onOpenItem,
  onGoToTasks,
}: {
  workspace: Workspace;
  partnerName: string;
  work: MarketingWorkItem[];
  campaigns: Campaign[];
  onOpenItem: (item: MarketingWorkItem) => void;
  onGoToTasks: (filter: { statusKey?: string; overdue?: boolean; scheduled?: boolean }) => void;
}) {
  const now = Date.now();
  const open = work.filter((w) => !w.isTerminal);
  const overdue = open.filter((w) => w.dueAt && new Date(w.dueAt).getTime() < now);
  const scheduled = open.filter((w) => w.publishOn);
  const review = work.filter((w) => w.statusKey === "internal_review");
  const approval = work.filter((w) => w.statusKey === "partner_approval");

  const tiles = [
    { label: "Open tasks", value: open.length, tone: "text-foreground", filter: {} },
    { label: "Overdue", value: overdue.length, tone: "text-red-700", filter: { overdue: true } },
    { label: "Content scheduled", value: scheduled.length, tone: "text-violet-700", filter: { scheduled: true } },
    { label: "For internal review", value: review.length, tone: "text-violet-700", filter: { statusKey: "internal_review" } },
    { label: "Awaiting their approval", value: approval.length, tone: "text-purple-700", filter: { statusKey: "partner_approval" } },
  ];

  const upcoming = scheduled
    .slice()
    .sort((a, b) => (a.publishOn ?? "").localeCompare(b.publishOn ?? ""))
    .slice(0, 8);

  const running = campaigns.filter((c) => c.status === "active" || c.status === "planned");

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onGoToTasks(t.filter)}
            className="rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.label}
            </span>
            <span className={cn("mt-1 block text-2xl font-bold tabular-nums", t.value === 0 ? "text-muted-foreground" : t.tone)}>
              {t.value}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ContentCard title="Publishing next">
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing is scheduled. Give a task a Publish Date and it appears here and on the calendar.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {upcoming.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(w)}
                    className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{w.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {[w.contentType, w.channel].filter(Boolean).join(" · ")}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-violet-700">{formatDate(w.publishOn)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ContentCard>

        <ContentCard title="Campaigns running">
          {running.length === 0 ? (
            <p className="text-xs text-muted-foreground">No campaign is planned or active for {partnerName}.</p>
          ) : (
            <ul className="space-y-2">
              {running.map((c) => {
                const p = campaignProgress(work, c.id);
                return (
                  <li key={c.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{p.done}/{p.total}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${p.percent}%` }}
                        role="progressbar"
                        aria-valuenow={p.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${c.name} progress`}
                      />
                    </div>
                  </li>
                );
              })}
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
