/**
 * Turning the attendance the product already derives into scoreable facts.
 *
 * Kept apart from `attendance-score.ts` on purpose: the SCORE is Dee's policy
 * and should be readable without knowing anything about how BES records time.
 * This file is the only place that knows the shape of `attendance_for` and
 * `work_schedules`, so a schema change lands here and not in the policy.
 *
 * Nothing is stored. The score is DERIVED from the canonical attendance
 * record every time, so it cannot drift from the timesheet it describes
 * (rule 2). The only thing that would ever be stored is a lead's correction.
 */
import type { AttendanceDay, WorkSchedule } from "@/lib/data/people-management";
import type { AttendanceFact } from "./attendance-score";

/** Minutes between "09:00:00" and "18:00:00", lunch and breaks removed. */
export function scheduledMinutes(schedule: Pick<WorkSchedule, "shiftStart" | "shiftEnd" | "lunchMinutes">): number {
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const start = mins(schedule.shiftStart);
  const end = mins(schedule.shiftEnd);
  /* A shift that ends "before" it starts crosses midnight. */
  const span = end > start ? end - start : end + 24 * 60 - start;
  /* Lunch is unpaid time out of the shift; paid break is not deducted, because
     `attendance_for`'s worked minutes already exclude neither consistently
     enough to double-count safely. Half a shift means half the WORKING part. */
  return Math.max(0, span - (schedule.lunchMinutes ?? 0));
}

/**
 * One fact per attendance day.
 *
 * `notified` is TRUE for every derived absence, deliberately. The system has no
 * way to know whether somebody phoned in, and turning silence into a −2 would
 * punish twice as hard as the evidence supports. NCNS is something a lead
 * marks; absence is what the records can actually show.
 */
export function factsFrom(
  days: readonly AttendanceDay[],
  schedule: Pick<WorkSchedule, "shiftStart" | "shiftEnd" | "lunchMinutes"> | undefined,
  options: { today: string },
): AttendanceFact[] {
  const shift = schedule ? scheduledMinutes(schedule) : 0;
  return days
    /* A day that has not finished is not yet an attendance event: somebody who
       has not clocked in at 9:05 is "not in yet", not absent. */
    .filter((d) => d.day < options.today)
    .filter((d) => d.status !== "no_schedule" && d.status !== "off")
    .map((d) => ({
      day: d.day,
      scheduled: d.status !== "off" && d.status !== "no_schedule",
      approvedLeave: d.onLeave,
      lateMinutes: d.lateMinutes,
      workedMinutes: d.workMinutes,
      scheduledMinutes: shift,
      notified: true,
    }));
}
