/**
 * End of Day Submission — the agent's source record (Dee, 2026-10-01).
 *
 *   Agents submit individual EODs. Every level above them receives a
 *   rollup, not a flood of separate reports.
 *
 * The employee does not retype their day. Production, the client files
 * worked and the actions taken in each come from the canonical work records
 * (`eod_day_activity`); attendance comes from the clock. The agent adds only
 * what the system cannot know — blockers, follow-ups, notes — and submits.
 *
 * Submitting saves the day, freezes the snapshot, routes it to the team
 * lead, queues the email and raises the notification (database triggers on
 * `eod_submissions`). A submitted EOD is locked: it is what the lead
 * received. The one way back in is the lead asking a question.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, CircleSlash, ClipboardCheck, Clock,
  Loader2, Lock, MessageSquareWarning, Save, Send, Timer,
} from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { ContentCard, DivisionTable, StatusPill } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/common/Avatar";
import { EodTeamRollup } from "@/components/agency/EodTeamRollup";
import { EodEmailStatus } from "@/components/agency/EodEmailStatus";
import { EasternTimeNote } from "@/components/time/EasternTimeNote";
import { useAuth } from "@/lib/auth/auth-context";
import { useEodActivity, useEodCutoff, useEodDay, useSaveEod, todayLocal } from "@/lib/data/use-eod-day";
import { describeEodRouting, type EodNotes } from "@/lib/data/eod-day";
import { useMyEodReport } from "@/lib/data/use-eod-report";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { useTeams } from "@/lib/data/use-teams";
import { useAttendanceRange, useSchedules } from "@/lib/data/use-people";
import { useAttendanceCorrections } from "@/lib/attendance/use-attendance-corrections";
import { useAttendancePolicy } from "@/lib/attendance/use-attendance-policy";
import { latestPerDay } from "@/lib/attendance/corrections-latest";
import { ATTENDANCE_LABEL, applyCorrection } from "@/lib/attendance/attendance-day-label";
import { useAvatarUrls, useOwnProfile } from "@/lib/data/use-account";
import { besTime, shiftLabel } from "@/lib/time/business-timezone";
import { eodDueLabel, productionTiles, scoringPeriod, submissionLock } from "@/lib/eod/agent-eod-view";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const FILES_SHOWN = 5;

const ATTENDANCE_TONE: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700",
  late: "bg-amber-500/15 text-amber-700",
  absent: "bg-red-500/15 text-red-700",
  on_leave: "bg-blue-500/15 text-blue-700",
};

function HeaderCard({ icon: Icon, tone, title, value, lines }: {
  icon: typeof Clock; tone: string; title: string; value: string; lines: (string | null)[];
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-base font-bold text-foreground">{value}</p>
        {lines.filter((l): l is string => !!l).map((l) => (
          <p key={l} className="text-xs text-muted-foreground">{l}</p>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-2xl font-black tabular-nums text-foreground">{value}</p>
      <p className="truncate text-xs text-muted-foreground" title={label}>{label}</p>
    </div>
  );
}

function Count({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", tone ?? "text-muted-foreground")} />
        <span className="text-lg font-bold text-foreground">{value}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export const EodPage = () => {
  const { user, displayName, teamIds } = useAuth();
  const userId = user?.id ?? "";
  const date = todayLocal();
  const activity = useEodActivity(date);
  const day = useEodDay(date);
  const save = useSaveEod(date);
  const cutoff = useEodCutoff();
  const report = useMyEodReport(date);
  const policy = useAttendancePolicy();

  /* Who is filing: name, role, team. */
  const profile = useOwnProfile();
  const members = useAgencyMembers();
  const { teams } = useTeams();
  const me = (members.data ?? []).find((m) => m.userId === userId);
  const avatar = useAvatarUrls([profile.profile?.avatarPath]);
  const roleLabel = me?.jobTitle ?? profile.profile?.title ?? null;
  const teamLabel = teams.filter((t) => teamIds.includes(t.id)).map((t) => t.name).join(", ") || null;

  /* Attendance for the day, derived from the clock, with any correction standing over it. */
  const attendance = useAttendanceRange(date, date);
  const corrections = useAttendanceCorrections(date, date);
  const schedules = useSchedules();
  const schedule = (schedules.data ?? []).find((s) => s.userId === userId);
  const todayRow = (attendance.data ?? []).find((a) => a.userId === userId);
  const attendanceDay = todayRow
    ? applyCorrection(todayRow, latestPerDay(corrections.data ?? [], userId).find((c) => c.day === date))
    : null;

  const [notes, setNotes] = useState<EodNotes>({});
  const [dirty, setDirty] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showAllFiles, setShowAllFiles] = useState(false);

  /* Load the person's own words once; never overwrite what they are typing. */
  useEffect(() => {
    if (!day.data || dirty) return;
    setNotes({
      unfinishedWork: day.data.unfinishedWork ?? "",
      blockers: day.data.blockers ?? "",
      escalations: day.data.escalations ?? "",
      additionalNotes: day.data.additionalNotes ?? "",
      nextWorkdayPriority: day.data.nextWorkdayPriority ?? "",
    });
  }, [day.data, dirty]);

  const a = activity.data;
  const lock = submissionLock(day.data);
  const editable = lock.state !== "locked";
  const tiles = useMemo(() => (a ? productionTiles(a) : []), [a]);
  const scoring = scoringPeriod(date, policy.scoringStartsOn);
  const routing = describeEodRouting(report.data?.routing.reason, report.data?.routing.toName);
  const files = a?.files ?? [];
  const shownFiles = showAllFiles ? files : files.slice(0, FILES_SHOWN);
  const hasTasks = !!a && (a.completed.length + a.inProgress.length + a.overdue.length + a.blocked.length) > 0;

  const edit = (key: keyof EodNotes, value: string) => { setDirty(true); setNotes((n) => ({ ...n, [key]: value })); };
  const saveDraft = async () => {
    await save.mutateAsync({ notes, submit: false });
    setDraftSavedAt(new Date().toISOString());
  };
  const submit = async () => {
    await save.mutateAsync({ notes, submit: true });
    setDirty(false);
  };

  const attendanceValue = attendanceDay ? ATTENDANCE_LABEL[attendanceDay.status] : (attendance.isLoading ? "…" : "No schedule today");
  const attendanceLines = attendanceDay
    ? [
        attendanceDay.firstIn ? `Clocked in ${besTime(attendanceDay.firstIn, false)}` : null,
        attendanceDay.status === "late" && attendanceDay.lateMinutes > 0 ? `${attendanceDay.lateMinutes} min late` : null,
        schedule ? shiftLabel(schedule.shiftStart, schedule.shiftEnd) : null,
        attendanceDay.correctedBy ? `Corrected by ${attendanceDay.correctedBy}` : null,
      ]
    : [];

  return (
    <HqPageShell
      title="End of Day Submission"
      description="Log your work, review your activity, and submit your EOD."
      icon={ClipboardCheck}
      actions={
        <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden /> {formatDate(date)}
        </span>
      }
    >
      <div className="mb-3"><EasternTimeNote shift={schedule ? { shiftStart: schedule.shiftStart, shiftEnd: schedule.shiftEnd } : null} /></div>

      {/* Who, how they arrived, where the EOD stands, and the period it counts toward. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Avatar name={displayName ?? ""} url={profile.profile?.avatarPath ? avatar.data?.[profile.profile.avatarPath] : undefined} size="md" />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-foreground">{displayName}</p>
            {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
            <p className="text-xs text-muted-foreground">Team: <span className="font-semibold text-foreground">{teamLabel ?? "No team yet"}</span></p>
          </div>
        </div>
        <HeaderCard
          icon={attendanceDay?.status === "late" ? AlertTriangle : CheckCircle2}
          tone={ATTENDANCE_TONE[attendanceDay?.status ?? ""] ?? "bg-muted text-muted-foreground"}
          title="Attendance" value={attendanceValue} lines={attendanceLines}
        />
        <HeaderCard
          icon={lock.state === "locked" ? Lock : lock.state === "clarify" ? MessageSquareWarning : Clock}
          tone={lock.state === "locked" ? "bg-emerald-500/15 text-emerald-700" : lock.state === "clarify" ? "bg-amber-500/15 text-amber-700" : "bg-amber-500/15 text-amber-700"}
          title="EOD Status" value={lock.headline}
          lines={[
            lock.state === "locked" ? (lock.at ? `Submitted ${formatDateTime(lock.at)}` : null) : eodDueLabel(cutoff.data?.cutoffLocal ?? null),
            lock.state === "clarify" ? "Your team lead asked a question — answer and re-submit." : null,
          ]}
        />
        <HeaderCard icon={CalendarClock} tone="bg-emerald-500/15 text-emerald-700" title="Scoring Period" value={scoring.period} lines={[scoring.note]} />
      </div>

      {activity.isLoading || !a ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Building today's report…
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="space-y-4">
            <ContentCard title={<>Today's Production <span className="text-xs font-normal text-muted-foreground">(Auto-pulled from your work)</span></>}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} />)}
              </div>
            </ContentCard>

            <ContentCard
              title={<>Client Files Worked Today <span className="block text-xs font-normal text-muted-foreground sm:inline sm:ml-2">Pulled from your completed work. Notes are the ones you wrote when you completed each file.</span></>}
            >
              {files.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No files completed yet today. Completing a file in your workspace adds it here automatically.
                </p>
              ) : (
                <>
                  <DivisionTable
                    columns={["#", "Client", "Actions Taken", "Round", "Status", "Notes"]}
                    rows={shownFiles.map((f, i) => [
                      String(i + 1),
                      <span className="font-semibold text-foreground">{f.subject}</span>,
                      f.actions.length > 0
                        ? <span className="whitespace-normal text-xs text-foreground">{f.actions.join(" · ")}</span>
                        : <span className="text-xs text-muted-foreground">No actions recorded</span>,
                      f.round ?? "—",
                      f.resulting_status ? <StatusPill status={f.resulting_status} /> : "—",
                      <span className="whitespace-normal text-xs text-muted-foreground">{f.notes || "—"}</span>,
                    ])}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Showing {shownFiles.length} of {files.length} client {files.length === 1 ? "file" : "files"} worked today</span>
                    {files.length > FILES_SHOWN && (
                      <button type="button" onClick={() => setShowAllFiles((v) => !v)}
                        className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                        {showAllFiles ? "Show fewer" : "View all"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </ContentCard>

            {hasTasks && (
              <ContentCard title="Today's tasks">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Count icon={CheckCircle2} label="Completed" value={a.completed.length} tone="text-status-success" />
                  <Count icon={Clock} label="Worked on" value={a.worked.length} />
                  <Count icon={CalendarClock} label="In progress" value={a.inProgress.length} />
                  <Count icon={AlertTriangle} label="Overdue" value={a.overdue.length} tone="text-status-danger" />
                  <Count icon={CircleSlash} label="Blocked" value={a.blocked.length} tone="text-amber-600" />
                  <Count icon={Timer} label="Minutes logged" value={a.minutesLogged} />
                </div>
                {a.blocked.length > 0 && (
                  <ul className="mt-3 space-y-0.5">
                    {a.blocked.map((t) => (
                      <li key={t.id} className="text-sm text-foreground">{t.title} <span className="text-muted-foreground">— {t.reason}</span></li>
                    ))}
                  </ul>
                )}
              </ContentCard>
            )}

            <ContentCard title={<>Additional Notes <span className="text-xs font-normal text-muted-foreground">(Optional)</span></>}>
              <Textarea rows={3} value={notes.additionalNotes ?? ""} disabled={!editable}
                onChange={(e) => edit("additionalNotes", e.target.value)}
                placeholder="Any other notes, observations, or updates for your Team Lead." aria-label="Additional notes" />
              {(day.data?.escalations || day.data?.unfinishedWork) && (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {day.data?.escalations && <p><span className="font-semibold text-foreground">Help needed:</span> {day.data.escalations}</p>}
                  {day.data?.unfinishedWork && <p><span className="font-semibold text-foreground">Carryover:</span> {day.data.unfinishedWork}</p>}
                </div>
              )}
            </ContentCard>
          </div>

          <div className="space-y-4">
            <ContentCard title={<>Today's Summary <span className="block text-xs font-normal text-muted-foreground">Auto-calculated from your work records</span></>}>
              <ul className="divide-y divide-border/60 text-sm">
                {tiles.map((t) => (
                  <li key={t.label} className="flex items-center justify-between py-1.5">
                    <span className="text-foreground">{t.label}</span>
                    <span className="font-bold tabular-nums text-foreground">{t.value}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between py-1.5">
                  <span className="text-foreground">Actions completed</span>
                  <span className="font-bold tabular-nums text-foreground">{a.actionsCompleted}</span>
                </li>
              </ul>
            </ContentCard>

            <ContentCard title={<>Blockers / Issues <span className="block text-xs font-normal text-muted-foreground">Were there any issues, delays, or accounts that need help?</span></>}>
              <Textarea rows={3} value={notes.blockers ?? ""} disabled={!editable}
                onChange={(e) => edit("blockers", e.target.value)}
                placeholder="Describe any blockers or issues you encountered today…" aria-label="Blockers and issues" />
            </ContentCard>

            <ContentCard title={<>Follow-ups Needed <span className="block text-xs font-normal text-muted-foreground">List any accounts that need follow-up and what should be done.</span></>}>
              <Textarea rows={3} value={notes.nextWorkdayPriority ?? ""} disabled={!editable}
                onChange={(e) => edit("nextWorkdayPriority", e.target.value)}
                placeholder="Add follow-ups, next steps, or reminders…" aria-label="Follow-ups needed" />
            </ContentCard>

            {lock.state === "clarify" && lock.note && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
                <span className="font-semibold">Your team lead asked:</span> {lock.note}
              </p>
            )}

            {editable ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" className="h-11 flex-1" onClick={() => void saveDraft()} disabled={save.isPending || !user}>
                    <Save className="mr-1.5 h-4 w-4" /> Save as Draft
                  </Button>
                  <Button className="h-11 flex-[1.3]" onClick={() => void submit()} disabled={save.isPending || !user}>
                    {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                    {lock.state === "clarify" ? "Answer and re-submit" : "Submit EOD"}
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {routing.needsAttention
                    ? routing.label
                    : report.data?.routing.toName
                      ? `Your EOD will be sent to ${report.data.routing.toName} for review.`
                      : "Your EOD will be sent to your Team Lead for review."}
                  {draftSavedAt && !save.isPending && <> Draft saved {besTime(draftSavedAt)}.</>}
                </p>
                {save.isError && <p role="alert" className="text-center text-xs text-status-danger">Could not save. Try again.</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-foreground"><Lock className="h-4 w-4 text-emerald-700" aria-hidden /> {lock.headline}{lock.at ? ` ${formatDateTime(lock.at)}` : ""}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lock.headline === "Auto-submitted"
                    ? "Nobody submitted this before the cutoff, so the system submitted what it had. It is not recorded as your submission."
                    : report.data?.routing.toName ? `Sent to ${report.data.routing.toName}. A submitted EOD is locked; ask your team lead if something needs correcting.` : "A submitted EOD is locked; ask your team lead if something needs correcting."}
                </p>
                {day.data?.id && <div className="mt-2"><EodEmailStatus eodId={day.data.id} /></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* For whoever leads somebody: the team's day. Renders nothing otherwise. */}
      <div className="mt-4"><EodTeamRollup date={date} /></div>
    </HqPageShell>
  );
};
