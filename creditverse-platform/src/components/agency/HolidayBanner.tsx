/**
 * Advance notice of a U.S. holiday, getting louder as it approaches.
 *
 *   7 days out   a planning note
 *   1 day out    a stronger one — today is the day to finish handoffs
 *   on the day   simply that the office is observing it
 *   after        nothing, automatically
 *
 * Dates come from the statute and resolve in the agency's business timezone,
 * so a Manila morning does not take the banner down while the U.S. holiday is
 * still running.
 */
import { Link } from "react-router-dom";
import { CalendarDays, PartyPopper } from "lucide-react";
import { displayName } from "@/lib/calendar/us-federal-holidays";
import { longDate } from "@/lib/data/agency-calendar";
import { useUpcomingHolidays } from "@/lib/data/use-agency-calendar";
import { cn } from "@/lib/utils";

export function HolidayBanner() {
  const { holidays } = useUpcomingHolidays(1);
  const next = holidays[0];
  /* Nothing within a week is nothing to say. */
  if (!next || next.daysAway > 7) return null;

  const name = displayName(next);
  const today = next.daysAway === 0;
  const tomorrow = next.daysAway === 1;

  const title = today
    ? `Today is ${name}`
    : tomorrow
      ? `U.S. Holiday Tomorrow: ${name}`
      : `Upcoming U.S. Holiday: ${name}`;

  const body = today
    ? "BES is observing the U.S. federal holiday."
    : tomorrow
      ? "BES will observe the holiday tomorrow. Please make sure urgent work and handoffs are completed today."
      : `BES will observe ${name} on ${longDate(next.observed)}. Please plan client work, deadlines, handoffs and EOD priorities accordingly.`;

  return (
    <Link
      to="/app/calendar"
      className={cn(
        "mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
        today
          ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15"
          : tomorrow
            ? "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15"
            : "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10",
      )}
    >
      <span className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        today ? "bg-emerald-500/15 text-emerald-700"
          : tomorrow ? "bg-amber-500/15 text-amber-700"
          : "bg-blue-500/10 text-blue-700",
      )}>
        {today ? <PartyPopper className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
        {!today && (
          <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">
            {next.daysAway === 1 ? "Tomorrow" : `${next.daysAway} days away`}
          </span>
        )}
      </span>
    </Link>
  );
}

/** The next few holidays, as a small card. */
export function UpcomingHolidaysCard() {
  const { holidays } = useUpcomingHolidays(3);
  if (holidays.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Upcoming U.S. holidays
      </p>
      <ul className="space-y-2">
        {holidays.map((h) => (
          <li key={`${h.key}-${h.year}`}>
            <Link to="/app/calendar" className="group block">
              <span className="block text-sm font-semibold text-foreground group-hover:underline">
                {displayName(h)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {longDate(h.observed)}
                {" · "}
                {h.daysAway === 0 ? "today" : h.daysAway === 1 ? "tomorrow" : `${h.daysAway} days away`}
              </span>
              {h.observed !== h.date && (
                <span className="block text-[11px] text-muted-foreground">
                  Falls on {longDate(h.date)}; observed {longDate(h.observed)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
