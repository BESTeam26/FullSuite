-- Dee, 2026-09-21: "You must show here if they are OFF or leave or Absent."
--
-- The board said "Not in yet" for somebody whose schedule gives them the day
-- off — a manager reading that goes looking for a person who is not supposed
-- to be there. The attendance engine already answers this exact question
-- (`attendance_for`: on_leave · no_schedule · off · absent · not_in_yet ·
-- late · present), so presence now DEFERS to it for anybody who is not
-- currently punched in, rather than deriving a second opinion (rules 2 and 9).
--
-- One addition, and it is a derivation rather than a new rule: the engine
-- only calls a day absent once the day is over, because until then somebody
-- may still arrive. On the live board that is too late to be useful, so a
-- scheduled person who has not clocked in AND whose shift has already ended
-- reads Absent now. It is the same conclusion the engine reaches at midnight,
-- reached when it becomes true.

create or replace function public.team_presence()
returns table (
  user_id uuid, state text, since timestamptz, first_in timestamptz,
  work_minutes integer, activity text, team_name text, position_title text, leave_label text
)
language sql stable security definer set search_path = public as $function$
  with scope as (select mp.user_id from public.managed_people() mp),
  today as (
    select t.employee_id, t.kind, t.started_at, t.ended_at, t.duration_minutes, t.task_note
      from public.time_entries t
      join scope s on s.user_id = t.employee_id
     where t.ended_at is null
        or t.work_date >= (now() at time zone 'America/New_York')::date - 1
  ),
  open_entry as (
    select distinct on (employee_id) employee_id, kind, started_at, task_note
      from today where ended_at is null order by employee_id, started_at desc
  ),
  last_closed as (
    select distinct on (employee_id) employee_id, ended_at
      from today where ended_at is not null order by employee_id, ended_at desc
  ),
  worked as (
    select employee_id,
           coalesce(sum(duration_minutes) filter (where kind = 'work' and ended_at is not null), 0)::int closed_work
      from today
     where started_at >= (now() at time zone 'America/New_York')::date
     group by employee_id
  ),
  /* The day itself, from the one engine that decides what a day was. */
  day as (
    select a.user_id, a.status, a.first_in, a.leave_label
      from public.attendance_for(
             (now() at time zone 'America/New_York')::date,
             (now() at time zone 'America/New_York')::date) a
  ),
  /* Only to know whether the shift is over — never to re-derive the status. */
  shift as (
    select distinct on (ws.user_id) ws.user_id, ws.shift_end, ws.timezone
      from public.work_schedules ws
      join scope s on s.user_id = ws.user_id
     where ws.effective_from <= (now() at time zone 'America/New_York')::date
     order by ws.user_id, ws.effective_from desc
  ),
  team as (
    select distinct on (m.user_id) m.user_id, t.name
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null and not t.is_fixture
      join scope s on s.user_id = m.user_id
     order by m.user_id, m.is_lead desc, t.name
  )
  select s.user_id,
         case
           when o.kind = 'work'  then 'clocked_in'
           when o.kind = 'break' then 'on_break'
           when o.kind = 'lunch' then 'on_lunch'
           when d.status in ('on_leave', 'off', 'no_schedule', 'absent') then d.status
           when d.status = 'not_in_yet' then
             case when sh.shift_end is not null
                       and now() > ((now() at time zone coalesce(sh.timezone, 'America/New_York'))::date + sh.shift_end)
                             at time zone coalesce(sh.timezone, 'America/New_York')
                  then 'absent' else 'not_in_yet' end
           when lc.ended_at is not null then 'clocked_out'
           when d.status is null then 'not_in_yet'
           else 'clocked_out'
         end,
         coalesce(o.started_at, lc.ended_at),
         coalesce(d.first_in, w.first_started),
         (coalesce(wk.closed_work, 0)
          + case when o.kind = 'work'
                 then greatest(0, (extract(epoch from (now() - o.started_at)) / 60)::int)
                 else 0 end)::int,
         nullif(btrim(coalesce(o.task_note, '')), ''),
         tm.name, am.job_title, d.leave_label
    from scope s
    left join open_entry o   on o.employee_id = s.user_id
    left join last_closed lc on lc.employee_id = s.user_id
    left join worked wk      on wk.employee_id = s.user_id
    left join day d          on d.user_id = s.user_id
    left join shift sh       on sh.user_id = s.user_id
    left join team tm        on tm.user_id = s.user_id
    left join lateral (
      select min(started_at) first_started from today t2 where t2.employee_id = s.user_id
         and t2.started_at >= (now() at time zone 'America/New_York')::date
    ) w on true
    left join public.agency_memberships am on am.user_id = s.user_id
$function$;

comment on function public.team_presence() is
  'Live clock state for the people the caller manages — working / on break / on lunch / clocked out — falling back to the attendance engine''s answer for the day (on leave / day off / no schedule / absent / not in yet). Scope is managed_people().';
