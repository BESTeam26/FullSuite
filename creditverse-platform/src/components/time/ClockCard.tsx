/**
 * The clock, on Home — Dee's mobile spec, 2026-09-21: "an employee should be
 * able to open FullSuite and understand their attendance state and take the
 * correct action within seconds."
 *
 * ── IT OWNS NO STATE ──────────────────────────────────────────────────────
 *
 * Everything here comes from `useTimesheet()`, the same hook My Time uses:
 * the same punches, the same open-entry query (which refetches when the tab
 * comes back to the front), the same break rules, the same payroll treatment.
 * A punch from a phone and a punch from a desk are one event on one row.
 * The ticking figure is presentation only — it counts from
 * `openEntry.startedAt`, a server timestamp, so reopening the app, killing
 * the PWA or switching devices reconstructs the truth rather than resuming a
 * local guess.
 *
 * ── ONLY THE MOVES THAT EXIST ─────────────────────────────────────────────
 *
 * Clocked out offers Clock In. Working offers Break, Lunch and Clock Out. A
 * break or lunch offers Back to work. Nothing is rendered disabled "for
 * later": an impossible action is absent (rule 3).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Coffee, LogIn, LogOut, Play, UtensilsCrossed, Loader2, AlertTriangle } from "lucide-react";
import { useTimesheet } from "@/lib/data/use-time";
import { useAuth } from "@/lib/auth/auth-context";
import { entrySeconds, formatDuration, stopwatch } from "@/lib/time-domain";
import { timeIn, BES_TIMEZONE } from "@/lib/communication/conversation-clock";
import { cn } from "@/lib/utils";

/** The clock state, named the way the person would say it. */
type ClockState = "out" | "working" | "break" | "lunch";

const STATE_LABEL: Record<ClockState, string> = {
  out: "Clocked out",
  working: "Clocked in",
  break: "On break",
  lunch: "On lunch",
};

const STATE_TONE: Record<ClockState, string> = {
  out: "border-border bg-card",
  working: "border-emerald-500/40 bg-emerald-500/5",
  break: "border-amber-500/40 bg-amber-500/5",
  lunch: "border-blue-500/40 bg-blue-500/5",
};

const DOT: Record<ClockState, string> = {
  out: "bg-muted-foreground/40",
  working: "animate-pulse bg-emerald-600",
  break: "bg-amber-500",
  lunch: "bg-blue-500",
};

export function ClockCard() {
  const auth = useAuth();
  const t = useTimesheet();
  /* A second per tick, anchored on the server's `startedAt` — never a local
     accumulator that would drift or survive a reload with the wrong total. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!t.openEntry) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [t.openEntry]);

  /* Only BES staff have an agency clock — an organization user has nothing to
     write to.
     Dee and Aaron are EXEMPT from tracking (20260921004000), which means they
     are never required to punch, not that they may not. Dee was on lunch on
     the clock the day this was written, so hiding it from her would take away
     a control she uses. The card therefore stands down only when somebody
     exempt has not punched at all today. */
  if (!auth.agencyMembership) return null;
  const exempt = auth.agencyMembership.time_tracking_required === false;
  if (exempt && !t.openEntry && t.todayMinutes === 0) return null;

  const open = t.openEntry;
  const state: ClockState = !open ? "out" : open.kind === "break" ? "break" : open.kind === "lunch" ? "lunch" : "working";
  const busy = t.isMutating;
  const elapsed = open ? entrySeconds(open, now) : 0;

  /* The day's own division: continue what they were last on, so one tap does
     not silently file the morning under Admin. */
  const lastDivision = t.entries.find((e) => e.kind === "work")?.divisionId ?? "admin";

  return (
    <section aria-label="Your clock"
      className={cn("rounded-2xl border p-4", STATE_TONE[state])}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", DOT[state])} />
          {STATE_LABEL[state]}
          {open && state === "working" && (
            <span className="font-normal text-muted-foreground">· in at {timeIn(open.startedAt, BES_TIMEZONE)}</span>
          )}
        </p>
        <p className="font-mono text-2xl font-extrabold tabular-nums tracking-tight text-foreground">
          {open ? stopwatch(elapsed) : formatDuration(t.todayMinutes)}
        </p>
      </div>

      <p className="mt-0.5 text-xs text-muted-foreground">
        {open
          ? `${formatDuration(t.todayMinutes)} worked today`
          : t.todayMinutes > 0 ? "Worked today · your clock is stopped" : "You have not clocked in today"}
      </p>

      {t.actionError && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-status-danger-tint px-2.5 py-1.5 text-xs font-medium text-status-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {/* A failed punch says so. It never shows the state it wanted. */}
          {t.actionError}
        </p>
      )}

      {/* 48px minimum, full width on a phone, and every button leaves while a
          punch is in flight — two taps must never make two rows. */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:auto-cols-fr sm:grid-flow-col">
        {state === "out" && (
          <Action busy={busy} tone="primary" icon={LogIn} label="Clock in"
            onClick={() => t.clockIn(lastDivision, undefined, null)} />
        )}
        {state === "working" && (
          <>
            <Action busy={busy} tone="quiet" icon={Coffee} label="Start break" onClick={() => t.startBreak("break")} />
            <Action busy={busy} tone="quiet" icon={UtensilsCrossed} label="Start lunch" onClick={() => t.startBreak("lunch")} />
            <Action busy={busy} tone="danger" icon={LogOut} label="Clock out" onClick={() => t.clockOut()} />
          </>
        )}
        {(state === "break" || state === "lunch") && (
          <Action busy={busy} tone="primary" icon={Play} label="Back to work" onClick={() => t.resumeWork()} />
        )}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        <Link to="/app/time/my-time" className="font-semibold text-primary underline-offset-2 hover:underline">
          My Time
        </Link>{" "}
        for today's punches and your history.
      </p>
    </section>
  );
}

const TONE: Record<string, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  danger: "bg-status-danger text-white hover:bg-status-danger-strong",
  quiet: "border border-border bg-card text-foreground hover:bg-muted",
};

function Action({ icon: Icon, label, onClick, busy, tone }: {
  icon: typeof LogIn; label: string; onClick: () => void; busy: boolean; tone: keyof typeof TONE;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      aria-busy={busy}
      className={cn(
        "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        TONE[tone],
      )}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
      {busy ? "Working…" : label}
    </button>
  );
}
