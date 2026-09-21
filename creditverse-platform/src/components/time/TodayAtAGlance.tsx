/**
 * Today, in one block, for a phone.
 *
 * Dee's mobile spec, 2026-09-21: today should immediately show clock in, clock
 * out if the day is finished, worked time, break, lunch, the current state,
 * and the attendance exception if there is one. On a desk that is spread over
 * four stat cards, a timer card and a timeline; on a phone it has to be one
 * glance.
 *
 * Every figure is passed in from what My Time already derived — `liveDaySeconds`,
 * the schedule, the open entry. Nothing is recomputed here, so the phone and
 * the desk cannot disagree about somebody's day.
 */
import { AlertTriangle, Coffee, LogIn, LogOut, UtensilsCrossed } from "lucide-react";
import { formatClock } from "@/lib/time-domain";
import { timeIn, BES_TIMEZONE } from "@/lib/communication/conversation-clock";
import { cn } from "@/lib/utils";

export interface TodayGlance {
  /** The day's first clock-in and, when the day is finished, its last clock-out. */
  firstIn: string | null;
  lastOut: string | null;
  workSeconds: number;
  breakSeconds: number;
  lunchSeconds: number;
  state: "out" | "working" | "break" | "lunch";
  /** Already-derived exceptions, in the words My Time uses. */
  exceptions: string[];
}

const STATE_LABEL: Record<TodayGlance["state"], string> = {
  out: "Clocked out",
  working: "Clocked in",
  break: "On break",
  lunch: "On lunch",
};

export function TodayAtAGlance({ glance, timeZone = BES_TIMEZONE }: { glance: TodayGlance; timeZone?: string }) {
  const { firstIn, lastOut, workSeconds, breakSeconds, lunchSeconds, state, exceptions } = glance;
  return (
    <section aria-label="Today at a glance" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">Today</h2>
        <span className="text-xs font-semibold text-muted-foreground">{STATE_LABEL[state]}</span>
      </div>

      <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
        {workSeconds > 0 ? formatClock(workSeconds) : "00:00:00"}
      </p>
      <p className="text-[11px] text-muted-foreground">worked</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row icon={LogIn} label="Clock in" value={firstIn ? timeIn(firstIn, timeZone) : "—"} />
        <Row icon={LogOut} label="Clock out" value={lastOut ? timeIn(lastOut, timeZone) : state === "out" ? "—" : "Still on"} />
        <Row icon={Coffee} label="Break" value={breakSeconds > 0 ? formatClock(breakSeconds) : "—"} />
        <Row icon={UtensilsCrossed} label="Lunch" value={lunchSeconds > 0 ? formatClock(lunchSeconds) : "—"} />
      </dl>

      {exceptions.length > 0 && (
        <ul className="mt-3 space-y-1">
          {exceptions.map((e) => (
            <li key={e} className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" aria-hidden />
              {e}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const Row = ({ icon: Icon, label, value }: { icon: typeof LogIn; label: string; value: string }) => (
  <div className="flex items-center gap-2">
    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
    <dt className="text-muted-foreground">{label}</dt>
    <dd className={cn("ml-auto font-semibold tabular-nums text-foreground")}>{value}</dd>
  </div>
);
