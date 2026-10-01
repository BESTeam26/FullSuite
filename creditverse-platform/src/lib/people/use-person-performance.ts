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
import { lastMonths, leaderScore, personScore, type PersonScore } from "@/lib/people/performance-metrics";
import { useLeadershipScopes } from "@/lib/data/use-workforce";
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
  const scopes = useLeadershipScopes();

  const scored = useMemo(() => {
    if (!attendance.data) return null;
    const inputFor = (id: string) => ({
      userId: id,
      facts: factsFrom(attendance.data!.filter((d) => d.userId === id), (schedules.data ?? []).find((s) => s.userId === id),
        { today, scoringStartsOn: policy.scoringStartsOn }),
      policy,
      corrections: latestPerDay(corrections.data ?? [], id),
      eodMarks: eod.data ?? [], items: work.source === "live" ? work.items : [],
    });
    const input = inputFor(userId);
    /* A leader is measured by their scope (Dee, 2026-10-01); a member whose
       records the viewer cannot see contributes nothing. */
    const members = (scopes.get(userId) ?? []).filter((id) => attendance.data!.some((d) => d.userId === id)).map(inputFor);
    const at = (r: DateRange) =>
      leaderScore(personScore(input, r, weighting), members.map((m) => personScore(m, r, weighting)), weighting);
    return {
      score: at(range),
      previous: at(previousMonth(range.from)),
      months: months.map((m) => ({ range: m, score: at(m) })),
      scopeSize: members.length,
    } as { score: PersonScore; previous: PersonScore; months: { range: DateRange; score: PersonScore }[]; scopeSize: number };
  }, [attendance.data, schedules.data, corrections.data, eod.data, work.items, work.source, userId, today, policy, weighting, range, months, scopes]);

  return {
    loading: attendance.isLoading || eod.isLoading,
    today, range, weighting,
    scoringStartsOn: policy.scoringStartsOn,
    items: work.source === "live" ? work.items : [],
    ...(scored ?? { score: null, previous: null, months: [], scopeSize: 0 }),
  };
}
