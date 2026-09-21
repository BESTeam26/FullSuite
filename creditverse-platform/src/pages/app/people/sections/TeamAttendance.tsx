/**
 * People & Teams → Attendance: this quarter's score for everyone in scope.
 *
 * Nothing here edits a score by hand — Dee's rule. A lead reviews a day and
 * records a correction; the score is re-derived from the corrected facts.
 * The Reward Day is never issued from here either: it is earned at quarter
 * close, and the database refuses an open quarter.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { AttendanceReviewDrawer } from "@/components/attendance/AttendanceReviewDrawer";
import { STANDING_BADGE, STANDING_LABEL } from "@/lib/attendance/attendance-score";
import { useRecordCorrection } from "@/lib/attendance/use-attendance-corrections";
import { EXCEPTION_TITLE, useRewardExceptions } from "@/lib/leave/use-reward-exceptions";
import { useManagedTeam } from "@/lib/people/use-managed-team";
import { PresenceBoard } from "@/components/people/PresenceBoard";
import { cn } from "@/lib/utils";

export function TeamAttendance() {
  const { people, attendanceByUser } = useManagedTeam();
  const [reviewing, setReviewing] = useState<{ userId: string; name: string } | null>(null);
  const record = useRecordCorrection();
  const exceptions = useRewardExceptions();
  const ids = new Set(people.map((p) => p.userId));
  const scopedExceptions = (exceptions.data ?? []).filter((x) => ids.has(x.userId));

  return (
    <div className="space-y-4">
      {/* Right now, before the quarter's score — Dee's 2026-09-21 board. */}
      <PresenceBoard names={new Map(people.map((p) => [p.userId, p.name]))} />

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2">Standing</th>
              <th className="px-3 py-2 text-right">Lates</th>
              <th className="px-3 py-2 text-right">Half</th>
              <th className="px-3 py-2 text-right">Absent</th>
              <th className="px-3 py-2 text-right">NCNS</th>
              <th className="px-3 py-2 text-right">Leave</th>
              <th className="px-3 py-2 text-right">Streak</th>
              <th className="px-3 py-2">Alerts</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {people.map((p) => {
              const sc = attendanceByUser.get(p.userId);
              return (
                <tr key={p.userId}>
                  <td className="px-3 py-2">
                    <Link to={`/app/people/${p.userId}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-foreground">
                    {sc ? sc.score.toFixed(2).replace(/\.00$/, "") : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {sc ? `${STANDING_BADGE[sc.standing]} ${STANDING_LABEL[sc.standing]}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.late ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.half_day ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.absent ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{sc?.counts.ncns ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {sc?.counts.approved_leave ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{sc?.streakDays ?? 0}</td>
                  <td className="px-3 py-2">
                    {(sc?.alerts.length ?? 0) === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex flex-wrap gap-1">
                        {sc!.alerts.map((a) => (
                          <span key={a.kind} title={a.detail}
                            className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
                              a.kind === "management"
                                ? "border-destructive/30 bg-status-danger-tint text-status-danger"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-900")}>
                            {a.title}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {sc?.standing === "champion" && (
                        <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-900"
                          title="A Reward Day is issued once the quarter closes">
                          🏆 On track
                        </span>
                      )}
                      <button type="button" disabled={!sc}
                        onClick={() => setReviewing({ userId: p.userId, name: p.name })}
                        className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                        Review attendance
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                Nobody is in your scope yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {scopedExceptions.length > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h3 className="text-sm font-bold text-foreground">Needs your attention</h3>
          <ul className="mt-2 space-y-1.5">
            {scopedExceptions.map((x, i) => (
              <li key={`${x.kind}-${x.userId}-${i}`}
                className={cn("rounded-xl border px-3 py-2 text-[11px]",
                  x.severity === "danger"
                    ? "border-destructive/30 bg-status-danger-tint text-status-danger"
                    : x.severity === "warning"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-900"
                      : "border-border bg-card text-muted-foreground")}>
                <strong>{EXCEPTION_TITLE[x.kind]} · {x.person}</strong>
                <span className="block">{x.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviewing && attendanceByUser.get(reviewing.userId) && (
        <AttendanceReviewDrawer
          name={reviewing.name}
          score={attendanceByUser.get(reviewing.userId)!}
          busy={record.isPending}
          error={(record.error as Error | null)?.message ?? null}
          onClose={() => { setReviewing(null); record.reset(); }}
          onCorrect={(v) => record.mutate({ userId: reviewing.userId, ...v })}
        />
      )}
    </div>
  );
}
