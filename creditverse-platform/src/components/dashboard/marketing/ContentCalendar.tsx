/**
 * The Content Calendar — the same work items, shown by publish date.
 *
 * Dee: "one canonical work_item displayed by publish/scheduled date. Do NOT
 * create duplicate content records just to make the calendar."
 *
 * So there is no calendar record and no calendar table. Each cell holds the
 * `marketing_work` rows whose `publish_at` field falls on that day, and
 * clicking one opens the same drawer the task list opens — because it is the
 * same task. Dragging a post to another day writes that field, which is why
 * the task list shows the new date immediately without being told.
 *
 * Work with no publish date is not here. It is a task, and the task list is
 * where tasks are; inventing a day for it would be the duplicate record the
 * rule forbids.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { partnerLabel } from "@/lib/partners/partner-label";
import {
  MONTH_LABEL, calendarGrid, shiftMonth, startOfMonth, type MarketingWorkItem,
} from "@/lib/marketing/marketing-domain";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CHANNEL_TONE: Record<string, string> = {
  Facebook: "bg-blue-500/15 text-blue-800 border-blue-500/30",
  Instagram: "bg-pink-500/15 text-pink-800 border-pink-500/30",
  TikTok: "bg-neutral-900/10 text-neutral-800 border-neutral-500/30",
  LinkedIn: "bg-sky-500/15 text-sky-800 border-sky-500/30",
  YouTube: "bg-red-500/15 text-red-800 border-red-500/30",
  Email: "bg-amber-500/15 text-amber-800 border-amber-500/30",
  Blog: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30",
};
const DEFAULT_TONE = "bg-violet-500/15 text-violet-800 border-violet-500/30";

export function ContentCalendar({
  items,
  showPartner,
  canWork,
  onOpenItem,
  onReschedule,
  onImport,
}: {
  items: MarketingWorkItem[];
  showPartner: boolean;
  canWork: boolean;
  onOpenItem: (item: MarketingWorkItem) => void;
  /** Writes the item's `publish_at` field. `null` takes it off the calendar. */
  onReschedule: (item: MarketingWorkItem, date: string) => void;
  /** Absent for somebody who may only read. */
  onImport?: () => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const grid = useMemo(() => calendarGrid(month, items), [month, items]);
  const scheduled = grid.reduce((n, d) => n + (d.inMonth ? d.items.length : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <h2 className="min-w-[10rem] px-1 text-sm font-bold text-foreground">{MONTH_LABEL(month)}</h2>
          <Button size="sm" variant="outline" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
          {onImport && (
            <Button size="sm" variant="outline" className="ml-1" onClick={onImport}>
              <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Import
            </Button>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {scheduled} {scheduled === 1 ? "post" : "posts"} scheduled this month
          {canWork && " · drag a post to move it"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          <div className="grid grid-cols-7 gap-px rounded-t-xl border border-b-0 border-border bg-border">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-muted/60 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-b-xl border border-border bg-border">
            {grid.map((day) => (
              <div
                key={day.date}
                onDragOver={canWork ? (e) => { e.preventDefault(); setOver(day.date); } : undefined}
                onDragLeave={canWork ? () => setOver((d) => (d === day.date ? null : d)) : undefined}
                onDrop={canWork ? (e) => {
                  e.preventDefault();
                  setOver(null);
                  const item = items.find((i) => i.id === dragging);
                  setDragging(null);
                  if (item && item.publishOn?.slice(0, 10) !== day.date) onReschedule(item, day.date);
                } : undefined}
                className={cn(
                  "min-h-[7rem] space-y-1 p-1.5 transition-colors",
                  day.inMonth ? "bg-card" : "bg-muted/30",
                  over === day.date && "bg-primary/10 ring-2 ring-inset ring-primary",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                    day.isToday
                      ? "bg-primary text-primary-foreground"
                      : day.inMonth ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {day.dayOfMonth}
                  </span>
                </div>
                <ul className="space-y-1">
                  {day.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        draggable={canWork}
                        onDragStart={() => setDragging(item.id)}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        onClick={() => onOpenItem(item)}
                        title={[item.title, partnerLabel({ business: item.partnerName, contact: item.partnerContactName })].filter(Boolean).join(" — ")}
                        className={cn(
                          "w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:shadow-sm",
                          CHANNEL_TONE[item.channel ?? ""] ?? DEFAULT_TONE,
                          dragging === item.id && "opacity-50",
                          item.isTerminal && "line-through opacity-70",
                        )}
                      >
                        <span className="block truncate font-medium">{item.title}</span>
                        <span className="block truncate opacity-80">
                          {[showPartner ? partnerLabel({ business: item.partnerName, contact: item.partnerContactName }) || "BES" : null, item.contentType, item.channel]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        A post here is the same record as the task that produces it. Set a task's
        <span className="font-medium text-foreground"> Publish Date </span>
        field and it appears; clear it and it goes back to being a task.
      </p>
    </div>
  );
}
