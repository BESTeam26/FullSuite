/**
 * What one attendance day reads as — on the lead's day card and on the
 * agent's own EOD header — after a manager's correction, if any. One rule
 * (rule 6): the quarter score, the day card and the EOD all agree.
 */
import type { AttendanceDay } from "@/lib/data/people-management";
import type { Correction } from "./attendance-score";

export type AttendanceDayStatus = AttendanceDay["status"];

/** What a correction's classification reads as on a day card. */
export const CORRECTED_STATUS: Record<string, AttendanceDayStatus> = {
  on_time: "present", late: "late", absent: "absent", ncns: "absent", approved_leave: "on_leave", half_day: "present",
};

export const ATTENDANCE_LABEL: Record<AttendanceDayStatus, string> = {
  present: "On time",
  late: "Late",
  absent: "Absent",
  on_leave: "On leave",
  not_in_yet: "Not in yet",
  off: "Day off",
  no_schedule: "No schedule",
};

/** The derived day with the latest correction standing over it. */
export function applyCorrection<T extends Pick<AttendanceDay, "status" | "lateMinutes">>(
  day: T, correction: Correction | undefined,
): T & { correctedBy: string | null } {
  if (!correction) return { ...day, correctedBy: null };
  return {
    ...day,
    status: CORRECTED_STATUS[correction.to] ?? day.status,
    lateMinutes: correction.to === "late" ? day.lateMinutes : 0,
    correctedBy: correction.by,
  };
}
