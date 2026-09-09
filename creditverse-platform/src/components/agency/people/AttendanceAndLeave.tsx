/**
 * Attendance and the leave queue — shared by Team EOD (a lead's day view)
 * and the HR page (management's home for people matters). One component,
 * two doors; the data functions gate who sees whom either way.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/auth-context";
import { useAttendanceRange, useLeaveActions, usePendingLeave } from "@/lib/data/use-people";
import { formatDuration } from "@/lib/time-domain";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/**
 * Pending leave, decided here — the same doctrine as time adjustments: a lead
 * or manager decides, never their own, and the requester is told with the
 * decider's name on it.
 */
export const LeaveQueue = () => {
  const auth = useAuth();
  const pending = usePendingLeave();
  const actions = useLeaveActions();
  const [note, setNote] = useState<Record<string, string>>({});

  const rows = (pending.data ?? []).filter((r) => r.userId !== auth.user?.id);
  if (rows.length === 0) return null;

  return (
    <ContentCard title="Leave requests waiting on a decision">
      <ul className="divide-y divide-border/50">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
            <span className="min-w-0 text-foreground">
              <span className="font-semibold">{r.requesterName ?? "Someone"}</span>
              {" "}· {r.typeLabel} · {formatDate(r.startsOn)}
              {r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
              {r.reason && <span className="text-muted-foreground"> · "{r.reason}"</span>}
            </span>
            <span className="flex items-center gap-1.5">
              <Input
                value={note[r.id] ?? ""}
                onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Note (optional)"
                className="h-7 w-40 text-xs"
              />
              <button type="button" disabled={actions.decide.isPending}
                onClick={() => actions.decide.mutate({ id: r.id, approve: true, note: note[r.id] })}
                className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-50">
                Approve
              </button>
              <button type="button" disabled={actions.decide.isPending}
                onClick={() => actions.decide.mutate({ id: r.id, approve: false, note: note[r.id] })}
                className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-50">
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
      {actions.decide.error && (
        <p className="mt-2 text-xs font-semibold text-status-danger">{(actions.decide.error as Error).message}</p>
      )}
    </ContentCard>
  );
};

const ATTENDANCE_TONE: Record<string, string> = {
  present: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  late: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  absent: "border-red-500/30 bg-red-500/10 text-red-700",
  on_leave: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  not_in_yet: "border-border bg-muted text-muted-foreground",
  off: "border-border bg-muted text-muted-foreground",
  no_schedule: "border-border bg-muted text-muted-foreground",
};
const ATTENDANCE_LABEL: Record<string, string> = {
  present: "On time",
  late: "Late",
  absent: "Absent",
  on_leave: "On leave",
  not_in_yet: "Not in yet",
  off: "Day off",
  no_schedule: "No schedule",
};

/**
 * The chosen day's attendance, DERIVED — late, absent, over-break and
 * over-lunch are arithmetic over schedules, time entries and approved leave
 * (rule 9). Nobody marks anybody; there is nothing here to type.
 */
export const AttendanceCard = ({ date, names }: { date: string; names: Map<string, string> }) => {
  const attendance = useAttendanceRange(date, date);

  const rows = (attendance.data ?? []).filter((a) => a.status !== "no_schedule");
  const unscheduled = (attendance.data ?? []).filter((a) => a.status === "no_schedule").length;

  return (
    <ContentCard title={`Attendance · ${formatDate(date)}`}>
      {attendance.isLoading ? (
        <p className="py-3 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Working it out…</p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          Nobody visible to you has a work schedule yet. A schedule is set on the person's profile, under Schedule & Time —
          without one, late and over-break cannot honestly be computed.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border/50">
            {rows.map((a) => (
              <li key={a.userId + a.day} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="text-foreground">{names.get(a.userId) ?? "—"}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {a.workMinutes > 0 && (
                    <span className="text-muted-foreground">{formatDuration(a.workMinutes)} worked</span>
                  )}
                  {a.lateMinutes > 0 && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      {a.lateMinutes}m late
                    </span>
                  )}
                  {a.overbreakMinutes > 0 && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      {a.overbreakMinutes}m over break
                    </span>
                  )}
                  {a.overlunchMinutes > 0 && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      {a.overlunchMinutes}m over lunch
                    </span>
                  )}
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", ATTENDANCE_TONE[a.status])}>
                    {a.status === "on_leave" && a.leaveLabel ? a.leaveLabel : ATTENDANCE_LABEL[a.status]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {unscheduled > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {unscheduled} {unscheduled === 1 ? "person has" : "people have"} no work schedule yet, so
              nothing is claimed about their day. Set schedules on the Workforce page.
            </p>
          )}
        </>
      )}
    </ContentCard>
  );
};
