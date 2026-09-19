/**
 * The people this person manages, with this quarter's attendance — the one
 * data assembly every People & Teams operational section reads.
 *
 * Scope is the DATABASE's answer: `managed_people()` is the same predicate
 * that guards every workforce row, so the list and the rows agree by
 * construction (§20b). A Team Lead gets their team, a Division Manager their
 * division, an Executive the company, an Agent nobody — and the page is not
 * offered to them at all.
 *
 * Every section calls this hook; the queries share keys, so Overview,
 * Schedule and Attendance cost one set of requests between them (rule 14).
 */
import { useMemo } from "react";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useManagedPeople } from "@/lib/data/use-managed-people";
import { useAttendanceRange, useSchedules } from "@/lib/data/use-people";
import { factsFrom } from "@/lib/attendance/attendance-facts";
import {
  quarterOf, scoreQuarter, type AttendanceFact, type AttendancePolicy, type Correction,
} from "@/lib/attendance/attendance-score";
import { quarterRange } from "@/lib/attendance/use-attendance-score";
import { latestPerDay, useAttendanceCorrections } from "@/lib/attendance/use-attendance-corrections";
import { useAttendancePolicy } from "@/lib/attendance/use-attendance-policy";
import { businessToday } from "@/lib/calendar/us-federal-holidays";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";
import type { AttendanceDay, WorkSchedule } from "@/lib/data/people-management";

export type QuarterScore = ReturnType<typeof scoreQuarter>;

export interface ManagedTeam {
  loading: boolean;
  today: string;
  people: AgencyPerson[];
  teams: AgencyTeam[];
  schedules: WorkSchedule[];
  /** attendance_for rows for the quarter, everyone in scope. */
  attendance: AttendanceDay[];
  todayRows: AttendanceDay[];
  /** Who has a timer going right now. */
  running: Set<string>;
  attendanceByUser: Map<string, QuarterScore>;
  /** The per-day facts and corrections the score was computed from, so the
      Overview can bucket a week or a month by the SAME classification. */
  factsByUser: Map<string, AttendanceFact[]>;
  correctionsByUser: Map<string, Correction[]>;
  policy: AttendancePolicy;
}

export function useManagedTeam(): ManagedTeam {
  const workforce = useWorkforce();
  const managed = useManagedPeople();
  const today = businessToday();
  const { from, to } = quarterRange(today);
  const attendance = useAttendanceRange(from, to);
  const schedules = useSchedules();
  const corrections = useAttendanceCorrections(from, to);
  const policy = useAttendancePolicy();

  const people = useMemo(() => {
    const all = workforce.data?.people ?? [];
    if (!managed.data) return [];
    return all.filter((p) => managed.data!.has(p.userId));
  }, [workforce.data, managed.data]);

  const running = useMemo(
    () => new Set((workforce.data?.time ?? []).filter((t) => t.running).map((t) => t.employeeId)),
    [workforce.data],
  );

  const scored = useMemo(() => {
    const byUser = new Map<string, QuarterScore>();
    const factsByUser = new Map<string, AttendanceFact[]>();
    const correctionsByUser = new Map<string, Correction[]>();
    if (!attendance.data) return { byUser, factsByUser, correctionsByUser };
    for (const p of people) {
      const theirs = attendance.data.filter((d) => d.userId === p.userId);
      const schedule = (schedules.data ?? []).find((s) => s.userId === p.userId);
      const facts = factsFrom(theirs, schedule, { today });
      const theirCorrections = latestPerDay(corrections.data ?? [], p.userId);
      factsByUser.set(p.userId, facts);
      correctionsByUser.set(p.userId, theirCorrections);
      byUser.set(p.userId, scoreQuarter(facts, {
        quarter: quarterOf(today), today, policy, corrections: theirCorrections,
      }));
    }
    return { byUser, factsByUser, correctionsByUser };
  /* `policy` is a dependency, not decoration: without it a policy edit left
     scores computed under the OLD numbers until something else re-rendered. */
  }, [attendance.data, schedules.data, corrections.data, people, today, policy]);

  const todayRows = useMemo(
    () => (attendance.data ?? []).filter((d) => d.day === today),
    [attendance.data, today],
  );

  return {
    loading: workforce.isLoading || managed.isLoading,
    today,
    people,
    teams: workforce.data?.teams ?? [],
    schedules: schedules.data ?? [],
    attendance: attendance.data ?? [],
    todayRows,
    running,
    attendanceByUser: scored.byUser,
    factsByUser: scored.factsByUser,
    correctionsByUser: scored.correctionsByUser,
    policy,
  };
}
