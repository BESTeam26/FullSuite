/**
 * A month of leave.
 *
 * A list answers "what did I book"; a calendar answers "when am I actually
 * away", which is the question somebody opens this page with. Same records,
 * arranged so a clash with a colleague's week is visible without counting.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "@/lib/data/people-management";

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-900",
  pending: "bg-amber-500/15 text-amber-900",
  declined: "bg-status-danger-tint text-status-danger",
};
const LEGEND = [
  { key: "approved", label: "Approved", dot: "bg-emerald-600" },
  { key: "pending", label: "Pending", dot: "bg-amber-500" },
  { key: "declined", label: "Declined", dot: "bg-status-danger" },
  { key: "today", label: "Today", dot: "bg-primary" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export function LeaveCalendar({ requests, today }: { requests: LeaveRequest[]; today: string }) {
  const [offset, setOffset] = useState(0);
  const base = new Date(`${today}T12:00:00Z`);
  const shown = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
  const year = shown.getUTCFullYear();
  const month = shown.getUTCMonth() + 1;
  const label = shown.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = shown.getUTCDay();

  /* Which request covers a day — declined ones are not shown as absence, only
     as a record, so an approved day always wins the cell. */
  const rank = { approved: 3, pending: 2, declined: 1 } as Record<string, number>;
  const coverOf = (date: string) =>
    requests
      .filter((r) => r.status !== "cancelled" && r.startsOn <= date && r.endsOn >= date)
      .sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0))[0];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">My time off calendar</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month"
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[8.5rem] text-center text-xs font-semibold text-foreground">{label}</span>
          <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label="Next month"
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {offset !== 0 && (
            <button type="button" onClick={() => setOffset(0)}
              className="ml-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Today
            </button>
          )}
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {LEGEND.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", l.dot)} /> {l.label}
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} aria-hidden />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = `${year}-${pad(month)}-${pad(i + 1)}`;
          const cover = coverOf(date);
          const isToday = date === today;
          return (
            <span key={date}
              title={cover ? `${cover.typeLabel} · ${cover.status} · ${formatDate(date)}` : formatDate(date)}
              className={cn("rounded-lg py-1.5 text-xs tabular-nums",
                cover ? STATUS_TONE[cover.status] : "text-muted-foreground",
                isToday && "ring-2 ring-primary")}>
              {i + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}
