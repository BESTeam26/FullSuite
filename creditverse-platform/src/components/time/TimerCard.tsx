/**
 * The running timer, and the one place it is stopped.
 *
 * Dee's mockup makes this the biggest thing on the page, which is right: it is
 * the only part of My Time that is true RIGHT NOW. Everything else is a record
 * of what already happened.
 *
 * Break and Lunch moved into the ⋮ menu rather than sitting beside Stop as
 * three same-sized buttons. They are governed states, not styling: a break is
 * the day's REST and never counts as worked time, so the card says which state
 * it is in rather than leaving the reader to infer it from a colour.
 */
import { Coffee, MoreVertical, Square, UtensilsCrossed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && box.current?.contains(e.target as Node)) return;
      setMenu(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("mousedown", close);
    };
  }, [menu]);

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

        <div className="relative" ref={box}>
          <button type="button" aria-label="Timer options" aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && (
            <div role="menu"
              className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
              {resting ? (
                <MenuItem icon={Square} onClick={() => { onResume(); setMenu(false); }} disabled={busy}
                  label="Back to work" hint="Ends the rest and resumes the clock" />
              ) : (
                <>
                  <MenuItem icon={Coffee} onClick={() => { onBreak(); setMenu(false); }} disabled={busy}
                    label="Take a break" hint="Counted as rest, not as worked time" />
                  <MenuItem icon={UtensilsCrossed} onClick={() => { onLunch(); setMenu(false); }} disabled={busy}
                    label="Go to lunch" hint="Counted as rest, not as worked time" />
                </>
              )}
            </div>
          )}
        </div>
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

      <div className="mt-4 flex justify-end">
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

const MenuItem = ({ icon: Icon, label, hint, onClick, disabled }: {
  icon: typeof Coffee; label: string; hint: string;
  onClick: () => void; disabled: boolean;
}) => (
  <button type="button" role="menuitem" onClick={onClick} disabled={disabled}
    className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
    <span className="min-w-0">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </span>
  </button>
);
