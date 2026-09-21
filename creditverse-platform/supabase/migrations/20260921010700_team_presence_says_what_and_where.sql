-- Presence, as Dee's 2026-09-21 board draws it: status, clock-in, what they
-- are on, the team they belong to, and today's total — plus "On leave", which
-- is not a clock state at all but is the answer a manager wants beside the
-- others.
--
-- Still one bounded call over records that already exist: the clock
-- (`time_entries`), the person's team, their position, and approved leave.
-- `managed_people()` decides who appears, exactly as before.

drop function if exists public.team_presence();

create or replace function public.team_presence()
returns table (
  user_id       uuid,
  state         text,        -- clocked_in | on_break | on_lunch | clocked_out | not_in | on_leave
  since         timestamptz,
  first_in      timestamptz,
  work_minutes  integer,
  activity      text,        -- what the open entry says they are on
  team_name     text,
  position_title text,
  leave_label   text
)
language sql stable security definer set search_path = public as $function$
  with scope as (select mp.user_id from public.managed_people() mp),
  today as (
    select t.employee_id, t.kind, t.started_at, t.ended_at, t.duration_minutes,
           t.task_note, t.division_id
      from public.time_entries t
      join scope s on s.user_id = t.employee_id
     where t.ended_at is null
        or t.work_date >= (now() at time zone 'America/New_York')::date - 1
  ),
  open_entry as (
    select distinct on (employee_id) employee_id, kind, started_at, task_note, division_id
      from today where ended_at is null
     order by employee_id, started_at desc
  ),
  last_closed as (
    select distinct on (employee_id) employee_id, ended_at
      from today where ended_at is not null
     order by employee_id, ended_at desc
  ),
  firsts as (
    select employee_id, min(started_at) first_in,
           coalesce(sum(duration_minutes) filter (where kind = 'work' and ended_at is not null), 0)::int work_minutes
      from today
     where started_at >= (now() at time zone 'America/New_York')::date
     group by employee_id
  ),
  leave as (
    select distinct on (lr.user_id) lr.user_id, lt.label as label, lr.ends_on
      from public.leave_requests lr
      join public.leave_types lt on lt.id = lr.type_id
      join scope s on s.user_id = lr.user_id
     where lr.status = 'approved'
       and (now() at time zone 'America/New_York')::date between lr.starts_on and lr.ends_on
     order by lr.user_id, lr.starts_on desc
  ),
  /* The team a person is shown under: the one they lead if they lead one,
     otherwise their first by name. A person on several teams is shown under
     one of them here; the roster is where the full picture lives. */
  team as (
    select distinct on (m.user_id) m.user_id, t.name
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null and not t.is_fixture
      join scope s on s.user_id = m.user_id
     order by m.user_id, m.is_lead desc, t.name
  )
  select s.user_id,
         case
           when l.user_id is not null and o.employee_id is null then 'on_leave'
           when o.kind = 'work'  then 'clocked_in'
           when o.kind = 'break' then 'on_break'
           when o.kind = 'lunch' then 'on_lunch'
           when lc.ended_at is not null and lc.ended_at >= now() - interval '14 hours' then 'clocked_out'
           else 'not_in'
         end as state,
         coalesce(o.started_at, lc.ended_at) as since,
         f.first_in,
         coalesce(f.work_minutes, 0) as work_minutes,
         nullif(btrim(coalesce(o.task_note, '')), '') as activity,
         tm.name as team_name,
         am.job_title as position_title,
         l.label as leave_label
    from scope s
    left join open_entry o  on o.employee_id = s.user_id
    left join last_closed lc on lc.employee_id = s.user_id
    left join firsts f      on f.employee_id = s.user_id
    left join leave l       on l.user_id = s.user_id
    left join team tm       on tm.user_id = s.user_id
    left join public.agency_memberships am on am.user_id = s.user_id
$function$;

revoke execute on function public.team_presence() from public, anon;
grant execute on function public.team_presence() to authenticated;
comment on function public.team_presence() is
  'Live clock state for the people the caller manages: working / on break / on lunch / clocked out / not in / on leave, with what they are on, their team, position and today''s minutes. Scope is managed_people().';
