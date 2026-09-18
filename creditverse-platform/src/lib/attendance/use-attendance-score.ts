/**
 * One person's attendance score for the quarter they are in.
 *
 * Derived, never stored (rule 2): the score is arithmetic over the canonical
 * attendance record, so it cannot drift from the timesheet it describes. One
 * bounded request for the quarter's days, and the policy runs in memory —
 * not a query per figure (rule 14).
 */
import { useMemo } from "react";
import { useAttendanceRange, useSchedules } from "@/lib/data/use-people";
import { useAuth } from "@/lib/auth/auth-context";
import { businessToday } from "@/lib/calendar/us-federal-holidays";
import { factsFrom } from "./attendance-facts";
import { quarterOf, scoreQuarter, type QuarterScore } from "./attendance-score";

/** First and last calendar day of the quarter a date falls in. */
export function quarterRange(day: string): { from: string; to: string } {
  const [y, m] = day.split("-").map(Number);
  const firstMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastMonth = firstMonth + 2;
  const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate();
  return { from: `${y}-${pad(firstMonth)}-01`, to: `${y}-${pad(lastMonth)}-${pad(lastDay)}` };
}

export function useMyAttendanceScore(): { score: QuarterScore | null; isLoading: boolean } {
  const auth = useAuth();
  const today = businessToday();
  const { from, to } = quarterRange(today);
  const attendance = useAttendanceRange(from, to);
  const schedules = useSchedules();

  const score = useMemo(() => {
    if (!attendance.data) return null;
    const mine = attendance.data.filter((d) => d.userId === auth.user?.id);
    const schedule = (schedules.data ?? []).find((s) => s.userId === auth.user?.id)
      ?? (schedules.data ?? [])[0];
    const facts = factsFrom(mine, schedule, { today });
    return scoreQuarter(facts, { quarter: quarterOf(today), today });
  }, [attendance.data, schedules.data, auth.user?.id, today]);

  return { score, isLoading: attendance.isPending || schedules.isPending };
}
