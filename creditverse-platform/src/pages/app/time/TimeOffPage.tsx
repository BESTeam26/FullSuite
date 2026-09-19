/**
 * Time Off — request it, track it, and see what is left.
 *
 * Dee's mockup, 2026-09-19. Five tabs, four figures, a calendar, balances and
 * the policy said in plain words.
 *
 * ── THE FOUR VIEWS (CLAUDE.md §20b) ───────────────────────────────────────
 *
 * This page is deliberately the SAME for all four. An agent, a team lead, a
 * division manager and an executive each see their OWN leave here and nobody
 * else's — `fetchMyLeave` takes the caller's id and RLS refuses the rest.
 * Managing other people's leave is Team Management, which is where the
 * audiences diverge. Said once here so the next reader knows it was
 * considered rather than missed.
 *
 * Every figure is derived: the entitlement is on the leave type, everything
 * else is arithmetic over the requests (see `lib/leave/leave-balances.ts`).
 * No running balance is stored, so nothing can drift from the requests it
 * describes.
 */
import { useMemo, useState } from "react";
import {
  ArrowRight, CalendarDays, CalendarOff, CheckCircle2, Clock3,
  FileText, Gift, Info, ListChecks, Trophy, Wallet,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeaveActions, useLeaveTypes, useMyLeave } from "@/lib/data/use-people";
import { RequestTimeOffDialog } from "@/components/time/RequestTimeOffDialog";
import { LeaveCalendar } from "@/components/leave/LeaveCalendar";
import { RewardWalletPanel } from "@/components/leave/RewardWalletPanel";
import { BirthdayRewardChoice } from "@/components/leave/BirthdayRewardChoice";
import { rewardWallet } from "@/lib/leave/reward-wallet";
import { useElectBirthday, useMyRewards } from "@/lib/leave/use-rewards";
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

const Figure = ({ icon: Icon, label, value, note, tone }: {
  icon: typeof Gift; label: string; value: string; note: string; tone: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-start gap-3">
      <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
        <p className="text-xl font-extrabold tabular-nums leading-tight text-foreground">{value}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>
      </div>
    </div>
  </div>
);

function RequestRow({ r, onWithdraw }: { r: LeaveRequest; onWithdraw?: () => void }) {
  const days = businessDaysBetween(r.startsOn, r.endsOn);
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5">
      <span className="flex min-w-0 items-start gap-2.5">
        <span aria-hidden className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          r.status === "declined" ? "bg-status-danger-tint text-status-danger" : "bg-emerald-500/10 text-emerald-700")}>
          <CalendarDays className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-foreground">
            {formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {r.typeLabel} · {days} working day{days === 1 ? "" : "s"}
          </span>
          {r.reason && <span className="block truncate text-[11px] text-muted-foreground">Reason: {r.reason}</span>}
          {r.coverageNote && <span className="block truncate text-[11px] text-muted-foreground">Coverage: {r.coverageNote}</span>}
          {r.decidedByName && (
            <span className="block truncate text-[11px] text-muted-foreground">
              {r.status} by {r.decidedByName}{r.decisionNote ? ` — "${r.decisionNote}"` : ""}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Requested {formatDate(r.createdAt)}</span>
        {/* Dee, 2026-09-19: "Approval Status and Compensation Status must be
            separate." Two chips, always — "Approved · Unpaid" is the normal
            case at BES, not a contradiction. */}
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", TONE[r.status])}>
          {r.status}
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold",
          r.compensation === "reward"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
            : "border-border bg-muted text-muted-foreground")}>
          {r.compensation === "reward" ? "Paid reward" : "Unpaid"}
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

export function TimeOffPage() {
  const mine = useMyLeave();
  const types = useLeaveTypes();
  const actions = useLeaveActions();
  const [asking, setAsking] = useState(false);
  const [tab, setTab] = useState("overview");
  const today = businessToday();

  const rewards = useMyRewards();
  const elect = useElectBirthday();

  const all = useMemo(() => mine.data ?? [], [mine.data]);
  /*
   * No leave balance is computed anywhere on this page. Dee, 2026-09-19: BES
   * runs no PTO bank — ordinary time off is unpaid and its only limit is
   * whether the dates work operationally. What IS counted is earned paid time,
   * and that is a ledger of credits rather than a number.
   */
  const wallet = useMemo(
    () => rewardWallet(rewards.data ?? [], { today }),
    [rewards.data, today],
  );

  const upcoming = all.filter((r) => r.status === "approved" && r.endsOn >= today)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  const pending = all.filter((r) => r.status === "pending")
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  const history = all.filter((r) => !upcoming.includes(r) && !pending.includes(r));
  const recent = [...all].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const upcomingDays = upcoming.reduce((n, r) => n + businessDaysBetween(r.startsOn, r.endsOn), 0);

  /* The policy, read from the leave TYPES rather than typed here — the notice
     rule is configurable and this must not drift from it. */
  const notice = Math.max(0, ...(types.data ?? []).map((t) => t.minNoticeDays));
  const sameDay = (types.data ?? []).filter((t) => t.minNoticeDays === 0).map((t) => t.label);

  const POLICY = [
    { icon: Clock3, title: "Request in advance",
      detail: `Submit at least ${notice} days before your leave starts. The form will not let you pick an earlier date.` },
    { icon: CheckCircle2, title: "A lead decides",
      detail: "Every request goes to a lead of your team, or to management. You are notified either way." },
    { icon: Wallet, title: "Approved does not mean paid",
      detail: "Time off is unpaid unless it uses an earned reward. Approval is permission to be away; payment is separate." },
    { icon: Info, title: "Leave nobody can plan",
      detail: sameDay.length > 0
        ? `${sameDay.join(", ")} carry no notice period and can be filed the same day.`
        : "Every leave type currently carries a notice period." },
  ];

  const request = (
    <button type="button" onClick={() => setAsking(true)}
      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <CalendarOff className="h-4 w-4" aria-hidden /> Request time off
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="h-8 flex-wrap bg-muted/60">
            <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
            <TabsTrigger value="requests" className="text-[11px]">My requests</TabsTrigger>
            <TabsTrigger value="calendar" className="text-[11px]">Calendar</TabsTrigger>
            <TabsTrigger value="balances" className="text-[11px]">Rewards</TabsTrigger>
            <TabsTrigger value="policy" className="text-[11px]">Policy &amp; guidelines</TabsTrigger>
          </TabsList>
        </Tabs>
        {request}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure icon={Gift} label="Birthday Reward" tone="bg-amber-500/10 text-amber-700"
          value={wallet.birthdayDays > 0 ? `${wallet.birthdayDays} paid day` : "None right now"}
          note={wallet.birthday
            ? `Valid until ${formatDate(wallet.birthday.expiresOn)}`
            : "Granted automatically in your birthday month"} />
        <Figure icon={Trophy} label="Reward Days" tone="bg-emerald-500/10 text-emerald-700"
          value={`${wallet.attendanceDays} paid ${wallet.attendanceDays === 1 ? "day" : "days"}`}
          note={wallet.attendanceDays > 0 ? "Earned through attendance" : "Earned by a 20/20 quarter"} />
        <Figure icon={CalendarDays} label="Upcoming time off" tone="bg-purple-500/10 text-purple-700"
          value={upcomingDays > 0 ? `${upcomingDays} days` : "Nothing booked"}
          note={upcoming.length > 0
            ? `${formatDate(upcoming[0].startsOn)} · approved`
            : "Request it when you need it"} />
        <Figure icon={Clock3} label="Pending requests" tone="bg-blue-500/10 text-blue-700"
          value={`${pending.length} request${pending.length === 1 ? "" : "s"}`}
          note={pending.length > 0 ? "Awaiting your lead" : "Nothing waiting"} />
      </div>

      {wallet.birthday && (
        <BirthdayRewardChoice
          credit={wallet.birthday}
          busy={elect.isPending}
          error={(elect.error as Error | null)?.message ?? null}
          onElect={(election) => elect.mutate({ creditId: wallet.birthday!.id, election })}
          onRequestDay={() => setAsking(true)}
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="overview" className="mt-0 space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <LeaveCalendar requests={all} today={today} />
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">Recent requests</h2>
                <button type="button" onClick={() => setTab("requests")}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-success underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  View all <ArrowRight className="h-3 w-3" aria-hidden />
                </button>
              </div>
              {recent.length === 0
                ? <p className="py-6 text-center text-xs text-muted-foreground">Nothing requested yet.</p>
                : <ul className="divide-y divide-border/60">{recent.map((r) => <RequestRow key={r.id} r={r} />)}</ul>}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <RewardWalletPanel wallet={wallet} today={today} />
            <PolicyCard items={POLICY} onOpen={() => setTab("policy")} />
          </div>
        </TabsContent>

        <TabsContent value="requests" className="mt-0 space-y-3">
          <Section icon={CalendarOff} title="Upcoming" empty="Nothing booked."
            rows={upcoming.map((r) => <RequestRow key={r.id} r={r} />)} />
          <Section icon={Clock3} title="Waiting on a decision" empty="Nothing waiting."
            rows={pending.map((r) => (
              <RequestRow key={r.id} r={r} onWithdraw={() => actions.cancel.mutate(r.id)} />
            ))} />
          <Section icon={ListChecks} title="History" empty="Nothing yet."
            rows={history.map((r) => <RequestRow key={r.id} r={r} />)} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <LeaveCalendar requests={all} today={today} />
        </TabsContent>

        <TabsContent value="balances" className="mt-0 grid gap-3 lg:grid-cols-2">
          <RewardWalletPanel wallet={wallet} today={today} />
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">How paid time works at BES</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              BES does not keep a paid vacation balance. Ordinary time off is
              {" "}<strong className="text-foreground">unpaid</strong>, and the only question is
              whether the dates work operationally — your lead decides that.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Paid time is <strong className="text-foreground">earned</strong>. Every eligible
              person gets one Birthday Reward a year, usable in their birthday month, and a
              perfect 20/20 attendance quarter earns a paid Reward Day. Each credit is tracked
              on its own with its own expiry — Reward Days do not roll over and have no cash
              value.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              A Birthday Reward is <strong className="text-foreground">one reward, one
              benefit</strong>: take the paid day, or work an eligible shift for 2× — never
              both. What you are paid is recorded by Finance, not on this page.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="policy" className="mt-0 grid gap-3 lg:grid-cols-2">
          <PolicyCard items={POLICY} />
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Notice by leave type</h2>
            <ul className="mt-2 divide-y divide-border/60">
              {(types.data ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {t.label}{!t.paid && <span className="ml-1 text-[11px] text-muted-foreground">(unpaid)</span>}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.paid ? "Paid only if covered by a reward" : "Unpaid"}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    t.minNoticeDays === 0
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
                      : "border-border bg-muted text-muted-foreground")}>
                    {t.minNoticeDays === 0 ? "Same day" : `${t.minNoticeDays} days' notice`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      {asking && (
        <RequestTimeOffDialog
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
    </div>
  );
}

const Section = ({ icon: Icon, title, empty, rows }: {
  icon: typeof CalendarOff; title: string; empty: string; rows: React.ReactNode[];
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {title}
    </h2>
    {rows.length === 0
      ? <p className="py-4 text-xs text-muted-foreground">{empty}</p>
      : <ul className="mt-1 divide-y divide-border/60">{rows}</ul>}
  </div>
);

const PolicyCard = ({ items, onOpen }: {
  items: { icon: typeof Clock3; title: string; detail: string }[];
  onOpen?: () => void;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden /> Policy highlights
      </h2>
      {onOpen && (
        <button type="button" onClick={onOpen}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-success underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Full policy <ArrowRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
    <ul className="space-y-2.5">
      {items.map((p) => (
        <li key={p.title} className="flex items-start gap-2.5">
          <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700">
            <p.icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-foreground">{p.title}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{p.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  </div>
);
