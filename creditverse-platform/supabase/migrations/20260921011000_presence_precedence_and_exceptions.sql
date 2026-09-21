-- The presence precedence, locked (Dee, 2026-09-21), and the two exceptions
-- it must never hide.
--
-- ── ONE ORDER, SO TWO BADGES CAN NEVER CONTRADICT EACH OTHER ──────────────
--
--   1. A LIVE CLOCK ENTRY always shows as the live state — Working, On break,
--      On lunch. Somebody who is on the clock is on the clock, whatever the
--      calendar says. What the calendar says is carried BESIDE it:
--        · on a scheduled day off, or with no schedule → 'unscheduled_shift'
--        · on approved leave                          → 'leave_conflict'
--   2. With no live entry, in this order, first match wins:
--        a. approved leave                     → on_leave
--        b. any time logged today              → clocked_out
--        c. day off / no schedule              → off / no_schedule
--        d. scheduled, shift still running     → not_in_yet
--        e. scheduled, shift already ended     → absent
--
-- Dee's rule reads "Approved Leave → Day Off / No Schedule → live clock →
-- Clocked Out → Not In Yet → Absent", with the exception that a live clock
-- must not silently coexist with leave or a day off. This is that rule with
-- the exception made explicit rather than left to the reader: leave and day
-- off do not SUPPRESS a live clock, they ANNOTATE it, because a manager who
-- sees "On leave" for somebody currently working has been told a falsehood,
-- and a manager who sees "Working" with nothing beside it has been told half
-- a truth. Neither state overwrites the other; both are on the row.
--
-- `exception` is derived, never stored, and never an authorization input. It
-- exists so exceptions surface for review instead of being smoothed away.

drop function if exists public.team_presence();

create or replace function public.team_presence()
returns table (
  user_id uuid, state text, exception text, since timestamptz, first_in timestamptz,
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
           min(started_at) first_started,
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
  ),
  shaped as (
    select s.user_id,
           o.kind as open_kind, o.started_at as open_started, o.task_note,
           lc.ended_at as last_out,
           coalesce(wk.closed_work, 0) as closed_work,
           wk.first_started,
           d.status as day_status, d.first_in as day_first_in, d.leave_label,
           (sh.shift_end is not null
            and now() > ((now() at time zone coalesce(sh.timezone, 'America/New_York'))::date + sh.shift_end)
                          at time zone coalesce(sh.timezone, 'America/New_York')) as shift_over,
           tm.name as team_name, am.job_title as position_title
      from scope s
      left join open_entry o   on o.employee_id = s.user_id
      left join last_closed lc on lc.employee_id = s.user_id
      left join worked wk      on wk.employee_id = s.user_id
      left join day d          on d.user_id = s.user_id
      left join shift sh       on sh.user_id = s.user_id
      left join team tm        on tm.user_id = s.user_id
      left join public.agency_memberships am on am.user_id = s.user_id
  )
  select
    x.user_id,
    case
      when x.open_kind = 'work'  then 'clocked_in'
      when x.open_kind = 'break' then 'on_break'
      when x.open_kind = 'lunch' then 'on_lunch'
      when x.day_status = 'on_leave' then 'on_leave'
      when x.first_started is not null then 'clocked_out'
      when x.day_status in ('off', 'no_schedule') then x.day_status
      when x.shift_over then 'absent'
      when x.day_status = 'absent' then 'absent'
      else 'not_in_yet'
    end,
    /* Both exceptions apply to time logged, open or closed: a shift somebody
       actually worked is the thing management needs to see. */
    case
      when x.open_kind is null and x.first_started is null then null
      when x.day_status = 'on_leave' then 'leave_conflict'
      when x.day_status in ('off', 'no_schedule') then 'unscheduled_shift'
      else null
    end,
    coalesce(x.open_started, x.last_out),
    coalesce(x.day_first_in, x.first_started),
    (x.closed_work
     + case when x.open_kind = 'work'
            then greatest(0, (extract(epoch from (now() - x.open_started)) / 60)::int)
            else 0 end)::int,
    nullif(btrim(coalesce(x.task_note, '')), ''),
    x.team_name, x.position_title, x.leave_label
  from shaped x
$function$;

comment on function public.team_presence() is
  'Live clock state for the people the caller manages, with the attendance engine''s answer for the day when nobody is on the clock, and an `exception` (unscheduled_shift | leave_conflict) where the two disagree. Precedence is locked — see migration 20260921011000. Scope is managed_people().';

revoke execute on function public.team_presence() from public, anon;
grant execute on function public.team_presence() to authenticated;
