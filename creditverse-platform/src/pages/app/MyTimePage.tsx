/**
 * My Time — clock in/out and the current week's timesheet.
 *
 * Renders only. Every figure comes from `useTimesheet`, which sums through the
 * `time-domain` rules; nothing here computes elapsed time (rules 5 and 9).
 *
 * Extracted from HqPages when it was wired to real data: that file already held
 * six unrelated pages, and adding data loading to one of them would have made a
 * 520-line module worse (rule 13).
 */
import { useState } from "react";
import { CalendarOff, Coffee, Clock, PlayCircle, PauseCircle, AlertTriangle, Receipt, UtensilsCrossed } from "lucide-react";
import {
  ContentCard,
  DivisionTable,
  StatCard,
} from "@/components/dashboard/DivisionLayout";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { OpsSelect } from "@/components/ui/ops-select";
import { HqPageShell } from "@/pages/app/HqPages";
import { useTimesheet } from "@/lib/data/use-time";
import { useMyTimeAdjustments, useRequestTimeAdjustment } from "@/lib/data/use-time-adjustments";
import { useLeaveActions, useLeaveTypes, useMyLeave, useMyPayslips } from "@/lib/data/use-people";
import { formatDate } from "@/lib/format-date";
import type { TimeAdjustmentRequest, TimeEntry } from "@/lib/data/time-entries";
import { STALE_TIMER_HOURS, describeRunningFor, isStaleTimer } from "@/lib/time-domain";
import {
  DIVISION_LABELS,
  divisionLabel,
  entryMinutes,
  formatDuration,
} from "@/lib/time-domain";

const DIVISION_OPTIONS = Object.entries(DIVISION_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

export const MyTimePage = () => {
  const t = useTimesheet();
  const myAdjustments = useMyTimeAdjustments();
  const [division, setDivision] = useState("creditops");
  const [taskNote, setTaskNote] = useState("");

  const running = Boolean(t.openEntry);
  /* A timer left running overnight quietly corrupts production and End of Day,
     so it is said out loud. Stopping it stays the person's own act. */
  const stale = isStaleTimer(t.openEntry);

  // Only the two busiest divisions get a card; the rest are in the table. Four
  // fixed division cards would show three zeroes for most people.
  const topDivisions = t.byDivision.slice(0, 2);

  return (
    <HqPageShell
      title="My Time"
      description="Track your hours across divisions and tasks"
      icon={Clock}
    >
      <div className="mb-4 flex items-center gap-2">
        <DataSourceBadge source={t.source} />
        {t.source === "demo" && (
          <span className="text-xs text-muted-foreground">
            Sign in to track real time.
          </span>
        )}
      </div>

      {t.error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Today"
          value={formatDuration(t.todayMinutes)}
          icon={Clock}
        />
        <StatCard
          label="This Week"
          value={formatDuration(t.weekMinutes)}
          icon={Clock}
        />
        {topDivisions.map((d) => (
          <StatCard
            key={d.divisionId}
            label={divisionLabel(d.divisionId)}
            value={formatDuration(d.minutes)}
            icon={Clock}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {running && t.openEntry?.kind !== "work" ? (
          <>
            <button
              onClick={() => t.resumeWork()}
              disabled={t.isMutating}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlayCircle className="h-4 w-4" /> Back to work
            </button>
            <button
              onClick={() => t.clockOut()}
              disabled={t.isMutating}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PauseCircle className="h-4 w-4" /> Clock Out
            </button>
          </>
        ) : running ? (
          <>
            <button
              onClick={() => t.clockOut()}
              disabled={t.isMutating}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PauseCircle className="h-4 w-4" /> Clock Out
            </button>
            <button
              onClick={() => t.startBreak("break")}
              disabled={t.isMutating}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Coffee className="h-4 w-4" /> Break
            </button>
            <button
              onClick={() => t.startBreak("lunch")}
              disabled={t.isMutating}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UtensilsCrossed className="h-4 w-4" /> Lunch
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => t.clockIn(division, taskNote || undefined)}
              disabled={t.isMutating || !t.entries || t.source === "demo"}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlayCircle className="h-4 w-4" /> Clock In
            </button>
            <OpsSelect
              value={division}
              onValueChange={setDivision}
              options={DIVISION_OPTIONS}
              aria-label="Division"
            />
            <input
              value={taskNote}
              onChange={(e) => setTaskNote(e.target.value)}
              placeholder="What are you working on? (optional)"
              className="min-w-[240px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </>
        )}
        {running && t.openEntry && (
          <span className="text-xs text-muted-foreground">
            {t.openEntry.kind === "work"
              ? `Running since ${clockTime(t.openEntry.startedAt)} · ${divisionLabel(t.openEntry.divisionId)}${t.openEntry.taskNote ? ` · ${t.openEntry.taskNote}` : ""}`
              : `On ${t.openEntry.kind} since ${clockTime(t.openEntry.startedAt)} — the clock counts it as rest`}
          </span>
        )}
        {t.todayRestMinutes > 0 && (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Rest today: {formatDuration(t.todayRestMinutes)}
          </span>
        )}
      </div>

      {stale && t.openEntry && (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />
          <p className="min-w-0 flex-1">
            This timer has been running for {describeRunningFor(t.openEntry)} — longer than the
            {" "}{STALE_TIMER_HOURS}-hour cap. Clocking out records AT MOST {STALE_TIMER_HOURS} hours
            (the system also stops forgotten timers on its own and tells you and your lead). If the
            real time differs, request an adjustment on the entry below — your lead approves it.
          </p>
          <button
            type="button"
            onClick={t.clockOut}
            disabled={t.isMutating}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clock out
          </button>
        </div>
      )}

      {t.actionError && (
        <p className="mt-2 text-xs font-semibold text-status-danger">
          {t.actionError}
        </p>
      )}

      <ContentCard title="This Week's Time Entries">
        {t.isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : t.entries.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-muted-foreground">
            {t.source === "demo"
              ? "No sample entries — sign in to track time."
              : "No time recorded this week yet."}
          </p>
        ) : (
          <DivisionTable
            columns={["Date", "Started", "Division", "Task", "Duration", ""]}
            rows={t.entries.map((e) => [
              e.workDate,
              clockTime(e.startedAt),
              e.kind === "work" ? divisionLabel(e.divisionId) : (
                <span key="k" className="inline-flex items-center gap-1 text-muted-foreground">
                  {e.kind === "lunch" ? <UtensilsCrossed className="h-3 w-3" /> : <Coffee className="h-3 w-3" />}
                  {e.kind === "lunch" ? "Lunch" : "Break"}
                </span>
              ),
              e.taskNote ?? "—",
              e.endedAt ? (
                <span key="d" className="inline-flex items-center gap-1.5">
                  {formatDuration(e.durationMinutes)}
                  {/* The system stopped this one at the cap — the agent may
                      not have been working the whole span, and the row says
                      so instead of passing the cap off as a shift. */}
                  {e.autoStopped && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-warning">
                      auto-stopped
                    </span>
                  )}
                </span>
              ) : (
                `${formatDuration(entryMinutes(e))} (running)`
              ),
              e.endedAt ? (
                <AdjustmentCell key="a" entry={e} mine={myAdjustments.data ?? []} />
              ) : (
                ""
              ),
            ])}
          />
        )}
      </ContentCard>

      <TimeOffCard />
      <MyPayslipsCard />
    </HqPageShell>
  );
};

/**
 * Requesting time off, and where past requests stand. Submitting notifies the
 * team's leads; a lead or manager decides (never their own) and the decision
 * lands back here with who made it and why.
 */
const TimeOffCard = () => {
  const types = useLeaveTypes();
  const mine = useMyLeave();
  const actions = useLeaveActions();
  const [typeId, setTypeId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");

  const chosenType = typeId || (types.data?.[0]?.id ?? "");
  const canSubmit = Boolean(chosenType && startsOn && endsOn && endsOn >= startsOn);
  const STATUS_TONE: Record<string, string> = {
    pending: "border-amber-500/40 bg-amber-500/10 text-amber-800",
    approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
    declined: "border-red-500/30 bg-red-500/10 text-red-700",
    cancelled: "border-border bg-muted text-muted-foreground",
  };

  return (
    <ContentCard title={<span className="flex items-center gap-2"><CalendarOff className="h-4 w-4 text-muted-foreground" /> Time off</span>}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Type
          <select value={chosenType} onChange={(e) => setTypeId(e.target.value)}
            className="mt-0.5 block rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground">
            {(types.data ?? []).map((ty) => (
              <option key={ty.id} value={ty.id}>{ty.label}{ty.paid ? "" : " (unpaid)"}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)}
            className="mt-0.5 block rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)}
            className="mt-0.5 block rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
        </label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)"
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground" />
        <button type="button" disabled={!canSubmit || actions.submit.isPending}
          onClick={() => actions.submit.mutate(
            { typeId: chosenType, startsOn, endsOn, reason: reason || undefined },
            { onSuccess: () => { setStartsOn(""); setEndsOn(""); setReason(""); } },
          )}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
          Request
        </button>
      </div>
      {actions.submit.error && (
        <p className="mt-2 text-xs font-semibold text-status-danger">{(actions.submit.error as Error).message}</p>
      )}
      {(mine.data ?? []).length > 0 && (
        <ul className="mt-3 divide-y divide-border/50">
          {(mine.data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="text-foreground">
                {r.typeLabel} · {formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
                {r.reason ? <span className="text-muted-foreground"> · {r.reason}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                {r.decidedByName && (
                  <span className="text-[10px] text-muted-foreground">
                    by {r.decidedByName}{r.decisionNote ? ` — "${r.decisionNote}"` : ""}
                  </span>
                )}
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[r.status]}`}>
                  {r.status}
                </span>
                {r.status === "pending" && (
                  <button type="button" onClick={() => actions.cancel.mutate(r.id)}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:underline">
                    Withdraw
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ContentCard>
  );
};

/** The agent's own payslips — computed, never typed (0252). */
const MyPayslipsCard = () => {
  const slips = useMyPayslips();
  if ((slips.data ?? []).length === 0) return null;
  const money = (cents: number, currency: string) =>
    `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currency}`;
  return (
    <ContentCard title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-muted-foreground" /> My payslips</span>}>
      <ul className="divide-y divide-border/50">
        {(slips.data ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
            <span className="text-foreground">
              {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
              <span className="text-muted-foreground">
                {" "}· {formatDuration(s.workMinutes)} worked
                {s.paidLeaveMinutes > 0 ? ` + ${formatDuration(s.paidLeaveMinutes)} paid leave` : ""}
                {s.adjustmentCents !== 0 ? ` · adj ${money(s.adjustmentCents, s.currency)}${s.adjustmentNote ? ` (${s.adjustmentNote})` : ""}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{money(s.grossCents, s.currency)}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.released ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-border bg-muted text-muted-foreground"}`}>
                {s.released ? "released" : "draft"}
              </span>
            </span>
          </li>
        ))}
      </ul>
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
