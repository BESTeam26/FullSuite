/**
 * One person's attendance score, for their lead.
 *
 * The same engine and the same derived attendance the person sees on My Time,
 * so a lead and the employee can never be looking at different numbers — the
 * whole reason the score is derived rather than stored.
 */
import { useMemo } from "react";
import { useAttendanceRange, useSchedules } from "@/lib/data/use-people";
import { businessToday } from "@/lib/calendar/us-federal-holidays";
import { factsFrom } from "@/lib/attendance/attendance-facts";
import { quarterOf, scoreQuarter } from "@/lib/attendance/attendance-score";
import { quarterRange } from "@/lib/attendance/use-attendance-score";
import { AttendanceSummary } from "./AttendanceSummary";

export function MemberAttendanceScore({ userId }: { userId: string }) {
  const today = businessToday();
  const { from, to } = quarterRange(today);
  const attendance = useAttendanceRange(from, to);
  const schedules = useSchedules();

  const score = useMemo(() => {
    if (!attendance.data) return null;
    const theirs = attendance.data.filter((d) => d.userId === userId);
    const schedule = (schedules.data ?? []).find((s) => s.userId === userId);
    return scoreQuarter(factsFrom(theirs, schedule, { today }), {
      quarter: quarterOf(today), today,
    });
  }, [attendance.data, schedules.data, userId, today]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Attendance · {quarterOf(today).replace("-", " ")}
      </h3>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Derived from the attendance record, not awarded by hand. Repetition never
        deepens a deduction — it raises an alert instead.
      </p>
      {attendance.isPending || !score
        ? <p className="py-4 text-xs text-muted-foreground">Loading…</p>
        : <AttendanceSummary score={score} />}
    </div>
  );
}
