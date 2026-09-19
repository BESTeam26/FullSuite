/**
 * The week grid behind Team Management → Schedule.
 *
 * What a cell says is a RULE, and it lives here rather than in the component:
 * a day is the person's shift, or their day off, or an approved absence —
 * decided in that order, because approved leave on a scheduled day is the
 * fact a lead planning coverage needs, and leave on a day off is nothing.
 */
import type { LeaveRequest, WorkSchedule } from "@/lib/data/people-management";
import { addDays } from "@/lib/calendar/us-federal-holidays";
import { ISO_WEEKDAYS } from "./schedule-format";

export type ScheduleCell =
  /** Nobody has stated a schedule; attendance says nothing about the day. */
  | { kind: "unscheduled" }
  | { kind: "off" }
  | { kind: "shift"; start: string; end: string }
  /** Approved leave on a working day. The KIND of leave, never the reason. */
  | { kind: "leave"; label: string; compensation: LeaveRequest["compensation"] };

/** ISO weekday 1..7 of a YYYY-MM-DD date, without a timezone round trip. */
export const isoWeekday = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
};

/** The seven dates of the week that begins on `monday`, Monday first. */
export const weekDates = (monday: string): string[] =>
  ISO_WEEKDAYS.map((_, i) => addDays(monday, i));

const covers = (r: LeaveRequest, date: string) => r.startsOn <= date && r.endsOn >= date;

export function cellFor(
  date: string,
  schedule: WorkSchedule | undefined,
  approvedLeave: LeaveRequest[],
): ScheduleCell {
  if (!schedule) return { kind: "unscheduled" };
  if (!schedule.workDays.includes(isoWeekday(date))) return { kind: "off" };
  const away = approvedLeave.find((r) => r.status === "approved" && covers(r, date));
  if (away) return { kind: "leave", label: away.typeLabel, compensation: away.compensation };
  return { kind: "shift", start: schedule.shiftStart, end: schedule.shiftEnd };
}

export interface WeekSummary {
  /** People with no schedule at all — the tab's first job is to name them. */
  unscheduled: number;
  /** People with at least one approved leave day inside the week. */
  awaySomeDay: number;
}

export function summariseWeek(
  monday: string,
  people: { userId: string }[],
  scheduleOf: (userId: string) => WorkSchedule | undefined,
  leaveOf: (userId: string) => LeaveRequest[],
): WeekSummary {
  const dates = weekDates(monday);
  let unscheduled = 0; let awaySomeDay = 0;
  for (const p of people) {
    const s = scheduleOf(p.userId);
    if (!s) { unscheduled += 1; continue; }
    if (dates.some((d) => cellFor(d, s, leaveOf(p.userId)).kind === "leave")) awaySomeDay += 1;
  }
  return { unscheduled, awaySomeDay };
}
