-- A manager sees the DAY's break and lunch, not the current sitting.
--
-- Dee, 2026-09-21, locking the accumulated-timer behaviour:
--
--   "MANAGER PRESENCE BOARD — show accumulated usage too:
--      Julius Rivera · On Break · 34m today · ⚠ 4m over
--    Do not show only the duration of the current segment."
--
-- The board showed `since`, so a third break of four minutes read as four
-- minutes. That is the same defect the agent's own timer had: each segment
-- looks harmless while the day is already over the allowance. The figure a
-- manager needs is the one payroll uses.
--
-- ── WHAT IS ADDED ─────────────────────────────────────────────────────────
--
-- `break_minutes` / `lunch_minutes`: everything of that kind on TODAY's
-- Eastern workday, closed segments plus the live span of an open one.
-- `break_allowance_minutes` / `lunch_allowance_minutes`: from the person's
-- effective schedule, null when they have none — the board then reports usage
-- without claiming an allowance nobody is paid for.
--
-- ── AND ONE CORRECTION CARRIED THROUGH ────────────────────────────────────
--
-- `work_minutes` grouped by `started_at >= today's Eastern midnight`. Every
-- other workforce figure now groups by `work_date`, which the server stamps
-- from Eastern (20260921014000) and which `payable_minutes` pays on. An entry
-- started a minute before Eastern midnight and belonging to yesterday's shift
-- would have been counted in both. It groups by `work_date` here too, so the
-- board, My Time and the payslip count one day the same way.
--
-- Cost: no new query. The same single `team_presence()` call the board
-- already makes, over rows it already reads.

drop function if exists public.team_presence();

create function public.team_presence()
returns table(
  user_id uuid, state text, exception text,
  since timestamptz, first_in timestamptz, work_minutes integer,
  break_minutes integer, lunch_minutes integer,
  break_allowance_minutes integer, lunch_allowance_minutes integer,
  activity text, team_name text, position_title text, leave_label text)
language sql stable security definer set search_path to 'public' as $function$
  with scope as (select mp.user_id from public.managed_people() mp),
  et_today as (select (now() at time zone 'America/New_York')::date as d),
  today as (
    select t.employee_id, t.kind, t.started_at, t.ended_at, t.duration_minutes,
           t.task_note, t.work_date
      from public.time_entries t
      join scope s on s.user_id = t.employee_id
     where t.ended_at is null
        or t.work_date >= (select d from et_today) - 1
  ),
  open_entry as (
    select distinct on (employee_id) employee_id, kind, started_at, task_note
      from today where ended_at is null order by employee_id, started_at desc
  ),
  last_closed as (
    select distinct on (employee_id) employee_id, ended_at
      from today where ended_at is not null order by employee_id, ended_at desc
  ),
  /* Today's Eastern workday, by the column the server stamps and payroll pays
     on — never by the reader's calendar or the entry's raw start. */
  worked as (
    select employee_id,
           min(started_at) filter (where kind = 'work') as first_started,
           coalesce(sum(duration_minutes) filter (where kind = 'work'  and ended_at is not null), 0)::int closed_work,
           coalesce(sum(duration_minutes) filter (where kind = 'break' and ended_at is not null), 0)::int closed_break,
           coalesce(sum(duration_minutes) filter (where kind = 'lunch' and ended_at is not null), 0)::int closed_lunch
      from today
     where work_date = (select d from et_today)
     group by employee_id
  ),
  day as (
    select a.user_id, a.status, a.first_in, a.leave_label
      from public.attendance_for((select d from et_today), (select d from et_today)) a
  ),
  /* The effective schedule: shift end tells us whether the shift is over, and
     the allowances are what the day's rest is measured against. */
  shift as (
    select distinct on (ws.user_id)
           ws.user_id, ws.shift_end, ws.timezone, ws.break_minutes, ws.lunch_minutes
      from public.work_schedules ws
      join scope s on s.user_id = ws.user_id
     where ws.effective_from <= (select d from et_today)
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
           coalesce(wk.closed_break, 0) as closed_break,
           coalesce(wk.closed_lunch, 0) as closed_lunch,
           wk.first_started,
           d.status as day_status, d.first_in as day_first_in, d.leave_label,
           (sh.shift_end is not null
            and now() > ((now() at time zone coalesce(sh.timezone, 'America/New_York'))::date + sh.shift_end)
                          at time zone coalesce(sh.timezone, 'America/New_York')) as shift_over,
           sh.break_minutes as break_allowance, sh.lunch_minutes as lunch_allowance,
           tm.name as team_name, am.job_title as position_title
      from scope s
      left join open_entry o   on o.employee_id = s.user_id
      left join last_closed lc on lc.employee_id = s.user_id
      left join worked wk      on wk.employee_id = s.user_id
      left join day d          on d.user_id = s.user_id
      left join shift sh       on sh.user_id = s.user_id
      left join team tm        on tm.user_id = s.user_id
      left join public.agency_memberships am on am.user_id = s.user_id
  ),
  /* The open segment's live span, added to whichever total it belongs to. */
  live as (
    select x.*,
           case when x.open_started is null then 0
                else greatest(0, (extract(epoch from (now() - x.open_started)) / 60)::int) end as open_min
      from shaped x
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
    case
      when x.open_kind is null and x.first_started is null then null
      when x.day_status = 'on_leave' then 'leave_conflict'
      when x.day_status in ('off', 'no_schedule') then 'unscheduled_shift'
      else null
    end,
    coalesce(x.open_started, x.last_out),
    coalesce(x.day_first_in, x.first_started),
    (x.closed_work  + case when x.open_kind = 'work'  then x.open_min else 0 end)::int,
    (x.closed_break + case when x.open_kind = 'break' then x.open_min else 0 end)::int,
    (x.closed_lunch + case when x.open_kind = 'lunch' then x.open_min else 0 end)::int,
    x.break_allowance, x.lunch_allowance,
    nullif(btrim(coalesce(x.task_note, '')), ''),
    x.team_name, x.position_title, x.leave_label
  from live x
$function$;

revoke execute on function public.team_presence() from public, anon;
grant execute on function public.team_presence() to authenticated;

comment on function public.team_presence() is
  'Who is on right now, for managed_people() only. Break and lunch are the Eastern workday''s accumulated totals with the open segment included, against the schedule''s allowance — never just the current sitting (Dee, 2026-09-21).';
