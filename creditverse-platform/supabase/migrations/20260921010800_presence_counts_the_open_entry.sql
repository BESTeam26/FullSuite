-- "Today" read "—" for everybody who was still clocked in, because it summed
-- only CLOSED work entries — and nobody closes their day until they leave.
-- The open entry's elapsed minutes count too; they are what "so far today"
-- means. Pay is unaffected: `payable_minutes` still sums closed entries only,
-- which is right, an entry still running has not been worked yet.
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
  firsts as (
    select employee_id, min(started_at) first_in,
           coalesce(sum(duration_minutes) filter (where kind = 'work' and ended_at is not null), 0)::int closed_work
      from today
     where started_at >= (now() at time zone 'America/New_York')::date
     group by employee_id
  ),
  leave as (
    select distinct on (lr.user_id) lr.user_id, lt.label as label
      from public.leave_requests lr
      join public.leave_types lt on lt.id = lr.type_id
      join scope s on s.user_id = lr.user_id
     where lr.status = 'approved'
       and (now() at time zone 'America/New_York')::date between lr.starts_on and lr.ends_on
     order by lr.user_id, lr.starts_on desc
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
           when l.user_id is not null and o.employee_id is null then 'on_leave'
           when o.kind = 'work'  then 'clocked_in'
           when o.kind = 'break' then 'on_break'
           when o.kind = 'lunch' then 'on_lunch'
           when lc.ended_at is not null and lc.ended_at >= now() - interval '14 hours' then 'clocked_out'
           else 'not_in'
         end,
         coalesce(o.started_at, lc.ended_at),
         f.first_in,
         (coalesce(f.closed_work, 0)
          + case when o.kind = 'work'
                 then greatest(0, (extract(epoch from (now() - o.started_at)) / 60)::int)
                 else 0 end)::int,
         nullif(btrim(coalesce(o.task_note, '')), ''),
         tm.name, am.job_title, l.label
    from scope s
    left join open_entry o   on o.employee_id = s.user_id
    left join last_closed lc on lc.employee_id = s.user_id
    left join firsts f       on f.employee_id = s.user_id
    left join leave l        on l.user_id = s.user_id
    left join team tm        on tm.user_id = s.user_id
    left join public.agency_memberships am on am.user_id = s.user_id
$function$;
