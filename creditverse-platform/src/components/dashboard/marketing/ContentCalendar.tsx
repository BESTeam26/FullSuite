/**
 * The Content Calendar — the marketing team's production surface.
 *
 * Dee: "The calendar should not just display tasks by date. I want my
 * Marketing team to actually work from it."
 *
 * Three views over ONE set of records — Month, Week and List. Not three data
 * sources and not three components' worth of filtering: the same
 * `marketing_work` rows, the same filter bar, the same card, the same drawer.
 * Dragging a card writes the canonical `publish_at` field, which is why the
 * task list shows the new date without being told (Dee, 2026-09-12: "one
 * canonical work_item displayed by publish/scheduled date. Do NOT create
 * duplicate content records just to make the calendar").
 *
 * Work with no publish date is not here in any view. It is a task, and the
 * Tasks area is where tasks are.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  MONTH_LABEL, WEEK_LABEL, calendarGrid, filterWork, shiftMonth, shiftWeek,
  startOfMonth, startOfWeek, weekGrid,
  type CalendarDay, type MarketingWorkItem, type WorkFilters,
} from "@/lib/marketing/marketing-domain";
import { ContentCard } from "./ContentCard";
import { CHANNEL_TONE, DEFAULT_TONE } from "./content-visuals";
import { ContentFilterBar } from "./ContentFilterBar";
import type { WorkspaceStatus } from "@/lib/workspaces/workspace-domain";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type ViewMode = "month" | "week" | "list";

export function ContentCalendar({
  items,
  statuses,
  showPartner,
  canWork,
  filters,
  onFiltersChange,
  onOpenItem,
  onReschedule,
  onImport,
  onCreate,
}: {
  items: MarketingWorkItem[];
  statuses: WorkspaceStatus[];
  showPartner: boolean;
  canWork: boolean;
  filters: WorkFilters;
  onFiltersChange: (next: WorkFilters) => void;
  onOpenItem: (item: MarketingWorkItem) => void;
  /** Writes the item's `publish_at` field. */
  onReschedule: (item: MarketingWorkItem, date: string) => void;
  onImport?: () => void;
  onCreate?: () => void;
}) {
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  /* Filtered ONCE, then shaped for whichever view is open — so the three
     views can never disagree about which rows exist. */
  const visible = useMemo(() => filterWork(items, filters), [items, filters]);
  const grid = useMemo(
    () => (mode === "week" ? weekGrid(anchor, visible) : calendarGrid(startOfMonth(anchor), visible)),
    [mode, anchor, visible],
  );
  const scheduled = useMemo(
    () => visible.filter((i) => i.publishOn).sort((a, b) => (a.publishOn ?? "").localeCompare(b.publishOn ?? "")),
    [visible],
  );
  const inPeriod = mode === "list"
    ? scheduled.length
    : grid.reduce((n, d) => n + (d.inMonth ? d.items.length : 0), 0);

  const step = (by: number) =>
    setAnchor((d) => (mode === "week" ? shiftWeek(d, by) : shiftMonth(startOfMonth(d), by)));

  const drop = (day: CalendarDay) => {
    setOver(null);
    const item = visible.find((i) => i.id === dragging);
    setDragging(null);
    if (item && item.publishOn?.slice(0, 10) !== day.date) onReschedule(item, day.date);
  };

  const cell = (day: CalendarDay, tall: boolean) => (
    <div
      key={day.date}
      onDragOver={canWork ? (e) => { e.preventDefault(); setOver(day.date); } : undefined}
      onDragLeave={canWork ? () => setOver((d) => (d === day.date ? null : d)) : undefined}
      onDrop={canWork ? (e) => { e.preventDefault(); drop(day); } : undefined}
      className={cn(
        "space-y-1 p-1.5 transition-colors",
        tall ? "min-h-[16rem]" : "min-h-[7rem]",
        day.inMonth ? "bg-card" : "bg-muted/30",
        over === day.date && "bg-primary/10 ring-2 ring-inset ring-primary",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn(
          "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
          day.isToday ? "bg-primary text-primary-foreground"
            : day.inMonth ? "text-foreground" : "text-muted-foreground",
        )}>
          {day.dayOfMonth}
        </span>
        {day.items.length > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground">{day.items.length}</span>
        )}
      </div>
      <ul className="space-y-1">
        {day.items.map((item) => (
          <li key={item.id}>
            <ContentCard
              item={item}
              showPartner={showPartner}
              draggable={canWork}
              dragging={dragging === item.id}
              onOpen={() => onOpenItem(item)}
              onDragStart={() => setDragging(item.id)}
              onDragEnd={() => { setDragging(null); setOver(null); }}
            />
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {mode !== "list" && (
            <>
              <Button size="sm" variant="outline" aria-label="Previous" onClick={() => step(-1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <h2 className="min-w-[11rem] px-1 text-sm font-bold text-foreground">
                {mode === "week" ? WEEK_LABEL(anchor) : MONTH_LABEL(startOfMonth(anchor))}
              </h2>
              <Button size="sm" variant="outline" aria-label="Next" onClick={() => step(1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>Today</Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div role="tablist" aria-label="Calendar view" className="flex rounded-lg border border-border p-0.5">
            {(["month", "week", "list"] as ViewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {onCreate && (
            <Button size="sm" onClick={onCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create content
            </Button>
          )}
          {onImport && (
            <Button size="sm" variant="outline" onClick={onImport}>
              <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Import
            </Button>
          )}
        </div>
      </div>

      <ContentFilterBar
        items={items}
        statuses={statuses}
        showPartner={showPartner}
        filters={filters}
        onChange={onFiltersChange}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        {inPeriod} {inPeriod === 1 ? "post" : "posts"}
        {mode === "list" ? " scheduled" : mode === "week" ? " this week" : " this month"}
        {canWork && mode !== "list" && " · drag a post to move it"}
      </p>

      {mode === "list" ? (
        scheduled.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">Nothing scheduled</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Give a task a Publish Date and it appears here, on the calendar, and nowhere else twice.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {scheduled.map((item) => (
              <li key={item.id} className="border-b border-border/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="w-24 shrink-0 text-[11px] font-semibold tabular-nums text-violet-800">
                    {formatDate(item.publishOn)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{item.title}</span>
                  {showPartner && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{item.partnerName ?? "BES"}</span>
                  )}
                  {item.channel && (
                    <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      CHANNEL_TONE[item.channel] ?? DEFAULT_TONE)}>
                      {item.channel}
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-muted-foreground">{item.assigneeName ?? "Unassigned"}</span>
                  <span className="w-36 shrink-0 truncate text-[11px] font-medium text-foreground">
                    {item.statusLabel ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="overflow-x-auto">
          <div className={mode === "week" ? "min-w-[56rem]" : "min-w-[52rem]"}>
            <div className="grid grid-cols-7 gap-px rounded-t-xl border border-b-0 border-border bg-border">
              {WEEKDAYS.map((d) => (
                <div key={d} className="bg-muted/60 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px rounded-b-xl border border-border bg-border">
              {grid.map((day) => cell(day, mode === "week"))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
