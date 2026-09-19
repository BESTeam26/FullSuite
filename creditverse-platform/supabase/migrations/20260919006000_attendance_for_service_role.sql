-- attendance_for, readable by the reward sweep.
--
-- Dee, 2026-09-19: "Build the quarter-close reward evaluator as an Edge
-- Function that imports and uses the SAME canonical attendance scoring
-- engine… Do not duplicate the attendance scoring logic in SQL."
--
-- The engine needs the same attendance facts the app reads, and
-- `attendance_for` is SECURITY DEFINER scoped on auth.uid() — a session-less
-- caller sees nobody. Rather than a second derivation for the sweep (the
-- duplicate Dee forbade), the ONE function gains a branch that only the
-- service role, with no user session, can take. Every authenticated call is
-- byte-for-byte unchanged.
--
-- GENERATED from the live definition by supabase/scripts/gen-attendance-for.mjs
-- with a single string replacement, because rewriting a long SQL function from
-- a read of it is how branches get dropped — it has happened three times in
-- this repository and is not happening a fourth.

CREATE OR REPLACE FUNCTION public.attendance_for(p_from date, p_to date)
 RETURNS TABLE(user_id uuid, day date, scheduled boolean, on_leave boolean, leave_label text, first_in timestamp with time zone, last_out timestamp with time zone, work_minutes integer, break_minutes integer, lunch_minutes integer, late_minutes integer, overbreak_minutes integer, overlunch_minutes integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (
    select p_from as from_d, p_to as to_d
     where p_to >= p_from and p_to - p_from < 62   -- bounded, always (rule 7)
  ),
  visible_people as (
    select am.user_id, am.agency_id
      from public.agency_memberships am
     where am.status = 'active'
       and public.is_staff_of(am.agency_id)
       and (
         (am.user_id = auth.uid()
             /* The quarter-close reward sweep runs with NO user session, as
                the service role. It must see everybody, and nothing an
                authenticated caller can do reaches this branch: auth.uid() is
                never null inside the app. */
             or (auth.uid() is null and current_user = 'service_role'))
         or public.is_manager_of(am.agency_id)
         or exists (
           select 1
             from public.team_memberships lead_m
             join public.team_memberships member_m on member_m.team_id = lead_m.team_id
            where lead_m.user_id = auth.uid() and lead_m.is_lead
              and member_m.user_id = am.user_id
         )
       )
  ),
  days as (
    select p.user_id, p.agency_id, d::date as day
      from visible_people p, bounds b, generate_series(b.from_d, b.to_d, interval '1 day') d
  ),
  with_schedule as (
    select d.*, s.work_days, s.shift_start, s.shift_end, s.lunch_minutes as lunch_allowed,
           s.break_minutes as break_allowed, s.grace_minutes, s.timezone
      from days d
      left join lateral (
        select * from public.work_schedules ws
         where ws.user_id = d.user_id and ws.effective_from <= d.day
         order by ws.effective_from desc limit 1
      ) s on true
  ),
  with_time as (
    select w.*,
           t.first_in, t.last_out, t.work_min, t.break_min, t.lunch_min
      from with_schedule w
      left join lateral (
        select min(te.started_at) filter (where te.kind = 'work') as first_in,
               max(te.ended_at)   filter (where te.kind = 'work') as last_out,
               coalesce(sum(coalesce(te.duration_minutes,
                 floor(extract(epoch from (now() - te.started_at)) / 60)::int))
                 filter (where te.kind = 'work'), 0)::int as work_min,
               coalesce(sum(coalesce(te.duration_minutes,
                 floor(extract(epoch from (now() - te.started_at)) / 60)::int))
                 filter (where te.kind = 'break'), 0)::int as break_min,
               coalesce(sum(coalesce(te.duration_minutes,
                 floor(extract(epoch from (now() - te.started_at)) / 60)::int))
                 filter (where te.kind = 'lunch'), 0)::int as lunch_min
          from public.time_entries te
         where te.employee_id = w.user_id and te.work_date = w.day
      ) t on true
  ),
  with_leave as (
    select w.*, l.label as leave_label
      from with_time w
      left join lateral (
        select lt.label
          from public.leave_requests lr
          join public.leave_types lt on lt.id = lr.type_id
         where lr.user_id = w.user_id and lr.status = 'approved'
           and w.day between lr.starts_on and lr.ends_on
         limit 1
      ) l on true
  )
  select
    w.user_id, w.day,
    (w.work_days is not null and extract(isodow from w.day)::smallint = any (w.work_days)) as scheduled,
    (w.leave_label is not null) as on_leave,
    w.leave_label,
    w.first_in, w.last_out,
    w.work_min, w.break_min, w.lunch_min,
    /* Late: first work clock-in after shift start + grace, in the schedule's
       own timezone. No schedule, or not a working day, or on leave → 0. */
    case
      when w.work_days is null or w.leave_label is not null
        or extract(isodow from w.day)::smallint <> all (w.work_days)
        or w.first_in is null then 0
      else greatest(0, floor(extract(epoch from (
             w.first_in - ((w.day + w.shift_start) at time zone w.timezone
                           + make_interval(mins => w.grace_minutes)))) / 60)::int)
    end as late_minutes,
    greatest(0, w.break_min - coalesce(w.break_allowed, 0)) as overbreak_minutes,
    greatest(0, w.lunch_min - coalesce(w.lunch_allowed, 0)) as overlunch_minutes,
    case
      when w.leave_label is not null then 'on_leave'
      when w.work_days is null then 'no_schedule'
      when extract(isodow from w.day)::smallint <> all (w.work_days) then 'off'
      when w.first_in is null and w.day < (now() at time zone w.timezone)::date then 'absent'
      when w.first_in is null then 'not_in_yet'
      when w.first_in > ((w.day + w.shift_start) at time zone w.timezone
                         + make_interval(mins => w.grace_minutes)) then 'late'
      else 'present'
    end as status
  from with_leave w
  order by w.user_id, w.day
$function$
;
