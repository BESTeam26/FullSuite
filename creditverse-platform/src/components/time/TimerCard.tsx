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
import { Coffee, Play, Square, UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { divisionLabel, entrySeconds, stopwatch } from "@/lib/time-domain";
import type { TimeEntry } from "@/lib/data/time-entries";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function TimerCard({
  entry, now, partnerName, busy, onStop, onBreak, onLunch, onResume,
}: {
  entry: TimeEntry;
  now: Date;
  partnerName: string | null;
  busy: boolean;
  onStop: () => void;
  onBreak: () => void;
  onLunch: () => void;
  onResume: () => void;
}) {

  const resting = entry.kind !== "work";
  const seconds = entrySeconds(entry, now);

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
            {stopwatch(seconds)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Started at {clock(entry.startedAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {resting ? (
          <button type="button" onClick={onResume} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-status-success px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-status-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            <Play className="h-4 w-4 fill-current" aria-hidden /> Back to work
          </button>
        ) : (
          <>
            <PunchButton icon={Coffee} label="Break" hint="Paid up to your allowance" onClick={onBreak} disabled={busy} />
            <PunchButton icon={UtensilsCrossed} label="Lunch" hint="Unpaid" onClick={onLunch} disabled={busy} />
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

const PunchButton = ({ icon: Icon, label, hint, onClick, disabled }: {
  icon: typeof Coffee; label: string; hint: string; onClick: () => void; disabled: boolean;
}) => (
  <button type="button" onClick={onClick} disabled={disabled} title={hint}
    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
    <span>{label}</span>
    <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>
  </button>
);
