/**
 * Your leave: what is coming, what is waiting, and what has happened.
 *
 * Dee, 2026-09-18: "Upcoming, Pending, History, Request Time Off. Request form
 * opens in drawer/modal. Do not put the entire form permanently on the page."
 */
import { useState } from "react";
import { CalendarOff, Clock3, History } from "lucide-react";
import { useLeaveActions, useLeaveTypes, useMyLeave } from "@/lib/data/use-people";
import { RequestTimeOffDialog } from "@/components/time/RequestTimeOffDialog";
import { businessDaysBetween, businessToday } from "@/lib/calendar/us-federal-holidays";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "@/lib/data/people-management";

const TONE: Record<string, string> = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  declined: "border-destructive/30 bg-status-danger-tint text-status-danger",
  cancelled: "border-border bg-muted text-muted-foreground",
};

function Row({ r, onWithdraw }: { r: LeaveRequest; onWithdraw?: () => void }) {
  const days = businessDaysBetween(r.startsOn, r.endsOn);
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{r.typeLabel}</span>
        <span className="block text-[11px] text-muted-foreground">
          {formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
          {" · "}{days} working day{days === 1 ? "" : "s"}
        </span>
        {r.reason && <span className="block text-[11px] text-muted-foreground">Reason: {r.reason}</span>}
        {r.coverageNote && <span className="block text-[11px] text-muted-foreground">Coverage: {r.coverageNote}</span>}
        {r.decidedByName && (
          <span className="block text-[11px] text-muted-foreground">
            {r.status} by {r.decidedByName}{r.decisionNote ? ` — "${r.decisionNote}"` : ""}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", TONE[r.status])}>
          {r.status}
        </span>
        {onWithdraw && (
          <button type="button" onClick={onWithdraw}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Withdraw
          </button>
        )}
      </span>
    </li>
  );
}

const Section = ({ icon: Icon, title, empty, children }: {
  icon: typeof CalendarOff; title: string; empty: string; children: React.ReactNode[];
}) => (
  <div className="rounded-2xl border border-border bg-card p-5">
    <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {title}
    </h2>
    {children.length === 0
      ? <p className="py-4 text-xs text-muted-foreground">{empty}</p>
      : <ul className="mt-1 divide-y divide-border/60">{children}</ul>}
  </div>
);

export function TimeOffPage() {
  const mine = useMyLeave();
  const types = useLeaveTypes();
  const actions = useLeaveActions();
  const [asking, setAsking] = useState(false);
  const today = businessToday();

  const all = mine.data ?? [];
  const upcoming = all.filter((r) => r.status === "approved" && r.endsOn >= today)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  const pending = all.filter((r) => r.status === "pending")
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  const history = all.filter((r) => !upcoming.includes(r) && !pending.includes(r))
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setAsking(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CalendarOff className="h-4 w-4" aria-hidden /> Request time off
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section icon={CalendarOff} title="Upcoming" empty="Nothing booked.">
            {upcoming.map((r) => <Row key={r.id} r={r} />)}
          </Section>
          <Section icon={Clock3} title="Waiting on a decision" empty="Nothing waiting.">
            {pending.map((r) => (
              <Row key={r.id} r={r} onWithdraw={() => actions.cancel.mutate(r.id)} />
            ))}
          </Section>
        </div>
        <Section icon={History} title="History" empty="Nothing yet.">
          {history.map((r) => <Row key={r.id} r={r} />)}
        </Section>
      </div>

      {asking && (
        <RequestTimeOffDialog
          types={(types.data ?? []).map((t) => ({
            id: t.id, label: t.label, paid: t.paid, minNoticeDays: t.minNoticeDays,
          }))}
          busy={actions.submit.isPending}
          error={(actions.submit.error as Error | null)?.message ?? null}
          onClose={() => setAsking(false)}
          onSubmit={(v) => actions.submit.mutate(v, { onSuccess: () => setAsking(false) })}
        />
      )}
    </>
  );
}
