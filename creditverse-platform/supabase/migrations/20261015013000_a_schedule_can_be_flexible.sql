-- A schedule can be flexible: hours for pay, no start time to be late for (D-028).
--
-- Dee, 2026-10-15: "They have FREE schedule and open overtime as long as
-- their work is aligned with the hours." The payroll engine prices a monthly
-- package from the scheduled days and hours (and 8 scheduled hours is the
-- overtime line, D-027); the attendance engine scored lateness against the
-- same shift start. One column tells them apart:
--
--   schedule_kind = 'fixed'     today's rule, unchanged
--   schedule_kind = 'flexible'  the days and hours are the pay basis and the
--                               overtime line; attendance records presence,
--                               absence and hours — never late, never a
--                               "time to clock in" reminder. A scheduled day
--                               with no clock-in is still absent.
--
-- set_work_schedule gains p_kind (default 'fixed'; the one old signature is
-- dropped so PostgREST has one function to pick). The four people Dee named
-- are flexible from their current schedule row.
--
-- Cost impact: none.

begin;

alter table public.work_schedules
  add column if not exists schedule_kind text not null default 'fixed'
  check (schedule_kind in ('fixed', 'flexible'));
comment on column public.work_schedules.schedule_kind is
  'fixed: shift start and grace decide lateness. flexible: the hours are the pay basis only; attendance never marks late (D-028, 2026-10-15).';

drop function if exists public.set_work_schedule(uuid, smallint[], time, time, integer, integer, integer, text, date);

CREATE OR REPLACE FUNCTION public.set_work_schedule(p_user uuid, p_work_days smallint[], p_shift_start time without time zone, p_shift_end time without time zone, p_lunch_minutes integer, p_break_minutes integer, p_grace_minutes integer, p_timezone text, p_effective_from date DEFAULT ((now() AT TIME ZONE 'America/New_York'::text))::date, p_kind text DEFAULT 'fixed'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency uuid;
  v_actor text;
  v_id uuid;
  v_before text;
begin
  select agency_id into v_agency
    from public.agency_memberships
   where user_id = p_user and status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'That person is not an active member of the agency';
  end if;
  /* Management capability, INSIDE the caller's scope. A division manager
     sets schedules for their division, not the company; a team lead reads
     their team's schedule but does not set it (§20b). */
  if not public.is_manager_of(v_agency) then
    raise exception 'Setting a schedule needs management access' using errcode = '42501';
  end if;
  if not public.may_view_workforce_record(v_agency, p_user) then
    raise exception 'That person is outside your management scope' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone: %', p_timezone;
  end if;

  select 'days ' || work_days::text || ' ' || shift_start || '–' || shift_end
    into v_before
    from public.work_schedules
   where user_id = p_user and effective_from <= p_effective_from
   order by effective_from desc limit 1;

  insert into public.work_schedules
        (agency_id, user_id, work_days, shift_start, shift_end,
         lunch_minutes, break_minutes, grace_minutes, timezone,
         effective_from, created_by, schedule_kind)
  values (v_agency, p_user, p_work_days, p_shift_start, p_shift_end,
          p_lunch_minutes, p_break_minutes, p_grace_minutes, p_timezone,
          p_effective_from, auth.uid(), p_kind)
  on conflict (user_id, effective_from) do update
    set work_days = excluded.work_days, shift_start = excluded.shift_start,
        shift_end = excluded.shift_end, lunch_minutes = excluded.lunch_minutes,
        break_minutes = excluded.break_minutes, grace_minutes = excluded.grace_minutes,
        timezone = excluded.timezone, created_by = excluded.created_by, schedule_kind = excluded.schedule_kind
  returning id into v_id;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name,
         action, field, previous_value, new_value, visibility)
  values (v_agency, 'work_schedule', p_user::text, auth.uid(), v_actor,
          'Work schedule set', 'schedule', v_before,
          'days ' || p_work_days::text || ' ' || p_shift_start || '–' || p_shift_end
            || case when p_kind = 'flexible' then ' (flexible)' else '' end
            || ' from ' || p_effective_from,
          'bes_internal');
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.attendance_for(p_from date, p_to date)
 RETURNS TABLE(user_id uuid, day date, scheduled boolean, on_leave boolean, leave_label text, first_in timestamp with time zone, last_out timestamp with time zone, work_minutes integer, break_minutes integer, lunch_minutes integer, late_minutes integer, overbreak_minutes integer, overlunch_minutes integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (
    select p_from as from_d, p_to as to_d
     where p_to >= p_from and p_to - p_from < 100  -- bounded, always (rule 7) — and wide enough for one quarter (92 days)
  ),
  visible_people as (
    select am.user_id, am.agency_id
      from public.agency_memberships am
     where am.status = 'active'
       /* Dee, 2026-09-20: "The only ones who are not required to track hours
          are Dee and Aaron." Somebody exempt has no schedule BY DESIGN, so
          leaving them in produced a "no schedule" row against their name
          every single day — a standing reminder to fix something that is not
          broken. They are not absent; they are not in this question. */
       and am.time_tracking_required
       and public.is_staff_of(am.agency_id)
       and (
         (am.user_id = auth.uid()
             /* The quarter-close reward sweep runs with NO user session, as
                the service role. It must see everybody, and nothing an
                authenticated caller can do reaches this branch: auth.uid() is
                never null inside the app. */
             or (auth.uid() is null and current_user = 'service_role'))
         /* Time visibility (20261003005000): organization-wide for owners, the
            operations seat and the payroll capability; otherwise the people
            the caller's placements cover. Never "any manager = everyone". */
         or am.agency_id in (select public.time_wide_agency_ids())
         or am.user_id in (select public.placement_people())
       )
  ),
  days as (
    select p.user_id, p.agency_id, d::date as day
      from visible_people p, bounds b, generate_series(b.from_d, b.to_d, interval '1 day') d
  ),
  with_schedule as (
    select d.*, s.work_days, s.shift_start, s.shift_end, s.lunch_minutes as lunch_allowed,
           s.break_minutes as break_allowed, s.grace_minutes, s.timezone, s.schedule_kind
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
      /* A flexible schedule has hours, not a start time (D-028): never late. */
      when w.schedule_kind = 'flexible' then 0
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
      when w.schedule_kind <> 'flexible'
       and w.first_in > ((w.day + w.shift_start) at time zone w.timezone
                         + make_interval(mins => w.grace_minutes)) then 'late'
      else 'present'
    end as status
  from with_leave w
  order by w.user_id, w.day
$function$
;

CREATE OR REPLACE FUNCTION public.reminders_sweep(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_local timestamp;
  v_today date;
  v_time  time;
  v_cutoff time;
  v_eod_at time;
  v_sent integer := 0;
begin
  for r in
    select m.user_id, m.agency_id, m.time_tracking_required, m.eod_required,
           s.shift_start, s.shift_end, s.grace_minutes, s.timezone, s.work_days, s.schedule_kind,
           a.eod_cutoff_local, a.eod_timezone
      from public.agency_memberships m
      join public.agencies a on a.id = m.agency_id
      join lateral (
        select * from public.work_schedules ws
         where ws.user_id = m.user_id
           and ws.effective_from <= (p_now at time zone coalesce(ws.timezone, 'America/New_York'))::date
         order by ws.effective_from desc limit 1
      ) s on true
      join public.profiles p on p.id = m.user_id and not coalesce(p.is_fixture, false)
     where m.status = 'active'
       and m.workforce_managed
  loop
    v_local := p_now at time zone r.timezone;
    v_today := v_local::date;
    v_time  := v_local::time;

    /* A day off, or approved leave, is not a day to be reminded on. */
    continue when not (extract(isodow from v_local)::smallint = any (r.work_days));
    continue when exists (
      select 1 from public.leave_requests l
       where l.user_id = r.user_id and l.status = 'approved'
         and v_today between l.starts_on and l.ends_on);

    /* Clock in: from grace end until two hours after the shift began — later
       than that is attendance's question, not a reminder's. */
    if r.time_tracking_required
       and r.schedule_kind <> 'flexible'   -- D-028: no start time to be late for
       and v_time >= r.shift_start + make_interval(mins => r.grace_minutes)
       and v_time <  r.shift_start + interval '2 hours'
       and not exists (select 1 from public.time_entries t
                        where t.employee_id = r.user_id and t.work_date = v_today and t.kind = 'work')
       and not exists (select 1 from public.reminder_marks k
                        where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'clock_in')
    then
      insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'clock_in');
      insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      values (r.user_id, r.agency_id, 'reminder', 'time_clock', v_today::text || ':clock_in', 'My Time',
              'Time to clock in',
              'Your shift started at ' || to_char(r.shift_start, 'FMHH12:MI AM') || ' ET and you are not clocked in yet. Clock in on My Time.',
              'bes_internal');
      v_sent := v_sent + 1;
    end if;

    /* Clock out: the shift has ended and a work timer is still running. */
    if r.time_tracking_required
       and v_time >= r.shift_end
       and exists (select 1 from public.time_entries t
                    where t.employee_id = r.user_id and t.work_date = v_today and t.kind = 'work' and t.ended_at is null)
       and not exists (select 1 from public.reminder_marks k
                        where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'clock_out')
    then
      insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'clock_out');
      insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      values (r.user_id, r.agency_id, 'reminder', 'time_clock', v_today::text || ':clock_out', 'My Time',
              'Your shift has ended — clock out',
              'Your shift ended at ' || to_char(r.shift_end, 'FMHH12:MI AM') || ' ET and your timer is still running. Clock out on My Time when you finish.',
              'bes_internal');
      v_sent := v_sent + 1;
    end if;

    /* End of Day: at the cutoff minus 30 minutes when the agency has one,
       otherwise at the end of the shift; a final nudge at the cutoff. */
    if r.eod_required then
      v_cutoff := r.eod_cutoff_local;
      v_eod_at := coalesce(v_cutoff - interval '30 minutes', r.shift_end);
      if v_time >= v_eod_at
         and not exists (select 1 from public.eod_submissions e
                          where e.employee_id = r.user_id and e.work_date = v_today and e.submitted_at is not null)
         and not exists (select 1 from public.reminder_marks k
                          where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'eod')
      then
        insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'eod');
        insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
        values (r.user_id, r.agency_id, 'reminder', 'eod_day', v_today::text || ':eod', 'End of Day',
                'Submit your End of Day',
                'Your EOD for ' || to_char(v_today, 'FMMon DD') || ' is not submitted yet.' ||
                case when v_cutoff is not null then ' It is due by ' || to_char(v_cutoff, 'FMHH12:MI AM') || ' ET.' else ' Submit it before you finish for the day.' end,
                'bes_internal');
        v_sent := v_sent + 1;
      end if;
      if v_cutoff is not null and v_time >= v_cutoff
         and not exists (select 1 from public.eod_submissions e
                          where e.employee_id = r.user_id and e.work_date = v_today and e.submitted_at is not null)
         and not exists (select 1 from public.reminder_marks k
                          where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'eod_final')
      then
        insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'eod_final');
        insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
        values (r.user_id, r.agency_id, 'reminder', 'eod_day', v_today::text || ':eod_final', 'End of Day',
                'Your End of Day is overdue',
                'The ' || to_char(v_cutoff, 'FMHH12:MI AM') || ' ET cutoff has passed and your EOD for ' || to_char(v_today, 'FMMon DD') || ' is still not submitted.',
                'bes_internal');
        v_sent := v_sent + 1;
      end if;
    end if;
  end loop;
  return v_sent;
end;
$function$
;


/* Dee's four, 2026-10-15: flexible from the row in force. */
update public.work_schedules s set schedule_kind = 'flexible'
  from public.profiles p
 where p.id = s.user_id
   and p.full_name in ('Danicko Carl P. Macasiab', 'Daniel Charles P. Macasiab', 'Ivan L. Olympia', 'Naima Kaori A. Gallardo')
   and s.effective_from = (select max(effective_from) from public.work_schedules x where x.user_id = s.user_id and x.effective_from <= current_date);

commit;
