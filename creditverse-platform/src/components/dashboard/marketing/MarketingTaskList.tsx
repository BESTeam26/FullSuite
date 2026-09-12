/**
 * The marketing task list — global, or one workspace's.
 *
 * Grouped by status in the workspace's own order, because that is how somebody
 * works a board: what is in progress, what is waiting, what needs reviewing.
 * Every row opens the canonical work item drawer, which is where assignee, due
 * date, priority, status, checklist, comments, files and custom fields already
 * live — this list adds no editing of its own, so there is one place a task is
 * changed and one place to look when it changes wrongly.
 *
 * The Partner column only appears in the global view. Inside a partner's
 * workspace, every row is that partner and a column repeating their name 40
 * times is noise.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Calendar, Flag, Plus, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  byStatusThenDue, filterWork, type MarketingWorkItem, type WorkFilters,
} from "@/lib/marketing/marketing-domain";
import type { WorkspaceStatus } from "@/lib/workspaces/workspace-domain";

const ALL = "__all__";
const PRIORITY_TONE: Record<string, string> = {
  Urgent: "text-red-700", High: "text-amber-700", Normal: "text-muted-foreground",
};

export interface TaskListFilters extends WorkFilters {
  overdue?: boolean;
  dueToday?: boolean;
  scheduled?: boolean;
}

/** The dashboard's tiles hand these down; the list applies them on top of its own. */
const applyJump = (items: MarketingWorkItem[], f: TaskListFilters): MarketingWorkItem[] => {
  const now = Date.now();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return items.filter((i) => {
    if (f.overdue && !(i.dueAt && new Date(i.dueAt).getTime() < now && !i.isTerminal)) return false;
    if (f.dueToday && !(i.dueAt?.slice(0, 10) === todayKey && !i.isTerminal)) return false;
    if (f.scheduled && !i.publishOn) return false;
    return true;
  });
};

export function MarketingTaskList({
  items,
  statuses,
  showPartner,
  loading,
  canWork,
  filters,
  onFiltersChange,
  onOpenItem,
  onNewTask,
}: {
  items: MarketingWorkItem[];
  statuses: WorkspaceStatus[];
  showPartner: boolean;
  loading: boolean;
  canWork: boolean;
  filters: TaskListFilters;
  onFiltersChange: (next: TaskListFilters) => void;
  onOpenItem: (item: MarketingWorkItem) => void;
  onNewTask: () => void;
}) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const visible = applyJump(filterWork(items, { ...filters, search }), filters)
      .slice()
      .sort(byStatusThenDue);
    const order = [...statuses].sort((a, b) => a.position - b.position);
    const buckets = order.map((s) => ({ status: s, rows: visible.filter((i) => i.statusId === s.id) }));
    /* Work whose status belongs to another workspace still has to appear —
       in the global view the statuses come from one workspace and the rows
       from several. Losing rows silently is worse than an extra heading. */
    const placed = new Set(buckets.flatMap((b) => b.rows.map((r) => r.id)));
    const rest = visible.filter((i) => !placed.has(i.id));
    return rest.length > 0
      ? [...buckets, { status: null as WorkspaceStatus | null, rows: rest }]
      : buckets;
  }, [items, statuses, filters, search]);

  const total = grouped.reduce((n, g) => n + g.rows.length, 0);
  const activeJump = filters.overdue || filters.dueToday || filters.scheduled || filters.statusKey;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, partners, campaigns, people"
            aria-label="Search marketing tasks"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <OpsSelect
          aria-label="Status"
          size="sm"
          value={filters.statusKey ?? ALL}
          onValueChange={(v) => onFiltersChange({ ...filters, statusKey: v === ALL ? null : v })}
          options={[
            { value: ALL, label: "Every status" },
            ...statuses.map((s) => ({ value: s.key, label: s.label })),
          ]}
        />
        <label className="flex items-center gap-1.5 text-xs text-foreground">
          <input
            type="checkbox"
            checked={filters.openOnly ?? true}
            onChange={(e) => onFiltersChange({ ...filters, openOnly: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
          />
          Open only
        </label>
        {activeJump && (
          <Button size="sm" variant="ghost" onClick={() => onFiltersChange({ openOnly: filters.openOnly })}>
            Clear filters
          </Button>
        )}
        {canWork && (
          <Button size="sm" onClick={onNewTask}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New task
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">Nothing here</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {items.length === 0
              ? "No marketing work has been created yet."
              : "No task matches these filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.filter((g) => g.rows.length > 0).map((g) => (
            <section key={g.status?.id ?? "other"}>
              <h3 className="mb-1 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: g.status?.colour ?? "hsl(var(--muted-foreground))" }}
                />
                {g.status?.label ?? "Other statuses"}
                <span className="tabular-nums">{g.rows.length}</span>
              </h3>
              <ul className="overflow-hidden rounded-xl border border-border bg-card">
                {g.rows.map((w) => {
                  const overdue = !w.isTerminal && w.dueAt && new Date(w.dueAt).getTime() < Date.now();
                  return (
                    <li key={w.id} className="border-b border-border/60 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onOpenItem(w)}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{w.title}</span>
                        {showPartner && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{w.partnerName ?? "BES"}</span>
                        )}
                        {w.campaignName && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                            <Flag className="h-3 w-3" /> {w.campaignName}
                          </span>
                        )}
                        {w.priority !== "Normal" && (
                          <span className={cn("shrink-0 text-[11px] font-semibold", PRIORITY_TONE[w.priority])}>
                            {w.priority}
                          </span>
                        )}
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                          <User className="h-3 w-3" />
                          {w.assigneeName ?? "Unassigned"}
                        </span>
                        {w.publishOn && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-violet-700">
                            <Calendar className="h-3 w-3" /> Publishes {formatDate(w.publishOn)}
                          </span>
                        )}
                        {w.dueAt && (
                          <span className={cn(
                            "inline-flex shrink-0 items-center gap-1 text-[11px]",
                            overdue ? "font-semibold text-red-700" : "text-muted-foreground",
                          )}>
                            {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                            {formatDate(w.dueAt)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
