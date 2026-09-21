/**
 * My Time — the clock, and the day around it.
 *
 * Dee, 2026-09-18, with a mockup: "Let's redesign My Time with this." It was a
 * strip of buttons above a seven-column table of the whole week. It is now a
 * workspace — what is running, what to start next, today as it happened, the
 * week as a chart, and time off.
 *
 * ── WHAT DID NOT CHANGE, DELIBERATELY ──────────────────────────────────────
 *
 * Every rule that governs recorded time survived the redesign, because a
 * prettier page that loosens them would be a worse page:
 *
 *   · An agent NEVER writes or edits their own time. The mockup's "+ Add time"
 *     is not built. Correcting an entry is still "Request adjustment", which a
 *     lead approves.
 *   · Break and lunch are the day's REST and are never summed into worked
 *     time — in the tiles, the bars or the timeline.
 *   · The 10-hour stale-timer warning, the auto-stopped badge and the
 *     schedule warnings (late, over break, over lunch) are all still here.
 *   · Starting is refused, visibly, when the timesheet is unavailable or in
 *     demo mode. A clock-in that silently does nothing is worse than a
 *     disabled button.
 *
 * Renders only. Every figure comes from `useTimesheet` and the pure functions
 * in `time-domain` and `time/my-time-view`; nothing here computes elapsed time
 * (rules 5 and 9).
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, CalendarOff, ChevronLeft, ChevronRight, Clock, Home, Users,
} from "lucide-react";
import { ContentCard, StatCard } from "@/components/dashboard/DivisionLayout";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { useTimesheet } from "@/lib/data/use-time";
import { useMyTimeAdjustments, useRequestTimeAdjustment } from "@/lib/data/use-time-adjustments";
import { useLeaveActions, useLeaveTypes, useMyLeave, useSchedules } from "@/lib/data/use-people";
import { useAgencyPartners } from "@/lib/data/use-agency-partners";
import { formatDate } from "@/lib/format-date";
import type { TimeAdjustmentRequest, TimeEntry } from "@/lib/data/time-entries";
import {
  STALE_TIMER_HOURS, describeRunningFor, formatClock, formatDuration, humanDuration,
  isStaleTimer, lateSecondsToday, liveDaySeconds, weekStart,
} from "@/lib/time-domain";
import {
  partnerSplit, recentWork, todayTimeline, weekBars, weekRangeLabel,
} from "@/lib/time/my-time-view";
import { TimerCard } from "@/components/time/TimerCard";
import { StartWorkCard, type StartRequest } from "@/components/time/StartWorkCard";
import { WeekChart } from "@/components/time/WeekChart";
import { TodayTimeline } from "@/components/time/TodayTimeline";
import { TodayAtAGlance } from "@/components/time/TodayAtAGlance";
import { RequestTimeOffDialog } from "@/components/time/RequestTimeOffDialog";
import { businessDaysBetween, businessToday } from "@/lib/calendar/us-federal-holidays";
import { rewardWallet } from "@/lib/leave/reward-wallet";
import { useMyRewards } from "@/lib/leave/use-rewards";

/**
 * One shared heartbeat for every counter on the page. It beats only while a
 * clock is running — a page of closed entries re-renders for nobody.
 */
function useNowTick(running: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  return now;
}

export const MyTimeSection = () => {
  const t = useTimesheet();
  const myAdjustments = useMyTimeAdjustments();
  const partners = useAgencyPartners();
  const schedules = useSchedules();

  const running = Boolean(t.openEntry);
  const now = useNowTick(running);
  const live = liveDaySeconds(t.entries, t.today, now);

  /* Their partners, not every partner (Dee: "only the assigned one so it's not
     too chaotic"). RLS already narrows this list to what they may see. */
  const myPartners = useMemo(
    () => (partners.data ?? []).filter((p) => p.lifecycle !== "archived").map((p) => ({ id: p.id, name: p.name })),
    [partners.data],
  );
  const partnerName = useMemo(
    () => new Map((partners.data ?? []).map((p) => [p.id, p.name])),
    [partners.data],
  );
  const partnerNameOf = (id: string | null) => (id ? partnerName.get(id) ?? "Partner" : null);

  const entries = t.entries ?? [];
  const split = partnerSplit(entries, now);
  const bars = weekBars(entries, weekStart(), t.today, now);
  const recent = recentWork(entries);
  const timeline = todayTimeline(entries, t.today, now);

  /* The agent's own schedule; the same numbers a manager's attendance view
     derives, said to the person themselves while they can still act on them. */
  const mySchedule = (schedules.data ?? [])[0];
  const overBreakSec = mySchedule ? Math.max(0, live.breakSeconds - mySchedule.breakMinutes * 60) : 0;
  const overLunchSec = mySchedule ? Math.max(0, live.lunchSeconds - mySchedule.lunchMinutes * 60) : 0;


  /* Seconds, said in words. Dee, 2026-09-18: "387m late … i want it converted
     easy to human to understand" — a number somebody has to divide by 60 in
     their head is a number they will misread. */
  const lateSec = mySchedule ? lateSecondsToday(entries, mySchedule, t.today, now) : 0;

  /* Today's own punches, oldest first — the phone summary reads the first in
     and the last out off them rather than asking a second question. */
  const todayEntries = entries
    .filter((e) => e.workDate === t.today)
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  /* The same exceptions the banner shows, in the same words. */
  const todayExceptions = [
    lateSec > 0 && mySchedule
      ? `${humanDuration(lateSec)} late — your shift starts at ${mySchedule.shiftStart.slice(0, 5)} (${mySchedule.timezone}).`
      : null,
    overBreakSec > 0 && mySchedule
      ? `Over break by ${humanDuration(overBreakSec)} — ${humanDuration(mySchedule.breakMinutes * 60)} of break is paid.`
      : null,
    overLunchSec > 0 && mySchedule
      ? `Over lunch by ${humanDuration(overLunchSec)} — the allowance is ${humanDuration(mySchedule.lunchMinutes * 60)}.`
      : null,
  ].filter((x): x is string => !!x);
  /* A timer left running overnight quietly corrupts production and End of Day,
     so it is said out loud. Stopping it stays the person's own act. */
  const stale = isStaleTimer(t.openEntry);

  const cannotStart = t.isMutating || !t.entries || t.source === "demo";
  const start = (r: StartRequest) => t.clockIn(r.divisionId, r.taskNote, r.partnerGroupId);

  return (
    <>
      {/* The week, and the week's total. The module shell owns the page
          heading now, so this sits at the top of the section instead of in
          the shell's actions slot. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {/* Present and honest: `useTimesheet` loads THIS week only, so
              stepping away would show an empty week and look broken. Disabled
              with the reason in the tooltip rather than wired to nothing. */}
          <button type="button" disabled aria-label="Previous week"
            title="My Time shows the current week. Earlier weeks are in Team Management."
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {weekRangeLabel(weekStart())}
          </span>
          <button type="button" disabled aria-label="Next week" title="This is the current week."
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">This week</p>
          <p className="text-lg font-extrabold tabular-nums leading-tight text-foreground">
            {formatDuration(t.weekMinutes)}
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <DataSourceBadge source={t.source} />
        {t.source === "demo" && (
          <span className="text-xs text-muted-foreground">Sign in to track real time.</span>
        )}
      </div>

      {t.error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-status-danger-tint px-3.5 py-2 text-xs font-semibold text-status-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t.error}
        </div>
      )}

      {/* On a phone the day has to be one glance, not four cards, a timer and
          a timeline read in sequence (Dee, 2026-09-21). Same figures. */}
      <div className="mb-4 md:hidden">
        <TodayAtAGlance
          glance={{
            firstIn: todayEntries[0]?.startedAt ?? null,
            lastOut: t.openEntry ? null : (todayEntries.at(-1)?.endedAt ?? null),
            workSeconds: live.workSeconds,
            breakSeconds: live.breakSeconds,
            lunchSeconds: live.lunchSeconds,
            state: !t.openEntry ? "out" : t.openEntry.kind === "break" ? "break" : t.openEntry.kind === "lunch" ? "lunch" : "working",
            exceptions: todayExceptions,
          }}
          timeZone={mySchedule?.timezone}
        />
      </div>

      {/* Today · This week · for a partner · for BES itself. The last two add
          up to the second: every worked minute is one or the other. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Today" value={live.workSeconds > 0 ? formatClock(live.workSeconds) : "—"} icon={Clock} />
        <StatCard label="This week" value={formatDuration(t.weekMinutes)} icon={CalendarDays} />
        <StatCard label="Partner work" value={formatDuration(split.partnerMinutes)} icon={Users} />
        <StatCard label="Internal work" value={formatDuration(split.internalMinutes)} icon={Home} />
      </div>

      {/* Dee, 2026-09-18: "I like the previous layout, quick timer on the
          right and the history at the bottom." So: what is running fills the
          row, what to start next sits beside it, and the record of the day
          goes below — read far less often than either. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {t.openEntry ? (
          <TimerCard
            entry={t.openEntry}
            now={now}
            partnerName={partnerNameOf(t.openEntry.partnerGroupId ?? null)}
            busy={t.isMutating}
            onStop={t.clockOut}
            onBreak={() => t.startBreak("break")}
            onLunch={() => t.startBreak("lunch")}
            onResume={t.resumeWork}
          />
        ) : (
          <div className="flex flex-col items-start justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-8">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ready</span>
            <p className="mt-1 font-mono text-4xl font-extrabold tabular-nums text-muted-foreground">00:00:00</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No timer running. Pick something on the right to start one.
            </p>
          </div>
        )}

        <StartWorkCard
          recent={recent}
          partners={myPartners}
          partnerNameOf={partnerNameOf}
          disabled={cannotStart}
          busy={t.isMutating}
          onStart={start}
        />
      </div>

      {stale && t.openEntry && (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />
          <p className="min-w-0 flex-1">
            This timer has been running for {describeRunningFor(t.openEntry)} — longer than the
            {" "}{STALE_TIMER_HOURS}-hour cap. Clocking out records AT MOST {STALE_TIMER_HOURS} hours
            (the system also stops forgotten timers on its own and tells you and your lead). If the
            real time differs, request an adjustment on the entry below — your lead approves it.
          </p>
          <button type="button" onClick={t.clockOut} disabled={t.isMutating}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Clock out
          </button>
        </div>
      )}

      {mySchedule && (lateSec > 0 || overBreakSec > 0 || overLunchSec > 0) && (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />
          {lateSec > 0 && (
            <span><strong>{humanDuration(lateSec)} late</strong> today — your shift starts at {mySchedule.shiftStart.slice(0, 5)} ({mySchedule.timezone}) with {humanDuration(mySchedule.graceMinutes * 60)} of grace.</span>
          )}
          {overBreakSec > 0 && (
            <span><strong>Over break by {humanDuration(overBreakSec)}</strong> — {humanDuration(mySchedule.breakMinutes * 60)} of break is paid; over-break is not.</span>
          )}
          {overLunchSec > 0 && (
            <span><strong>Over lunch by {humanDuration(overLunchSec)}</strong> — the lunch allowance is {humanDuration(mySchedule.lunchMinutes * 60)}.</span>
          )}
        </div>
      )}

      {t.actionError && (
        <p className="mt-2 text-xs font-semibold text-status-danger">{t.actionError}</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ContentCard
          title={
            <span className="flex w-full items-center justify-between gap-3">
              <span>Today</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                Total {live.workSeconds > 0 ? formatClock(live.workSeconds) : "—"}
              </span>
            </span>
          }
        >
          {t.isLoading ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Loading…</p>
          ) : (
            <TodayTimeline
              rows={timeline}
              partnerNameOf={partnerNameOf}
              action={({ entry, running: isRunning }) =>
                isRunning || entry.kind !== "work"
                  ? null
                  : <AdjustmentCell entry={entry} mine={myAdjustments.data ?? []} />}
            />
          )}
        </ContentCard>

        <div className="space-y-4">
          <ContentCard
            title={
              <span className="flex w-full items-center justify-between gap-3">
                <span>This week</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {formatDuration(t.weekMinutes)}
                </span>
              </span>
            }
          >
            <WeekChart bars={bars} today={t.today} />
          </ContentCard>

          <TimeOffCard />
        </div>
      </div>

    </>
  );
};

/**
 * Time off, as a summary rather than a form.
 *
 * Dee's mockup, 2026-09-18: a small card — "2 upcoming · 1 pending" — with the
 * next few requests and a button. The form itself moved into a dialog, because
 * a six-control form sitting permanently open on a page about the CLOCK is a
 * form nobody reads and a page nobody can scan.
 *
 * Submitting notifies the team's leads; a lead or manager decides (never their
 * own) and the decision lands back here with who made it and why.
 */
const TimeOffCard = () => {
  const types = useLeaveTypes();
  const mine = useMyLeave();
  const actions = useLeaveActions();
  const rewards = useMyRewards();
  const [asking, setAsking] = useState(false);
  const wallet = useMemo(
    () => rewardWallet(rewards.data ?? [], { today: businessToday() }),
    [rewards.data],
  );

  const STATUS_TONE: Record<string, string> = {
    pending: "border-amber-500/40 bg-amber-500/10 text-amber-800",
    approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
    declined: "border-destructive/30 bg-status-danger-tint text-status-danger",
    cancelled: "border-border bg-muted text-muted-foreground",
  };

  const all = mine.data ?? [];
  const today = businessToday();
  const pending = all.filter((r) => r.status === "pending").length;
  /* "Upcoming" is approved leave still ahead of them — what they are counting
     down to, not everything ever requested. */
  const upcoming = all.filter((r) => r.status === "approved" && r.endsOn >= today).length;
  /* Newest first, and only a few: the card is a summary. */
  const shown = [...all].sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1)).slice(0, 3);

  return (
    <ContentCard
      title={
        <span className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden /> Time off
          </span>
          <button type="button" onClick={() => setAsking(true)}
            className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Request time off
          </button>
        </span>
      }
    >
      <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">
        {upcoming > 0 || pending > 0
          ? [upcoming > 0 ? `${upcoming} upcoming` : null, pending > 0 ? `${pending} pending` : null]
              .filter(Boolean).join(" · ")
          : "Nothing booked."}
      </p>

      {shown.length > 0 && (
        <ul className="divide-y divide-border/50">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{r.typeLabel}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
                  {" · "}
                  {businessDaysBetween(r.startsOn, r.endsOn)} working day{businessDaysBetween(r.startsOn, r.endsOn) === 1 ? "" : "s"}
                </span>
                {r.decidedByName && (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    by {r.decidedByName}{r.decisionNote ? ` — "${r.decisionNote}"` : ""}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[r.status]}`}>
                  {r.status}
                </span>
                {r.status === "pending" && (
                  <button type="button" onClick={() => actions.cancel.mutate(r.id)}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Withdraw
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {asking && (
        <RequestTimeOffDialog
          /* EVERY type, from every door. This card used to offer unpaid types
             only, on the reasoning that spending a reward needed the wallet
             kept on Time Off — and from where Dee stood, Birthday Reward Day
             simply did not exist (2026-09-19: "Why I dont see the birthday
             leave…"). A type a person holds no credit for is listed and
             explained as unavailable, never hidden: hidden reads as missing. */
          types={(types.data ?? []).map((t) => ({
            id: t.id, label: t.label, paid: t.paid, minNoticeDays: t.minNoticeDays,
            compensation: t.compensation, rewardKind: t.rewardKind,
            rewardDaysAvailable: t.rewardKind === "birthday" ? wallet.birthdayDays
              : t.rewardKind === "attendance" ? wallet.attendanceDays : undefined,
          }))}
          busy={actions.submit.isPending}
          error={(actions.submit.error as Error | null)?.message ?? null}
          onClose={() => setAsking(false)}
          onSubmit={(v) => actions.submit.mutate(v, { onSuccess: () => setAsking(false) })}
        />
      )}
    </ContentCard>
  );
};


/**
 * "This recorded time is wrong" — said to a lead, never fixed by hand.
 *
 * One open request per entry (the database enforces it); while one is
 * pending the cell shows that instead of a second button, and a decision
 * shows as what it was.
 */
const AdjustmentCell = ({
  entry,
  mine,
}: {
  entry: TimeEntry;
  mine: TimeAdjustmentRequest[];
}) => {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const request = useRequestTimeAdjustment();
  const existing = mine.find((r) => r.entryId === entry.id);

  if (existing?.status === "pending") {
    return <span className="text-[11px] font-medium text-status-warning">Adjustment pending</span>;
  }

  const submit = () => {
    const stamp = new Date(when);
    if (!when || Number.isNaN(stamp.getTime())) return;
    request.mutate(
      { entryId: entry.id, endedAt: stamp.toISOString(), reason: reason.trim() },
      { onSuccess: () => { setOpen(false); setWhen(""); setReason(""); } },
    );
  };

  return (
    <span className="relative inline-block">
      {existing && (
        <span className={`mr-1.5 text-[10px] font-medium ${existing.status === "approved" ? "text-status-success" : "text-muted-foreground"}`}>
          {existing.status === "approved" ? "adjusted" : "declined"}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Request adjustment
      </button>
      {open && (
        <span className="absolute right-0 z-20 mt-1 block w-72 rounded-xl border border-border bg-card p-3 text-left shadow-lg">
          <span className="block text-[11px] font-semibold text-foreground">
            When did this really end?
          </span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why the recorded time is wrong (required)."
            className="mt-1.5 block w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {request.error && (
            <span className="mt-1 block text-[10px] font-semibold text-status-danger">
              {(request.error as Error).message}
            </span>
          )}
          <span className="mt-2 flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={request.isPending || reason.trim().length < 5 || !when}
              className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              Send to my lead
            </button>
          </span>
        </span>
      )}
    </span>
  );
};
