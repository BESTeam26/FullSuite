/**
 * Everything the Performance page scores from, assembled once.
 *
 * Six months of attendance facts (windowed and paged by fetchAttendance), the
 * same six months of EOD submissions, the agency's work items, and the
 * roster. Scores themselves are computed by performance-metrics.ts; this hook
 * only gathers and shapes. Scope is `managed_people()`: a lead scores their
 * team, a manager their division, an admin the company.
 */
import { useMemo } from "react";
import { useManagedTeam } from "@/lib/people/use-managed-team";
import { useAttendanceRange } from "@/lib/data/use-people";
import { useEodSubmissionsRange } from "@/lib/data/use-eod-day";
import { useAgencyWork } from "@/lib/data/use-work";
import { factsFrom } from "@/lib/attendance/attendance-facts";
import { latestPerDay } from "@/lib/attendance/use-attendance-corrections";
import { useAttendanceCorrections } from "@/lib/attendance/use-attendance-corrections";
import { lastMonths, leaderScore, personScore, type PersonScore } from "@/lib/people/performance-metrics";
import { useLeadershipScopes } from "@/lib/data/use-workforce";
import { usePerformancePolicy } from "@/lib/people/use-performance-policy";
import type { DateRange } from "@/lib/people/overview-metrics";
import type { AgencyPerson } from "@/lib/data/agency-workforce";

export const TREND_MONTHS = 6;

export interface ScoredPerson {
  person: AgencyPerson;
  /** Score for the selected period. */
  score: PersonScore;
  /** Score for the month before the selected period, for the trend arrow. */
  previous: PersonScore;
  /** One score per trend month, oldest first. */
  months: PersonScore[];
  /** How many people this person is measured on (0 = their own records). */
  scopeSize: number;
}

export function useTeamPerformance(period: DateRange) {
  const team = useManagedTeam();
  const months = useMemo(() => lastMonths(team.today, TREND_MONTHS), [team.today]);
  const span: DateRange = { from: months[0].from, to: team.today };
  const attendance = useAttendanceRange(span.from, span.to);
  const corrections = useAttendanceCorrections(span.from, span.to);
  const eod = useEodSubmissionsRange(span.from, span.to);
  const work = useAgencyWork();
  const weighting = usePerformancePolicy();
  const scopes = useLeadershipScopes();
  const { people, schedules, policy, today } = team;

  const previousOf = (r: DateRange): DateRange => {
    const first = new Date(`${r.from}T00:00:00Z`);
    const prevLast = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 0));
    return { from: `${prevLast.toISOString().slice(0, 7)}-01`, to: prevLast.toISOString().slice(0, 10) };
  };

  const scored = useMemo<ScoredPerson[]>(() => {
    if (!attendance.data) return [];
    const marks = eod.data ?? [];
    const items = work.source === "live" ? work.items : [];
    const own = people.map((person) => {
      const theirs = attendance.data!.filter((d) => d.userId === person.userId);
      const schedule = schedules.find((s) => s.userId === person.userId);
      const facts = factsFrom(theirs, schedule, { today, scoringStartsOn: policy.scoringStartsOn });
      const input = {
        userId: person.userId, facts, policy,
        corrections: latestPerDay(corrections.data ?? [], person.userId),
        eodMarks: marks, items,
      };
      return {
        person,
        score: personScore(input, period, weighting),
        previous: personScore(input, previousOf(period), weighting),
        months: months.map((m) => personScore(input, m, weighting)),
        scopeSize: 0,
      };
    });
    /* A leader is measured by their scope (Dee, 2026-10-01): the same months,
       each replaced by the mean over the people they lead; attendance stays
       their own. Members outside the viewer's data simply do not count. */
    const byId = new Map(own.map((s) => [s.person.userId, s]));
    return own.map((s) => {
      const members = (scopes.get(s.person.userId) ?? []).map((id) => byId.get(id)).filter((m): m is ScoredPerson => !!m);
      if (members.length === 0) return s;
      return {
        ...s,
        score: leaderScore(s.score, members.map((m) => m.score), weighting),
        previous: leaderScore(s.previous, members.map((m) => m.previous), weighting),
        months: s.months.map((month, i) => leaderScore(month, members.map((m) => m.months[i]), weighting)),
        scopeSize: members.length,
      };
    });
  }, [attendance.data, corrections.data, eod.data, work.items, work.source, people, schedules, policy, weighting, today, period, months, scopes]);

  return {
    weighting,
    scoringStartsOn: policy.scoringStartsOn,
    loading: team.loading || attendance.isLoading || eod.isLoading,
    error: attendance.error ?? eod.error ?? null,
    today,
    months,
    scored,
    teams: team.teams,
    items: work.source === "live" ? work.items : [],
  };
}
