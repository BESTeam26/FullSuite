/**
 * People & Teams → Schedule: the week for everyone in scope.
 *
 * Editing is offered only to management — the same test the database applies
 * in set_work_schedule; a lead reads the week and asks.
 */
import { TeamSchedule } from "@/components/time/TeamSchedule";
import { useTeamUpcomingLeave } from "@/lib/data/use-people";
import { useManagedTeam } from "@/lib/people/use-managed-team";

export function TeamScheduleSection({ canEdit }: { canEdit: boolean }) {
  const team = useManagedTeam();
  const leave = useTeamUpcomingLeave();
  return (
    <TeamSchedule
      people={team.people}
      teams={team.teams}
      schedules={team.schedules}
      leave={leave.data ?? []}
      today={team.today}
      canEdit={canEdit}
    />
  );
}
