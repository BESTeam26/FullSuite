-- Time visibility follows the organization, not a generic manager flag
-- (Dee, 2026-10-03: "A generic management permission must NOT give someone
-- access to every employee's time entries across BES.").
--
-- Before: time_entries, attendance_for, leave_requests and time adjustment
-- requests let anyone with ops.manage read EVERY employee; attendance
-- corrections, schedules-adjacent presence and manager clock-out admitted the
-- agency_admin title. Allyssa (2 people) and Daniel (5) each read all 17.
--
-- Now ONE rule, built only from the canonical placement helpers:
--
--   placement_people()       the people on teams the caller leads, or on any
--                            team inside a department or division where they
--                            hold a live seat (managed_teams() — a division
--                            seat covers its departments and sub-departments).
--                            Several placements are a UNION: Rowell's two
--                            division seats both count.
--   time_wide_agency_ids()   organization-wide: an OWNER, the chief_operations
--                            seat (the executive), or the explicit payroll
--                            capability (payroll.view / payroll.manage) —
--                            payroll processing needs everyone's hours, kept
--                            separate from management placement on purpose.
--                            The agency_admin title alone grants none of it.
--   can_view_time_of(a, u)   self, or wide, or placement.
--   can_manage_time_of(a, u) acting on someone's time (clock them out,
--                            correct hours): placement, owner or the operations
--                            seat — never self. Deciding an adjustment also
--                            accepts payroll.manage, because it is payroll work.
--
-- Applied to: time_entries (My Time, Workforce, Reporting's time source),
-- attendance_for (team attendance and attendance review), leave_requests,
-- time_adjustment_requests + decide_time_adjustment (correction review),
-- attendance_corrections + record_attendance_correction, decide_leave_request,
-- team_presence, manager_clock_out. Payroll keeps its
-- own payroll_people() scope (placement + payroll capability + operations
-- seat) and no payroll calculation changes. may_view_workforce_record and
-- managed_people are NOT changed — they govern goals, rewards, schedules and
-- EOD, which is a separate Workforce question.
--
-- Proven per real persona and per synthetic role in rolled-back transactions.
--
-- Cost impact: none — the same set-once pattern as 20261003003000.

begin;

create or replace function public.placement_people()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct tm.user_id from public.team_memberships tm
   where tm.team_id in (select public.managed_teams())
$$;

create or replace function public.time_wide_agency_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.id from public.agencies a
   where public.is_staff_of(a.id)
     and (public.is_owner_of(a.id) or public.holds_operations_seat(a.id) or public.reads_payroll_of(a.id))
$$;

create or replace function public.can_view_time_of(p_agency uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff_of(p_agency)
     and (p_user = auth.uid()
          or p_agency in (select public.time_wide_agency_ids())
          or p_user in (select public.placement_people()))
$$;

create or replace function public.can_manage_time_of(p_agency uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff_of(p_agency) and p_user is distinct from auth.uid()
     and (public.is_owner_of(p_agency) or public.holds_operations_seat(p_agency)
          or p_user in (select public.placement_people()))
$$;

revoke execute on function public.placement_people() from anon, public;
revoke execute on function public.time_wide_agency_ids() from anon, public;
revoke execute on function public.can_view_time_of(uuid, uuid) from anon, public;
revoke execute on function public.can_manage_time_of(uuid, uuid) from anon, public;
grant execute on function public.placement_people() to authenticated;
grant execute on function public.time_wide_agency_ids() to authenticated;
grant execute on function public.can_view_time_of(uuid, uuid) to authenticated;
grant execute on function public.can_manage_time_of(uuid, uuid) to authenticated;

/* Tables: the same three branches, as sets so each is answered once. */
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries for select to authenticated
using (
  agency_id in (select public.my_staff_agency_ids())
  and (employee_id = auth.uid()
       or agency_id in (select public.time_wide_agency_ids())
       or employee_id in (select public.placement_people()))
);

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select to authenticated
using (
  agency_id in (select public.my_staff_agency_ids())
  and (user_id = auth.uid()
       or agency_id in (select public.time_wide_agency_ids())
       or user_id in (select public.placement_people()))
);

drop policy if exists time_adjustments_select on public.time_adjustment_requests;
create policy time_adjustments_select on public.time_adjustment_requests for select to authenticated
using (
  requested_by = auth.uid()
  or (agency_id in (select public.my_staff_agency_ids())
      and (agency_id in (select public.time_wide_agency_ids())
           or requested_by in (select public.placement_people())))
);

drop policy if exists attendance_corrections_select on public.attendance_corrections;
create policy attendance_corrections_select on public.attendance_corrections for select to authenticated
using (
  agency_id in (select public.my_staff_agency_ids())
  and (user_id = auth.uid()
       or agency_id in (select public.time_wide_agency_ids())
       or user_id in (select public.placement_people()))
);

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
$function$;

CREATE OR REPLACE FUNCTION public.decide_time_adjustment(p_request uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req   public.time_adjustment_requests;
  v_entry public.time_entries;
  v_actor text;
begin
  select * into v_req from public.time_adjustment_requests where id = p_request;
  if v_req.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided' using errcode = '22023';
  end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'You cannot decide your own adjustment request' using errcode = '42501';
  end if;
  /* Who may correct someone's hours (20261003005000): a manager whose
     placement covers them, an owner or the operations seat — or the explicit
     payroll.manage capability, because correcting hours is payroll work. */
  if not public.can_manage_time_of(v_req.agency_id, v_req.requested_by)
     and not (public.is_staff_of(v_req.agency_id) and public.agency_can('payroll.manage')) then
    raise exception 'Deciding an adjustment needs a lead or manager of this person'
      using errcode = '42501';
  end if;

  select * into v_entry from public.time_entries where id = v_req.entry_id;

  update public.time_adjustment_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  if p_approve then
    /* The guard bypasses for managers but not for leads — and a lead IS a
       valid decider here. The decision above is the authorization, so this
       one write declares itself to the guard rather than being re-litigated
       (and silently clamped) by it. */
    perform set_config('bes.time_system', '1', true);
    update public.time_entries
       set ended_at = v_req.requested_ended_at, auto_stopped = false
     where id = v_req.entry_id;
    perform set_config('bes.time_system', '', true);
    v_entry.ended_at := v_req.requested_ended_at;
    perform public.payroll_recompute_for_entry(v_entry);
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into v_actor from public.profiles where id = auth.uid();
  insert into public.audit_log (agency_id, actor_id, action, entity_type, entity_id, before, after)
  values (v_req.agency_id, auth.uid(),
          case when p_approve then 'time_adjustment.approved' else 'time_adjustment.declined' end,
          'time_entry', v_req.entry_id::text,
          jsonb_build_object('ended_at', v_entry.ended_at, 'auto_stopped', v_entry.auto_stopped),
          jsonb_build_object('ended_at', case when p_approve then v_req.requested_ended_at else v_entry.ended_at end,
                             'requested_by', v_req.requested_by, 'reason', v_req.reason,
                             'decided_by', auth.uid(), 'note', v_req.decision_note));

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (v_req.requested_by, v_req.agency_id, 'timer', 'time_entry', v_req.entry_id::text,
          'My Time',
          case when p_approve then 'Your time adjustment was approved' else 'Your time adjustment was declined' end,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Decided by ' || coalesce(v_actor, 'a manager') || '.'),
          'bes_internal'::public.activity_visibility);
end $function$;

CREATE OR REPLACE FUNCTION public.team_presence()
 RETURNS TABLE(user_id uuid, state text, exception text, since timestamp with time zone, first_in timestamp with time zone, work_minutes integer, break_minutes integer, lunch_minutes integer, break_allowance_minutes integer, lunch_allowance_minutes integer, activity text, team_name text, position_title text, leave_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  /* The people the caller manages, narrowed to the people whose time they may
     see (20261003005000): presence is time data. */
  with scope as (select mp.user_id from public.managed_people() mp
                  where mp.user_id in (select public.placement_people())
                     or exists (select 1 from public.agency_memberships m
                                 where m.user_id = mp.user_id and m.status = 'active'
                                   and m.agency_id in (select public.time_wide_agency_ids()))),
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

CREATE OR REPLACE FUNCTION public.manager_clock_out(p_user uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_entry public.time_entries;
  v_end timestamptz;
  v_actor_name text;
  v_agent_name text;
begin
  if v_actor is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if p_user = v_actor then
    raise exception 'Use your own clock to clock yourself out.' using errcode = '22023';
  end if;
  /* Default to deny: no row in managed_people() is a no, not a maybe. */
  if not exists (select 1 from public.managed_people() mp where mp.user_id = p_user)
     or not exists (select 1 from public.agency_memberships m
                     where m.user_id = p_user and m.status = 'active'
                       and public.can_manage_time_of(m.agency_id, p_user)) then
    raise exception 'You do not manage this person.' using errcode = '42501';
  end if;

  select * into v_entry
    from public.time_entries
   where employee_id = p_user and ended_at is null;
  if not found then
    raise exception 'They are not clocked in.' using errcode = '22023';
  end if;

  /* The same two rules the agent's own clock-out obeys: now, and capped. */
  v_end := least(now(), v_entry.started_at + public.timer_cap());

  perform set_config('bes.time_system', '1', true);
  update public.time_entries
     set ended_at = v_end,
         auto_stopped = (v_end < now())
   where id = v_entry.id
  returning * into v_entry;
  perform set_config('bes.time_system', '', true);

  select coalesce(nullif(btrim(full_name), ''), email) into v_actor_name from public.profiles where id = v_actor;
  select coalesce(nullif(btrim(full_name), ''), email) into v_agent_name from public.profiles where id = p_user;

  /* Actor, record, previous and new value — a manager ending somebody else's
     day is exactly the kind of mutation rule 10 exists for. */
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action,
         field, previous_value, new_value, detail, visibility)
  values (v_entry.agency_id, 'time_entry', v_entry.id::text, v_actor, v_actor_name,
          'manager_clock_out', 'ended_at', null, v_end::text,
          v_actor_name || ' clocked out ' || v_agent_name ||
            case when btrim(coalesce(p_reason, '')) = '' then '' else ' — ' || btrim(p_reason) end,
          'bes_internal');

  insert into public.notifications
        (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_user, v_entry.agency_id, 'timer', 'time_entry', v_entry.id::text, 'My Time',
          v_actor_name || ' clocked you out',
          'Your ' || v_entry.kind || ' timer was stopped at ' ||
          to_char(v_end at time zone 'America/New_York', 'FMHH12:MI AM') || ' Eastern' ||
          case when btrim(coalesce(p_reason, '')) = '' then '.' else ' — ' || btrim(p_reason) end ||
          ' If that is not right, request an adjustment from My Time.',
          'bes_internal');

  return v_entry.id;
end $function$;

CREATE OR REPLACE FUNCTION public.record_attendance_correction(p_user uuid, p_date date, p_classification text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_agency uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'You cannot correct your own attendance' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Say why this is being corrected' using errcode = '22023';
  end if;

  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'That person is not active staff' using errcode = '42501';
  end if;

  /* Placement, owner or the operations seat (20261003005000). */
  if not (
    public.can_manage_time_of(v_agency, p_user)
  ) then
    raise exception 'Correcting attendance needs a lead or manager of this person'
      using errcode = '42501';
  end if;

  insert into public.attendance_corrections
    (agency_id, user_id, work_date, classification, reason, decided_by)
  values (v_agency, p_user, p_date, p_classification, trim(p_reason), v_me)
  returning id into v_id;

  insert into public.notifications
    (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select p_user, v_agency, 'timer', 'attendance_correction', v_id::text, 'Attendance',
         'Your attendance for ' || to_char(p_date, 'FMMon FMDD') || ' was corrected',
         'Now recorded as ' || replace(p_classification, '_', ' ')
           || ' by ' || coalesce(nullif(trim(pr.full_name), ''), pr.email)
           || '. "' || trim(p_reason) || '"',
         'bes_internal'
    from public.profiles pr where pr.id = v_me;

  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.decide_leave_request(p_request uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_allowed boolean;
  v_decider text;
  v_type text;
begin
  select * into r from public.leave_requests where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then
    raise exception 'This request was already %', r.status;
  end if;
  if r.user_id = auth.uid() then
    raise exception 'You cannot decide your own leave request' using errcode = '42501';
  end if;

  /* Placement, owner or the operations seat (20261003005000). */
  v_allowed := public.can_manage_time_of(r.agency_id, r.user_id);

  if not v_allowed then
    raise exception 'Deciding leave needs a lead of their team, or management access'
      using errcode = '42501';
  end if;

  update public.leave_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  select coalesce(nullif(trim(full_name), ''), email) into v_decider
    from public.profiles where id = auth.uid();
  select label into v_type from public.leave_types where id = r.type_id;

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (r.user_id, r.agency_id, 'leave', 'leave_request', r.id::text, 'My Time',
          'Your ' || coalesce(v_type, 'leave') || ' request was ' || case when p_approve then 'approved' else 'declined' end,
          to_char(r.starts_on, 'FMMon DD') ||
            case when r.ends_on <> r.starts_on then '–' || to_char(r.ends_on, 'FMMon DD') else '' end ||
            ' · decided by ' || v_decider ||
            coalesce('. "' || nullif(trim(coalesce(p_note, '')), '') || '"', ''),
          'bes_internal');
end $function$;

commit;
