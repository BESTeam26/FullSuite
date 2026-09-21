/**
 * "Who's on now" — Dee, 2026-09-21: "I wanna see a way the admin / lead /
 * management to see if the agents are online or clocked in or on break or on
 * lunch from our view."
 *
 * Read off the canonical clock, never a second presence store: an open work
 * entry is Working, an open break or lunch says which, a closed day is
 * Clocked out, no entry today is Not in yet. Who appears is the database's
 * decision (`team_presence()` → `managed_people()`), so an agent sees nothing
 * here and this card is not rendered for them (rule 20b).
 */
import { Link } from "react-router-dom";
import { AlertTriangle, Coffee, UtensilsCrossed, LogOut, Clock, CircleDot, CalendarOff, CalendarX, UserX } from "lucide-react";
import { formatDuration } from "@/lib/time-domain";
import {
  EXCEPTION_DETAIL, EXCEPTION_LABEL, exceptionCount, presenceCounts,
  PRESENCE_LABEL, PRESENCE_ORDER, PRESENCE_TONE, restUsage, useTeamPresence, type PresenceState,
} from "@/lib/data/use-team-presence";
import { cn } from "@/lib/utils";

const ICON: Record<PresenceState, typeof Clock> = {
  clocked_in: CircleDot, on_break: Coffee, on_lunch: UtensilsCrossed, clocked_out: LogOut,
  not_in_yet: Clock, absent: UserX, off: CalendarX, on_leave: CalendarOff, no_schedule: Clock,
};

export function TeamPresence({ names }: { names: Map<string, string> }) {
  const { presence, isLoading, error } = useTeamPresence();
  const counts = presenceCounts(presence);
  const exceptions = exceptionCount(presence);
  /* Working first, then the people who stepped away, then everybody else —
     a manager reads this top-down looking for who is reachable. */
  const rows = [...presence].sort(
    (a, b) => PRESENCE_ORDER.indexOf(a.state) - PRESENCE_ORDER.indexOf(b.state)
      || (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""),
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Who's on now</h3>
        <Link to="/app/people/attendance" className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline">
          Attendance
        </Link>
      </div>

      {exceptions > 0 && (
        <Link to="/app/people/attendance"
          className="mb-2 flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-status-danger-tint px-2 py-1 text-[11px] font-semibold text-status-danger hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {exceptions} needing review
          <span className="font-normal text-muted-foreground">on the clock against the calendar</span>
        </Link>
      )}

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {PRESENCE_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", PRESENCE_TONE[s])} aria-hidden />
            <span className="font-semibold tabular-nums text-foreground">{counts[s]}</span> {PRESENCE_LABEL[s]}
          </span>
        ))}
      </div>

      {error ? (
        <p className="text-xs text-status-danger">Could not read the clock: {error}</p>
      ) : isLoading ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Reading the clock…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nobody is in your management scope yet.
        </p>
      ) : (
        <ul className="grid max-h-60 gap-x-4 gap-y-0.5 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const Icon = ICON[p.state];
            return (
              <li key={p.userId} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-muted/50">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", PRESENCE_TONE[p.state])} aria-hidden />
                <Link to={`/app/people/${p.userId}`}
                  className="min-w-0 flex-1 truncate font-medium text-foreground underline-offset-2 hover:underline">
                  {names.get(p.userId) ?? "Team member"}
                </Link>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  {p.exception && (
                    <AlertTriangle className="h-3 w-3 text-status-danger" aria-label={EXCEPTION_LABEL[p.exception]}>
                      <title>{EXCEPTION_DETAIL[p.exception]}</title>
                    </AlertTriangle>
                  )}
                  <Icon className="h-3 w-3" aria-hidden />
                  {PRESENCE_LABEL[p.state]}
                  {/* The DAY's usage, not how long this sitting has run. Dee,
                      2026-09-21: "Do not show only the duration of the current
                      segment." The over-run is what a manager acts on. */}
                  {(() => {
                    const rest = restUsage(p);
                    if (!rest) return null;
                    return (
                      <>
                        <span className="tabular-nums"> {formatDuration(rest.used)} today</span>
                        {rest.over > 0 && (
                          <span className="font-bold text-status-danger"> · {formatDuration(rest.over)} over</span>
                        )}
                      </>
                    );
                  })()}
                </span>
                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground" title="Worked today">
                  {p.workMinutes > 0 ? formatDuration(p.workMinutes) : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
