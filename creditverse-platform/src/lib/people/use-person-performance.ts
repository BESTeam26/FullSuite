/**
 * One person's performance — the same derivation the team page uses
 * (performance-metrics.ts), for the profile. Six months of attendance for the
 * trend, EOD submissions and work items over the same span, one policy.
 * The rows are RLS-scoped: a person sees their own, a lead their team's,
 * management its scope.
 */
import { useMemo } from "react";
import { useAttendanceRange, useSchedules } from "@/lib/data/use-people";
import { useEodSubmissionsRange } from "@/lib/data/use-eod-day";
import { useAgencyWork } from "@/lib/data/use-work";
import { factsFrom } from "@/lib/attendance/attendance-facts";
import { latestPerDay, useAttendanceCorrections } from "@/lib/attendance/use-attendance-corrections";
import { useAttendancePolicy } from "@/lib/attendance/use-attendance-policy";
import { usePerformancePolicy } from "@/lib/people/use-performance-policy";
import { businessToday } from "@/lib/calendar/us-federal-holidays";
import { lastMonths, personScore, type PersonScore } from "@/lib/people/performance-metrics";
import { monthToDate, previousMonth, type DateRange } from "@/lib/people/overview-metrics";

export function usePersonPerformance(userId: string, period?: DateRange) {
  const today = businessToday();
  const months = useMemo(() => lastMonths(today, 6), [today]);
  const range = period ?? monthToDate(today);
  const attendance = useAttendanceRange(months[0].from, today);
  const schedules = useSchedules();
  const corrections = useAttendanceCorrections(months[0].from, today);
  const eod = useEodSubmissionsRange(months[0].from, today);
  const work = useAgencyWork();
  const policy = useAttendancePolicy();
  const weighting = usePerformancePolicy();

  const scored = useMemo(() => {
    if (!attendance.data) return null;
    const theirs = attendance.data.filter((d) => d.userId === userId);
    const schedule = (schedules.data ?? []).find((s) => s.userId === userId);
    const input = {
      userId, facts: factsFrom(theirs, schedule, { today }), policy,
      corrections: latestPerDay(corrections.data ?? [], userId),
      eodMarks: eod.data ?? [], items: work.source === "live" ? work.items : [],
    };
    return {
      score: personScore(input, range, weighting),
      previous: personScore(input, previousMonth(range.from), weighting),
      months: months.map((m) => ({ range: m, score: personScore(input, m, weighting) })),
    } as { score: PersonScore; previous: PersonScore; months: { range: DateRange; score: PersonScore }[] };
  }, [attendance.data, schedules.data, corrections.data, eod.data, work.items, work.source, userId, today, policy, weighting, range, months]);

  return {
    loading: attendance.isLoading || eod.isLoading,
    today, range, weighting,
    items: work.source === "live" ? work.items : [],
    ...(scored ?? { score: null, previous: null, months: [] }),
  };
}
