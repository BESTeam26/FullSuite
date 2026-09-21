-- Who is on right now — for the people who manage them.
--
-- Dee, 2026-09-21: "I also wanna see a way the admin / lead / management to
-- see if the agents are online or clocked in or on break or on lunch from our
-- view. I don't see it now."
--
-- Nothing new is recorded. Presence is READ off the canonical clock
-- (`time_entries`): an open entry of kind work / break / lunch is the person's
-- state this minute; a closed one says when they left; none today says they
-- have not clocked in. `time_entries` itself is readable only by the person
-- and by `is_manager_of()`, so a team lead could not read their own team's
-- clocks — this function answers for exactly the people `managed_people()`
-- already grants (own team for a lead, the division for a division manager,
-- the company for the owner), and nobody else (rule 20b).
--
-- Cost: one bounded read per open management screen, on demand and on
-- focus. No polling loop, no realtime subscription.

create or replace function public.team_presence()
returns table (
  user_id      uuid,
  state        text,          -- clocked_in | on_break | on_lunch | clocked_out | not_in
  since        timestamptz,   -- when the current state began (open entry start, or last clock-out)
  first_in     timestamptz,   -- today's first clock-in, if any
  work_minutes integer        -- closed work minutes today (the open entry is not counted here)
)
language sql stable security definer set search_path = public as $function$
  with scope as (
    select mp.user_id from public.managed_people() mp
  ),
  today as (
    /* A day is the person's own working day: entries whose work_date is
       today OR that are still open (an overnight open entry is still "on"). */
    select t.employee_id, t.kind, t.started_at, t.ended_at, t.duration_minutes
      from public.time_entries t
      join scope s on s.user_id = t.employee_id
     where t.ended_at is null or t.work_date >= (now() at time zone 'America/New_York')::date - 1
  ),
  open_entry as (
    select distinct on (employee_id) employee_id, kind, started_at
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
  )
  select s.user_id,
         case o.kind
           when 'work'  then 'clocked_in'
           when 'break' then 'on_break'
           when 'lunch' then 'on_lunch'
           else case when lc.ended_at is not null and lc.ended_at >= now() - interval '14 hours' then 'clocked_out' else 'not_in' end
         end as state,
         coalesce(o.started_at, lc.ended_at) as since,
         f.first_in,
         coalesce(f.work_minutes, 0) as work_minutes
    from scope s
    left join open_entry o on o.employee_id = s.user_id
    left join last_closed lc on lc.employee_id = s.user_id
    left join firsts f on f.employee_id = s.user_id
$function$;

revoke execute on function public.team_presence() from public, anon;
grant execute on function public.team_presence() to authenticated;
comment on function public.team_presence() is
  'Live clock state (clocked in / on break / on lunch / clocked out / not in) for the people the caller manages, read off time_entries. Scope is managed_people().';
