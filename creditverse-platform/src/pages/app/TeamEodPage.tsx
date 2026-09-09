/**
 * Team EOD — one day, everybody.
 *
 * Shows who submitted, who did not, and who was auto-submitted at the cutoff,
 * kept apart because they mean different things. Files worked and actions
 * completed are shown as two numbers for the same reason they are everywhere
 * else: five files with thirty-five actions and a hundred files with a hundred
 * are different days, and one figure cannot tell them apart.
 *
 * Deliberately NOT a score. The absence of recorded activity is shown as the
 * fact it is — somebody may have spent the day on a call, in training, or on
 * something nobody logged. Turning silence into a judgement is the manager's
 * job to avoid and this screen's job not to invite.
 */
import { useState } from "react";
import { AlertTriangle, CircleSlash, ClipboardCheck, Loader2, UserX } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";
import { managesAgency } from "@/lib/agency/navigation";
import { useDecideTimeAdjustment, usePendingTimeAdjustments } from "@/lib/data/use-time-adjustments";
import { AttendanceCard, LeaveQueue } from "@/components/agency/people/AttendanceAndLeave";
import { formatDateTime } from "@/lib/format-date";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Input } from "@/components/ui/input";
import { EodProductionSummary } from "@/components/agency/EodProductionSummary";
import { useTeamEod, useEodActivity, todayLocal } from "@/lib/data/use-eod-day";
import { SUBMISSION_LABEL, submissionKind } from "@/lib/data/eod-day";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const KIND_TONE = {
  submitted_by_person: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  auto_submitted: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  not_submitted: "border-border bg-muted text-muted-foreground",
} as const;

function PersonRow({ employeeId, date, name }: { employeeId: string; date: string; name: string }) {
  /* Fetched only when a manager opens somebody — thirty RPCs to render a
     table nobody has drilled into is the waterfall rule 14 forbids. */
  const activity = useEodActivity(date, employeeId);
  if (activity.isLoading) {
    return <p className="px-4 py-3 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading {name}'s day…</p>;
  }
  if (!activity.data) return <p className="px-4 py-3 text-xs text-muted-foreground">Nothing recorded.</p>;
  return (
    <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
      <EodProductionSummary activity={activity.data} />
    </div>
  );
}

export const TeamEodPage = () => {
  const [date, setDate] = useState(todayLocal());
  const team = useTeamEod(date);
  const [open, setOpen] = useState<string | null>(null);

  const rows = team.data ?? [];
  const missing = rows.filter((r) => !r.submittedAt);
  const auto = rows.filter((r) => r.autoSubmitted);
  const blocked = rows.filter((r) => (r.blockers ?? "").trim().length > 0);

  return (
    <HqPageShell
      title="Team EOD"
      description="Who reported, what they worked, and what is in their way"
      icon={ClipboardCheck}
      actions={
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          aria-label="Day" className="h-8 w-40" />
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-2xl font-black text-foreground">
            <UserX className="h-5 w-5 text-status-danger" /> {missing.length}
          </p>
          <p className="text-sm font-semibold">Missing EOD</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-2xl font-black text-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> {auto.length}
          </p>
          <p className="text-sm font-semibold">Auto-submitted</p>
          <p className="text-[11px] text-muted-foreground">Nobody confirmed these.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-2xl font-black text-foreground">
            <CircleSlash className="h-5 w-5 text-amber-600" /> {blocked.length}
          </p>
          <p className="text-sm font-semibold">Reported a blocker</p>
        </div>
      </div>

      <ContentCard title={`${rows.length} on the team · ${formatDate(date)}`}>
        {team.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading the team's day…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No staff to show.</p>
        ) : (
          <ul className="-mx-4 divide-y divide-border/50">
            {rows.map((r) => {
              const kind = submissionKind(r);
              const isOpen = open === r.employeeId;
              return (
                <li key={r.employeeId}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : r.employeeId)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{r.employeeName}</span>
                      {r.blockers && <span className="block truncate text-xs text-amber-700">Blocker: {r.blockers}</span>}
                      {r.nextWorkdayPriority && (
                        <span className="block truncate text-xs text-muted-foreground">Tomorrow: {r.nextWorkdayPriority}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {r.submittedAt && (
                        <span className="text-xs text-muted-foreground">{formatDate(r.submittedAt)}</span>
                      )}
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", KIND_TONE[kind])}>
                        {SUBMISSION_LABEL[kind]}
                      </span>
                    </span>
                  </button>
                  {isOpen && <PersonRow employeeId={r.employeeId} date={date} name={r.employeeName} />}
                </li>
              );
            })}
          </ul>
        )}
      </ContentCard>

      <TimeAdjustmentQueue />
      <LeaveQueue />
      <AttendanceCard date={date} names={new Map((team.data ?? []).map((r) => [r.employeeId, r.employeeName]))} />

      <p className="mt-3 text-xs text-muted-foreground">
        No recorded activity is shown as exactly that. Somebody may have spent the day on a
        call, in training, or on work nobody logged — the absence of a record is not a finding.
      </p>
    </HqPageShell>
  );
};

/**
 * Time corrections waiting on a decision (0236). An agent never edits their
 * own recorded time — they state what was true and why, and it becomes the
 * record only under a lead's or admin's name. Both names stay on the audit.
 */
const TimeAdjustmentQueue = () => {
  const access = useAgencyAccessContext();
  const mayDecide = managesAgency(access.ctx) || access.ctx.leadsTeam;
  const pending = usePendingTimeAdjustments(mayDecide);
  const decide = useDecideTimeAdjustment();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { user } = useAuth();

  if (!mayDecide) return null;
  const rows = pending.data ?? [];

  return (
    <div className="mt-4">
      <ContentCard title={`Time adjustment requests${rows.length ? ` · ${rows.length} pending` : ""}`}>
        {pending.isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nothing waiting. Agents request an adjustment from My Time when a
            recorded duration is wrong; it lands here with their reason.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => {
              const own = r.requestedBy === user?.id;
              return (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {r.requestedByName ?? "Unknown"} · {formatDate(r.entryWorkDate)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Recorded end {r.entryEndedAt ? formatDateTime(r.entryEndedAt) : "—"} → requested{" "}
                        <span className="font-medium text-foreground">{formatDateTime(r.requestedEndedAt)}</span>
                      </p>
                      <p className="mt-1 text-xs text-foreground">“{r.reason}”</p>
                    </div>
                    {own ? (
                      <span className="text-[11px] text-muted-foreground">
                        Yours — another lead or admin decides it.
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ requestId: r.id, approve: true, note: noteFor === r.id ? note.trim() || undefined : undefined })
                          }
                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-status-success hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={decide.isPending || (noteFor === r.id && note.trim().length === 0)}
                          onClick={() => {
                            if (noteFor !== r.id) { setNoteFor(r.id); setNote(""); return; }
                            decide.mutate({ requestId: r.id, approve: false, note: note.trim() }, { onSuccess: () => setNoteFor(null) });
                          }}
                          className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          {noteFor === r.id ? "Confirm decline" : "Decline"}
                        </button>
                      </span>
                    )}
                  </div>
                  {noteFor === r.id && (
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="Tell them why (required to decline)."
                      className="mt-2 block w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {decide.error && (
          <p className="mt-2 text-xs font-semibold text-status-danger">
            {(decide.error as Error).message}
          </p>
        )}
      </ContentCard>
    </div>
  );
};

