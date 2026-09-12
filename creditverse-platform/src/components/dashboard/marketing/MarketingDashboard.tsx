/**
 * Sales & Marketing — the seven numbers Dee asked for, and the work behind
 * them.
 *
 * Every tile is a link into the task list filtered to exactly the rows it
 * counted. A number nobody can click is a number nobody can act on, and the
 * question a dashboard always provokes is "which ones?".
 *
 * The counters come from `marketing_overview`, computed over exactly the rows
 * the reader may see. Two people with different access read different numbers
 * and both are correct — which is the point of counting in the database rather
 * than in the browser.
 */
import { AlertTriangle, CalendarClock, CheckSquare, Clock, Eye, Send, Users } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { MarketingCounters, MarketingWorkItem } from "@/lib/marketing/marketing-domain";

export interface DashboardJump {
  label: string;
  /** What the Tasks view should be filtered to when this tile is clicked. */
  filter: { statusKey?: string; overdue?: boolean; dueToday?: boolean; scheduled?: boolean } | null;
}

const TILES: {
  key: keyof MarketingCounters;
  label: string;
  icon: typeof Users;
  tone: string;
  jump: DashboardJump["filter"];
}[] = [
  { key: "activePartners", label: "Active Marketing Partners", icon: Users, tone: "text-foreground", jump: null },
  { key: "openTasks", label: "Open Tasks", icon: CheckSquare, tone: "text-foreground", jump: {} },
  { key: "dueToday", label: "Due Today", icon: Clock, tone: "text-amber-700", jump: { dueToday: true } },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, tone: "text-red-700", jump: { overdue: true } },
  { key: "contentScheduled", label: "Content Scheduled", icon: CalendarClock, tone: "text-foreground", jump: { scheduled: true } },
  { key: "forInternalReview", label: "For Internal Review", icon: Eye, tone: "text-violet-700", jump: { statusKey: "internal_review" } },
  { key: "awaitingPartnerApproval", label: "Awaiting Partner Approval", icon: Send, tone: "text-purple-700", jump: { statusKey: "partner_approval" } },
];

export function MarketingDashboard({
  counters,
  work,
  loading,
  onJump,
  onOpenItem,
}: {
  counters: MarketingCounters;
  work: MarketingWorkItem[];
  loading: boolean;
  onJump: (filter: DashboardJump["filter"]) => void;
  onOpenItem: (item: MarketingWorkItem) => void;
}) {
  const now = Date.now();
  const overdue = work
    .filter((w) => !w.isTerminal && w.dueAt && new Date(w.dueAt).getTime() < now)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
    .slice(0, 8);
  const waiting = work.filter((w) => w.statusKey === "partner_approval").slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((t) => {
          const value = counters[t.key];
          const Icon = t.icon;
          const clickable = t.jump !== null;
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </span>
              <span className={cn("mt-1 block text-2xl font-bold tabular-nums", value === 0 ? "text-muted-foreground" : t.tone)}>
                {loading ? "—" : value}
              </span>
            </>
          );
          return clickable ? (
            <button
              key={t.key}
              type="button"
              onClick={() => onJump(t.jump)}
              className="rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {body}
            </button>
          ) : (
            <div key={t.key} className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ContentCard title="Overdue, oldest first">
          {overdue.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing is late.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {overdue.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(w)}
                    className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{w.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{w.partnerName ?? "BES"}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-red-700">{formatDate(w.dueAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ContentCard>

        <ContentCard title="Waiting on a partner">
          {waiting.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing is with a partner for approval.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {waiting.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(w)}
                    className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{w.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{w.partnerName ?? "BES"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ContentCard>
      </div>
    </div>
  );
}
