/**
 * Calendar of real deadlines the person may see: work items due, statutory
 * letter clocks (reinvestigation and other timers), renewal follow-ups and
 * potential renewal dates. Sourced from the same signals the dashboards use —
 * no meeting fixtures, no sample rows.
 *
 * TWO VIEWS OF ONE SET OF FACTS. The list answers "what is coming up"; the
 * month answers "what does this month look like". Neither fetches anything the
 * other does not: the horizon only FILTERS lists the hooks already hold, so
 * switching view and paging months costs no request (rule 14).
 *
 * The choice is remembered per viewer in `localStorage` — a convenience that
 * belongs to that browser, and one whose loss costs nothing (the list is the
 * fallback).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Clock, FileText, Loader2, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDisputeSignals } from "@/lib/data/use-dispute-dashboard";
import { useFundingQueueSignals } from "@/lib/data/use-funding-domain";
import { useMyWork, useOrganizationWork } from "@/lib/data/use-work";
import { useAgency } from "@/lib/agency-context";
import { formatDate } from "@/lib/format-date";
import { CalendarMonth, type MonthEntry } from "@/components/dashboard/CalendarMonth";
import { dayKey, monthGridEnd } from "@/lib/calendar/month-grid";
import { useCalendarView, type CalendarView } from "@/lib/calendar/use-calendar-view";
import { cn } from "@/lib/utils";

interface CalendarEntry { id: string; at: string; title: string; kind: "work" | "clock" | "renewal"; href: string; overdue: boolean }
const KIND: Record<CalendarEntry["kind"], { label: string; icon: LucideIcon; tone: string; dot: string }> = {
  work: { label: "Work item due", icon: FileText, tone: "bg-amber-500/10 text-amber-800 border-amber-500/30", dot: "bg-amber-500" },
  clock: { label: "Statutory clock", icon: Clock, tone: "bg-purple-500/10 text-purple-700 border-purple-500/30", dot: "bg-purple-500" },
  renewal: { label: "Renewal", icon: RefreshCw, tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", dot: "bg-emerald-500" },
};

const TIMER_LABEL: Record<string, string> = { reinvestigation: "30-day reinvestigation ends", furnisher_notice: "Furnisher notice due", results_notice: "Results notice due", reinsertion_watch: "Reinsertion watch ends" };

export function LiveCalendar({ days = 14 }: { days?: number }) {
  const { view, setView, cursor, goMonth, selectedDay, setSelectedDay } = useCalendarView();

  const mine = useMyWork();
  const { activeOrganization } = useAgency();
  const orgWork = useOrganizationWork(activeOrganization?.id ?? null);
  const work = useMemo(() => { const seen = new Set<string>(); const items = [...mine.items, ...orgWork.items].filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true))); return { items, isLoading: mine.isLoading || orgWork.isLoading }; }, [mine.items, mine.isLoading, orgWork.items, orgWork.isLoading]);
  const dispute = useDisputeSignals();
  const funding = useFundingQueueSignals();
  const now = useMemo(() => Date.now(), []);
  /* The month view needs everything the visible grid can show, not the next
     fortnight — otherwise paging forward shows an empty month that is not
     empty. Widening it costs no request: the hooks above already hold their
     bounded lists and this only filters them. */
  const horizon = view === "month"
    ? monthGridEnd(cursor.year, cursor.month).getTime()
    : now + days * 86_400_000;

  const entries = useMemo(() => {
    const out: CalendarEntry[] = [];
    for (const w of work.items) if (w.dueAt && w.stage !== "Completed") { const t = Date.parse(w.dueAt); if (t <= horizon) out.push({ id: `w-${w.id}`, at: w.dueAt, title: w.title, kind: "work", href: "/app/my-work", overdue: t < now }); }
    const names = Object.fromEntries((dispute.data?.clients ?? []).map((c) => [c.id, c.name]));
    for (const t of dispute.data?.timers ?? []) { const ts = Date.parse(t.dueAt); if (ts <= horizon) out.push({ id: `t-${t.letterId}-${t.kind}`, at: t.dueAt, title: `${TIMER_LABEL[t.kind] ?? t.kind} · ${names[t.clientId] ?? "client"}`, kind: "clock", href: `/app/creditops/cases/${t.clientId}`, overdue: ts < now }); }
    for (const r of funding.data?.renewals ?? []) {
      const when = r.nextFollowUpAt ?? r.potentialRenewalDate; if (!when) continue;
      const ts = Date.parse(when); if (ts <= horizon) out.push({ id: `r-${when}-${r.status}`, at: when, title: r.nextFollowUpAt ? "Renewal follow-up" : "Potential renewal date", kind: "renewal", href: "/app/funding-deals", overdue: ts < now });
    }
    return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [work.items, dispute.data, funding.data, horizon, now]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of entries) { const k = e.at.slice(0, 10); m.set(k, [...(m.get(k) ?? []), e]); }
    return [...m.entries()];
  }, [entries]);
  const loading = work.isLoading || dispute.isLoading || funding.isLoading;

  /* The same entries, keyed by LOCAL day for the grid — a deadline at 9pm is
     "the 30th" to the person reading it, not the 1st. */
  const monthEntries = useMemo<MonthEntry[]>(
    () => entries.map((e) => ({
      id: e.id,
      day: dayKey(e.at),
      title: e.title,
      href: e.href,
      overdue: e.overdue,
      kindLabel: KIND[e.kind].label,
      kindTone: KIND[e.kind].tone,
      kindDot: KIND[e.kind].dot,
    })),
    [entries],
  );

  const tab = (v: CalendarView, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
        /* The unselected tab keeps real contrast: rule 15 forbids a choice
           whose alternative is too faint to read. */
        view === v
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Calendar view">
          {tab("list", "List")}
          {tab("month", "Month")}
        </div>
        {loading && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Gathering deadlines…
          </p>
        )}
      </div>

      {view === "month" ? (
        <CalendarMonth
          year={cursor.year}
          month={cursor.month}
          today={dayKey(new Date(now))}
          selected={selectedDay}
          entries={monthEntries}
          onMonth={goMonth}
          onSelect={setSelectedDay}
        />
      ) : (
        <>
      {!loading && entries.length === 0 && <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nothing due in the next {days} days across your work, letter clocks and renewals.</p>}
      {byDay.map(([day, list]) => (
        <section key={day} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-foreground"><CalendarClock className="h-4 w-4 text-primary" /> {formatDate(day)}{day === new Date(now).toISOString().slice(0, 10) && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Today</span>}</h2>
          <ul className="mt-2 divide-y divide-border/60">
            {list.map((e) => { const k = KIND[e.kind]; const Icon = k.icon; return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <Link to={e.href} className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground hover:underline"><Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{e.title}</span></Link>
                <span className="inline-flex items-center gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", k.tone)}>{k.label}</span>
                  {e.overdue && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-700">Overdue</span>}
                </span>
              </li>
            ); })}
          </ul>
        </section>
      ))}
        </>
      )}
    </div>
  );
}
