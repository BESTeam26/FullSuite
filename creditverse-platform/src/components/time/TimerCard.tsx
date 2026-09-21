/**
 * The running timer, and the one place it is stopped.
 *
 * Dee's mockup makes this the biggest thing on the page, which is right: it is
 * the only part of My Time that is true RIGHT NOW. Everything else is a record
 * of what already happened.
 *
 * Break, Lunch and Stop are the three punches, side by side.
 *
 * They lived in a ⋮ menu for a while, on the reasoning that a break is a
 * governed state rather than a third button. Dee, 2026-09-21: "I missed the
 * Break and Lunch punches on the timer, I only see clock out / clock in now."
 * A punch nobody can find is a punch nobody makes, and the pay depends on
 * them: paid break minutes are capped by the schedule's allowance, and lunch
 * is never paid (`payable_minutes`). So they are visible controls, with what
 * each one costs written under them.
 */
import { AlertTriangle, Coffee, Play, Square, UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  dayTotalForState, divisionLabel, entrySeconds, restBudget, restChip,
  restClock, restPhrase, restPunchLabel, stopwatch,
} from "@/lib/time-domain";
import type { TimeEntry } from "@/lib/data/time-entries";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function TimerCard({
  entry, now, day, allowance, partnerName, busy, onStop, onBreak, onLunch, onResume,
}: {
  entry: TimeEntry;
  now: Date;
  /** Today's totals, so the clock reads the day rather than this sitting. */
  day: { workSeconds: number; breakSeconds: number; lunchSeconds: number };
  /** The person's own schedule, for the break and lunch allowance. */
  allowance?: { breakMinutes: number; lunchMinutes: number } | null;
  partnerName: string | null;
  busy: boolean;
  onStop: () => void;
  onBreak: () => void;
  onLunch: () => void;
  onResume: () => void;
}) {

  const resting = entry.kind !== "work";
  /* The DAY's total for whatever is running. A second break restarting at
     zero hid how much of the allowance was already spent (Dee, 2026-09-21);
     this sitting is shown beneath it. */
  const seconds = dayTotalForState(entry.kind, day);
  const sitting = entrySeconds(entry, now);
  const breakBudget = restBudget("break", day, allowance);
  const lunchBudget = restBudget("lunch", day, allowance);
  const restKind = resting ? (entry.kind as "break" | "lunch") : null;
  const phrase = restKind ? restPhrase(restKind, restKind === "break" ? breakBudget : lunchBudget) : null;

  return (
    <div className={cn(
      "relative rounded-2xl border p-5",
      resting ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5",
    )}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
          resting ? "bg-amber-500/15 text-amber-800" : "bg-emerald-500/15 text-emerald-800",
        )}>
          <span aria-hidden className={cn("h-2 w-2 rounded-full",
            resting ? "bg-amber-500" : "animate-pulse bg-emerald-600")} />
          {resting ? (entry.kind === "lunch" ? "On lunch" : "On break") : "Tracking"}
        </span>

      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-extrabold tracking-tight text-foreground">
            {resting
              ? (entry.kind === "lunch" ? "Lunch" : "Break")
              : (entry.taskNote?.trim() || divisionLabel(entry.divisionId))}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{divisionLabel(entry.divisionId)}</span>
            {partnerName && (<><span aria-hidden>›</span><span>{partnerName}</span></>)}
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-4xl font-extrabold tabular-nums tracking-tight text-foreground">
            {restKind ? restClock(seconds) : stopwatch(seconds)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {restKind ? "used today" : "today"} · this one {restClock(sitting)}, started {clock(entry.startedAt)}
          </p>
          {phrase && (
            <p className={cn("mt-0.5 flex items-center justify-end gap-1.5 text-xs font-semibold",
              phrase.over ? "text-status-danger" : "text-muted-foreground")}>
              {phrase.over && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {phrase.detail}
            </p>
          )}
          {!resting && allowance && (
            /* What is left of each allowance, before another one is started. */
            <p className="mt-0.5 flex flex-wrap justify-end gap-x-3 text-xs text-muted-foreground">
              <span className={cn(breakBudget.overSeconds > 0 && "font-semibold text-status-danger")}>
                {restChip("break", breakBudget)}
              </span>
              <span className={cn(lunchBudget.overSeconds > 0 && "font-semibold text-status-danger")}>
                {restChip("lunch", lunchBudget)}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {resting ? (
          <button type="button" onClick={onResume} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-status-success px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-status-success-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            <Play className="h-4 w-4 fill-current" aria-hidden /> Back to work
          </button>
        ) : (
          <>
            <PunchButton icon={Coffee} label={restPunchLabel("break", breakBudget)}
              hint="Paid up to your allowance" showHint={breakBudget.allowanceSeconds === null}
              onClick={onBreak} disabled={busy} />
            <PunchButton icon={UtensilsCrossed} label={restPunchLabel("lunch", lunchBudget)}
              hint="Unpaid" showHint={lunchBudget.allowanceSeconds === null}
              onClick={onLunch} disabled={busy} />
          </>
        )}
        <button type="button" onClick={onStop} disabled={busy}
          /* NOT bg-red-600: tailwind.config.ts replaces Tailwind's red scale with a
             single `red` token, so red-600 produces no background at all and this
             read as white text on the pale card. See index.css. */
          className="inline-flex items-center gap-2 rounded-xl bg-status-danger px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-status-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
          <Square className="h-4 w-4 fill-current" aria-hidden /> Stop timer
        </button>
      </div>
    </div>
  );
}

/**
 * `hint` is the standing pay RULE; the label carries how much is left today.
 * When an allowance is known the label already says "paid left" or "unpaid",
 * so printing the rule beside it is noise — it is shown only when there is no
 * schedule and the label therefore says nothing about pay.
 */
const PunchButton = ({ icon: Icon, label, hint, showHint, onClick, disabled }: {
  icon: typeof Coffee; label: string; hint: string; showHint: boolean;
  onClick: () => void; disabled: boolean;
}) => (
  <button type="button" onClick={onClick} disabled={disabled} title={hint}
    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
    <span>{label}</span>
    {showHint && <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>}
  </button>
);
