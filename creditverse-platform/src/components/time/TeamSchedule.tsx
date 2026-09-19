/**
 * Team Management → Schedule: the week, person by person.
 *
 * Each cell is what `cellFor` says about that day — shift, day off, approved
 * leave, or nothing because no schedule was ever set. `people` is already the
 * caller's management scope, and the rows behind it are RLS-scoped the same
 * way, so a Team Lead sees their team's week, a Division Manager their
 * division's, an Executive the company's — one component, four views.
 *
 * Editing is offered only to management (the database refuses everyone else
 * anyway); a lead reads the week and asks.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleEditor } from "@/components/time/ScheduleEditor";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";
import type { LeaveRequest, WorkSchedule } from "@/lib/data/people-management";
import { addDays } from "@/lib/calendar/us-federal-holidays";
import { formatDate } from "@/lib/format-date";
import { weekStart } from "@/lib/time-domain";
import { DAY_SHORT, prettyTime, zoneAbbreviation } from "@/lib/time/schedule-format";
import { cellFor, summariseWeek, weekDates, type ScheduleCell } from "@/lib/time/schedule-week";
import { cn } from "@/lib/utils";

export function TeamSchedule({ people, teams, schedules, leave, today, canEdit }: {
  people: AgencyPerson[];
  teams: AgencyTeam[];
  schedules: WorkSchedule[];
  /** Approved leave the caller may see; narrowed here to the visible week. */
  leave: LeaveRequest[];
  today: string;
  canEdit: boolean;
}) {
  const [monday, setMonday] = useState(() => weekStart(new Date(`${today}T12:00:00`)));
  const [editing, setEditing] = useState<string | null>(null);
  const dates = weekDates(monday);

  const scheduleOf = useMemo(() => new Map(schedules.map((s) => [s.userId, s])), [schedules]);
  const leaveOf = useMemo(() => {
    const m = new Map<string, LeaveRequest[]>();
    for (const r of leave) m.set(r.userId, [...(m.get(r.userId) ?? []), r]);
    return m;
  }, [leave]);
  const teamsOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of teams) if (!t.archived) for (const mem of t.members) m.set(mem.userId, [...(m.get(mem.userId) ?? []), t.name]);
    return m;
  }, [teams]);

  const rows = useMemo(() => [...people].sort((a, b) => {
    /* The unscheduled first: they are the tab's action items. Then by name. */
    const au = scheduleOf.has(a.userId) ? 1 : 0, bu = scheduleOf.has(b.userId) ? 1 : 0;
    return au - bu || a.name.localeCompare(b.name);
  }), [people, scheduleOf]);

  const summary = summariseWeek(monday, people, (id) => scheduleOf.get(id), (id) => leaveOf.get(id) ?? []);
  const thisWeek = weekStart(new Date(`${today}T12:00:00`));

  if (people.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nobody is in your management scope yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous week"
            onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={monday === thisWeek}
            onClick={() => setMonday(thisWeek)}>This week</Button>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next week"
            onClick={() => setMonday(addDays(monday, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-2 text-xs font-semibold text-foreground">
            {formatDate(dates[0])} – {formatDate(dates[6])}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className={cn("rounded-md border px-2 py-0.5 font-semibold",
            summary.unscheduled > 0
              ? "border-amber-500/40 bg-amber-500/10 text-amber-900"
              : "border-border bg-muted text-muted-foreground")}>
            {summary.unscheduled} without a schedule
          </span>
          <span className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 font-semibold text-blue-800">
            {summary.awaySomeDay} away this week
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Person</th>
              {dates.map((d, i) => (
                <th key={d} className={cn("px-2 py-2 text-center", d === today && "bg-primary/5 text-primary")}>
                  <span className="block">{DAY_SHORT[i]}</span>
                  <span className="block font-medium tabular-nums normal-case tracking-normal">{d.slice(8)}</span>
                </th>
              ))}
              {canEdit && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((p) => {
              const s = scheduleOf.get(p.userId);
              const theirLeave = leaveOf.get(p.userId) ?? [];
              const open = editing === p.userId;
              return (
                <PersonRow key={p.userId} person={p} teams={teamsOf.get(p.userId) ?? []} schedule={s}
                  cells={dates.map((d) => ({ date: d, cell: cellFor(d, s, theirLeave) }))} today={today}
                  canEdit={canEdit} open={open} onToggle={() => setEditing(open ? null : p.userId)} />
              );
            })}
          </tbody>
        </table>
      </div>

      {!canEdit && (
        <p className="text-[11px] text-muted-foreground">
          Schedules are set by management. If a shift here is wrong, tell your manager — attendance
          judges every day against it.
        </p>
      )}
    </div>
  );
}

function PersonRow({ person, teams, schedule, cells, today, canEdit, open, onToggle }: {
  person: AgencyPerson;
  teams: string[];
  schedule: WorkSchedule | undefined;
  cells: { date: string; cell: ScheduleCell }[];
  today: string;
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={cn(!schedule && "bg-amber-500/5")}>
        <td className="px-3 py-2 align-top">
          <Link to={`/app/people/${person.userId}`}
            className="block truncate font-medium text-foreground underline-offset-2 hover:underline">
            {person.name}
          </Link>
          <span className="block truncate text-[11px] text-muted-foreground">
            {teams.length ? teams.join(", ") : "No team"}
            {schedule && ` · ${zoneAbbreviation(schedule.timezone)}`}
          </span>
        </td>
        {cells.map(({ date, cell }) => (
          <td key={date} className={cn("px-2 py-2 text-center align-top", date === today && "bg-primary/5")}>
            <Cell cell={cell} />
          </td>
        ))}
        {canEdit && (
          <td className="px-2 py-2 text-right align-top">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onToggle}
              aria-expanded={open} aria-label={`${open ? "Close" : "Edit"} schedule for ${person.name}`}>
              <Pencil className="mr-1 h-3 w-3" aria-hidden /> {open ? "Close" : schedule ? "Edit" : "Set"}
            </Button>
          </td>
        )}
      </tr>
      {open && canEdit && (
        <tr className="bg-muted/30">
          <td colSpan={cells.length + 2} className="px-3 py-3">
            <ScheduleEditor userId={person.userId} schedule={schedule} onSaved={onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}

function Cell({ cell }: { cell: ScheduleCell }) {
  switch (cell.kind) {
    case "shift":
      return (
        <span className="inline-block whitespace-nowrap rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
          {prettyTime(cell.start)}–{prettyTime(cell.end)}
        </span>
      );
    case "leave":
      return (
        <span className="inline-block max-w-[9rem] truncate rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-800"
          title={cell.label}>
          {cell.label}
        </span>
      );
    case "off":
      return <span className="text-[11px] text-muted-foreground">Off</span>;
    case "unscheduled":
      return <span className="text-[11px] font-medium text-amber-800">—</span>;
  }
}
