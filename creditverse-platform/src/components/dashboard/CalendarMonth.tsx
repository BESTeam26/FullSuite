/**
 * The month grid.
 *
 * ── RULE 15, WHICH IS MOST OF THE WORK IN A CALENDAR ───────────────────────
 *
 * A month grid has four day states that all have to stay readable: an
 * ordinary day, TODAY, a SELECTED day, and a day borrowed from the month
 * either side. The failure mode is a selected today in another month, where
 * three treatments stack and the number disappears. So the background comes
 * from ONE decision and the foreground is set with it, never inherited.
 *
 * ── A BUSY DAY MUST NOT CLIP ───────────────────────────────────────────────
 *
 * A cell shows at most three entries and then "+n more"; the whole day is
 * readable in the panel underneath, which is also what makes the grid usable
 * on a phone where three chips is already generous. Nothing is hidden without
 * saying how much.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { WEEKDAY_LABELS, monthGrid, monthLabel } from "@/lib/calendar/month-grid";
import { cn } from "@/lib/utils";

export interface MonthEntry {
  id: string;
  /** Local `YYYY-MM-DD`. */
  day: string;
  title: string;
  /** Where clicking the entry goes. A holiday has nowhere to go and has none. */
  href?: string;
  overdue: boolean;
  /** A short coloured label, e.g. "Work item due". */
  kindLabel: string;
  kindTone: string;
  kindDot: string;
}

const MAX_PER_CELL = 3;

export function CalendarMonth({
  year, month, today, selected, entries,
  onMonth, onSelect,
}: {
  year: number;
  month: number;
  /** Local day key for today, passed in so the component has no clock of its own. */
  today: string;
  selected: string | null;
  entries: readonly MonthEntry[];
  onMonth: (delta: number) => void;
  onSelect: (day: string | null) => void;
}) {
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const byDay = useMemo(() => {
    const m = new Map<string, MonthEntry[]>();
    for (const e of entries) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [entries]);
  const selectedList = selected ? byDay.get(selected) ?? [] : [];

  const navBtn =
    "rounded-lg border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">{monthLabel(year, month)}</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMonth(-1)} className={navBtn} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMonth(0)}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Today
          </button>
          <button type="button" onClick={() => onMonth(1)} className={navBtn} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* The grid scrolls inside its own container rather than the page, so a
          narrow screen never scrolls the whole layout sideways. */}
      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-7 gap-1 pb-1">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const list = byDay.get(cell.key) ?? [];
              const isToday = cell.key === today;
              const isSelected = cell.key === selected;
              /* ONE decision, so three treatments cannot stack into an
                 unreadable cell. Selected wins, then today, then in-month,
                 then borrowed. */
              const surface = isSelected
                ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/30"
                : isToday
                  ? "border-primary/50 bg-primary/5 text-foreground"
                  : cell.inMonth
                    ? "border-border bg-card text-foreground"
                    : "border-border/60 bg-muted/30 text-muted-foreground";
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => onSelect(isSelected ? null : cell.key)}
                  aria-pressed={isSelected}
                  aria-label={`${formatDate(cell.key)}${list.length > 0 ? `, ${list.length} item${list.length === 1 ? "" : "s"}` : ", nothing due"}`}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left transition-colors",
                    surface,
                    "hover:border-primary/60",
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className={cn("text-xs font-bold", isToday && !isSelected && "text-primary")}>
                      {cell.dayOfMonth}
                    </span>
                    {list.length > 0 && (
                      <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold">
                        {list.length}
                      </span>
                    )}
                  </span>
                  {list.slice(0, MAX_PER_CELL).map((e) => (
                    <span key={e.id} className="flex items-center gap-1 truncate text-[10px]">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", e.kindDot)} />
                      <span className={cn("truncate", e.overdue && "font-bold text-status-danger")}>{e.title}</span>
                    </span>
                  ))}
                  {list.length > MAX_PER_CELL && (
                    /* Never hide without saying how much. */
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      +{list.length - MAX_PER_CELL} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">{formatDate(selected)}</h3>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-xs font-semibold text-muted-foreground underline hover:text-foreground"
            >
              Close
            </button>
          </div>
          {selectedList.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Nothing due on this day.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/60">
              {selectedList.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  {e.href ? (
                    <Link to={e.href} className="min-w-0 truncate font-semibold text-foreground hover:underline">
                      {e.title}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate font-semibold text-foreground">{e.title}</span>
                  )}
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", e.kindTone)}>
                      {e.kindLabel}
                    </span>
                    {e.overdue && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        Overdue
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
