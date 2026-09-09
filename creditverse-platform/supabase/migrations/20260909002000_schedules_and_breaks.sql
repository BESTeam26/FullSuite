-- =============================================================================
-- People management, part 1: work schedules, and a timer that knows about
-- breaks. (Dee's direction 2026-09-09: Clockify-grade time detail, and the
-- foundation attendance needs — you cannot mark "late" without a schedule,
-- or "over-break" without breaks.)
--
--   • time_entries.kind — 'work' | 'break' | 'lunch'. One table, one engine:
--     a break is a time entry like any other, closed the same way, capped the
--     same way, corrected through the same approval flow. EOD minutes count
--     WORK only.
--   • start_break / resume_work — atomic switches. Closing the open entry and
--     opening the next happens in one transaction, so a mid-switch failure
--     can never leave someone half clocked-out. INVOKER: the agent's own
--     policies apply, exactly as their clock-in does.
--   • work_schedules — effective-dated rows (who works which days, when the
--     shift starts and ends, how much lunch/break is allowed, the late
--     grace, in which timezone). Effective-dating matters: yesterday's
--     lateness is judged by yesterday's schedule, and editing today's must
--     never rewrite history.
--   • set_work_schedule — the audited write path (rule 10).
-- =============================================================================

-- ── The timer learns kinds ────────────────────────────────────────────────
alter table public.time_entries
  add column if not exists kind text not null default 'work'
    check (kind in ('work', 'break', 'lunch'));

comment on column public.time_entries.kind is
  'work = production time; break/lunch = the day''s rest. EOD and production '
  'minutes count work only; the 10-hour cap and the adjustment flow apply to all.';

-- ── Atomic switches ───────────────────────────────────────────────────────
create or replace function public.start_break(p_kind text default 'break')
returns uuid
language plpgsql security invoker set search_path = public as $function$
declare
  open_entry record;
  v_id uuid;
begin
  if p_kind not in ('break', 'lunch') then
    raise exception 'A break is ''break'' or ''lunch''';
  end if;
  select * into open_entry
    from public.time_entries
   where employee_id = auth.uid() and ended_at is null;
  if not found then
    raise exception 'You are not clocked in — a break splits a workday.';
  end if;
  if open_entry.kind <> 'work' then
    raise exception 'You are already on a break.';
  end if;

  /* The guard trigger computes ended_at = now(), capped — same as clock-out. */
  update public.time_entries set ended_at = now() where id = open_entry.id;

  insert into public.time_entries
        (agency_id, employee_id, division_id, work_date, kind)
  values (open_entry.agency_id, auth.uid(), 'general', open_entry.work_date, p_kind)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.resume_work()
returns uuid
language plpgsql security invoker set search_path = public as $function$
declare
  open_entry record;
  last_work record;
  v_id uuid;
begin
  select * into open_entry
    from public.time_entries
   where employee_id = auth.uid() and ended_at is null;
  if not found then
    raise exception 'Nothing is running. Clock in instead.';
  end if;
  if open_entry.kind = 'work' then
    raise exception 'You are already working.';
  end if;

  update public.time_entries set ended_at = now() where id = open_entry.id;

  /* Pick the interrupted context back up, so the timeline reads as one day
     of the same work rather than resetting to "general" after every coffee. */
  select division_id, organization_id, client_id, work_item_id, task_note
    into last_work
    from public.time_entries
   where employee_id = auth.uid() and work_date = open_entry.work_date and kind = 'work'
   order by started_at desc limit 1;

  insert into public.time_entries
        (agency_id, employee_id, division_id, organization_id, client_id,
         work_item_id, task_note, work_date, kind)
  values (open_entry.agency_id, auth.uid(),
          coalesce(last_work.division_id, 'general'),
          last_work.organization_id, last_work.client_id,
          last_work.work_item_id, last_work.task_note,
          open_entry.work_date, 'work')
  returning id into v_id;
  return v_id;
end;
$function$;

revoke execute on function public.start_break(text) from public, anon;
revoke execute on function public.resume_work() from public, anon;
grant execute on function public.start_break(text) to authenticated;
grant execute on function public.resume_work() to authenticated;

-- ── Work schedules, effective-dated ───────────────────────────────────────
create table public.work_schedules (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  work_days      smallint[] not null default '{1,2,3,4,5}'
                   check (work_days <@ '{1,2,3,4,5,6,7}'::smallint[] and array_length(work_days, 1) >= 1),
  shift_start    time not null,
  shift_end      time not null,
  /** Allowed rest, minutes per day. */
  lunch_minutes  integer not null default 60 check (lunch_minutes between 0 and 240),
  break_minutes  integer not null default 30 check (break_minutes between 0 and 240),
  /** Clocking in within this many minutes of shift_start is on time. */
  grace_minutes  integer not null default 5 check (grace_minutes between 0 and 120),
  timezone       text not null default 'UTC',
  effective_from date not null default (now() at time zone 'utc')::date,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint work_schedules_shift_ck check (shift_end > shift_start),
  constraint work_schedules_one_per_day unique (user_id, effective_from)
);

comment on table public.work_schedules is
  'Effective-dated: attendance for a date is judged by the row in force ON '
  'that date, so editing a schedule never rewrites history. Overnight shifts '
  'are a deliberate v1 exclusion (shift_end > shift_start).';

create index work_schedules_user_idx on public.work_schedules (user_id, effective_from desc);
create index work_schedules_agency_idx on public.work_schedules (agency_id);

alter table public.work_schedules enable row level security;

/* Read: your own schedule; managers, everyone's; a team lead, their team's. */
create policy work_schedules_select on public.work_schedules
  for select to authenticated
  using (
    is_staff_of(agency_id)
    and (
      user_id = auth.uid()
      or is_manager_of(agency_id)
      or exists (
        select 1
          from public.team_memberships lead_m
          join public.team_memberships member_m on member_m.team_id = lead_m.team_id
         where lead_m.user_id = auth.uid() and lead_m.is_lead
           and member_m.user_id = work_schedules.user_id
      )
    )
  );
/* Writes go through set_work_schedule only — no table-level write policy. */

create or replace function public.set_work_schedule(
  p_user uuid,
  p_work_days smallint[],
  p_shift_start time,
  p_shift_end time,
  p_lunch_minutes integer,
  p_break_minutes integer,
  p_grace_minutes integer,
  p_timezone text,
  p_effective_from date default (now() at time zone 'utc')::date
) returns uuid
language plpgsql security definer set search_path = public as $function$
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
  if not public.is_manager_of(v_agency) then
    raise exception 'Setting a schedule needs management access' using errcode = '42501';
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
         effective_from, created_by)
  values (v_agency, p_user, p_work_days, p_shift_start, p_shift_end,
          p_lunch_minutes, p_break_minutes, p_grace_minutes, p_timezone,
          p_effective_from, auth.uid())
  on conflict (user_id, effective_from) do update
    set work_days = excluded.work_days, shift_start = excluded.shift_start,
        shift_end = excluded.shift_end, lunch_minutes = excluded.lunch_minutes,
        break_minutes = excluded.break_minutes, grace_minutes = excluded.grace_minutes,
        timezone = excluded.timezone, created_by = excluded.created_by
  returning id into v_id;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name,
         action, field, previous_value, new_value, visibility)
  values (v_agency, 'work_schedule', p_user::text, auth.uid(), v_actor,
          'Work schedule set', 'schedule', v_before,
          'days ' || p_work_days::text || ' ' || p_shift_start || '–' || p_shift_end
            || ' from ' || p_effective_from,
          'bes_internal');
  return v_id;
end;
$function$;

revoke execute on function public.set_work_schedule(uuid, smallint[], time, time, integer, integer, integer, text, date) from public, anon;
grant execute on function public.set_work_schedule(uuid, smallint[], time, time, integer, integer, integer, text, date) to authenticated;
-- ── EOD minutes count WORK only ──
CREATE OR REPLACE FUNCTION public.eod_day_activity(p_employee uuid, p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with completed as (
    select w.id, w.title, w.priority::text as priority, w.completed_at
      from public.work_items w
     where w.assigned_to = p_employee
       and w.completed_at is not null
       and (w.completed_at at time zone 'UTC')::date = p_date
  ),
  worked as (
    select distinct w.id, w.title, w.stage::text as stage
      from public.activity_events a
      join public.work_items w on w.id::text = a.entity_id
     where a.entity_type = 'work_item'
       and a.actor_id = p_employee
       and (a.created_at at time zone 'UTC')::date = p_date
       and w.id not in (select id from completed)
  ),
  in_progress as (
    select w.id, w.title, w.stage::text as stage, w.due_at
      from public.work_items w
     where w.assigned_to = p_employee and w.completed_at is null
       and w.stage not in ('Queued', 'Blocked')
  ),
  overdue as (
    select w.id, w.title, w.due_at
      from public.work_items w
     where w.assigned_to = p_employee and w.completed_at is null
       and w.due_at is not null and w.due_at < now()
  ),
  blocked as (
    select w.id, w.title, coalesce(b.note, bb.title, 'Blocked') as reason
      from public.work_items w
      left join public.work_item_blockers b on b.work_item_id = w.id and b.resolved_at is null
      left join public.work_items bb on bb.id = b.blocked_by_id
     where w.assigned_to = p_employee and w.completed_at is null
       and (w.stage = 'Blocked' or b.id is not null)
  ),
  /* One row per file completed. This is the production unit. */
  logs as (
    select p.id, p.division_id, p.department::text as department,
           p.production_unit_type as unit,
           p.production_unit_quantity as units,
           coalesce(p.actions, '{}') as actions,
           coalesce(array_length(p.actions, 1), 0) as action_count,
           p.work_notes, p.resulting_status, p.completed_at,
           coalesce(fc.name, og.name, o.name, p.production_unit_type) as subject
      from public.production_logs p
      left join public.fulfillment_clients fc on fc.id = p.client_id
      left join public.outsourcing_groups og on og.id = p.outsourcing_group_id
      left join public.organizations o on o.id = p.organization_id
     where p.employee_id = p_employee and p.work_date = p_date and not p.is_voided
  ),
  /* How many times each action was ticked across the whole day. */
  action_breakdown as (
    select a.action, count(*)::int as count
      from logs l, unnest(l.actions) as a(action)
     group by a.action
  ),
  /* Files and actions per department, kept apart — the distinction is the
     entire point of this migration. */
  by_department as (
    select coalesce(l.department, l.division_id, 'Unassigned') as department,
           count(*)::int as files,
           coalesce(sum(l.units), 0)::int as units,
           coalesce(sum(l.action_count), 0)::int as actions
      from logs l group by 1
  ),
  minutes as (
    select coalesce(sum(t.duration_minutes), 0)::int as total
      from public.time_entries t
     where t.employee_id = p_employee and t.work_date = p_date and t.ended_at is not null
       and t.kind = 'work'  -- breaks and lunch are the day's rest, not its production
  )
  select jsonb_build_object(
    'work_date',        p_date,
    'completed',        coalesce((select jsonb_agg(to_jsonb(c) order by c.completed_at) from completed c), '[]'::jsonb),
    'worked',           coalesce((select jsonb_agg(to_jsonb(w)) from worked w), '[]'::jsonb),
    'in_progress',      coalesce((select jsonb_agg(to_jsonb(i)) from in_progress i), '[]'::jsonb),
    'overdue',          coalesce((select jsonb_agg(to_jsonb(o) order by o.due_at) from overdue o), '[]'::jsonb),
    'blocked',          coalesce((select jsonb_agg(to_jsonb(b)) from blocked b), '[]'::jsonb),
    /* Kept for callers that already read it: unit totals, unchanged. */
    'production',       coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'quantity', units))
                                    from (select unit, sum(units)::numeric as units from logs group by unit) u), '[]'::jsonb),
    /* THE TWO NUMBERS. Files are the production unit; actions are what
       happened inside them. Never added together. */
    'files_worked',     (select count(*)::int from logs),
    'production_units', (select coalesce(sum(units), 0)::int from logs),
    'actions_completed',(select coalesce(sum(action_count), 0)::int from logs),
    'action_breakdown', coalesce((select jsonb_agg(to_jsonb(a) order by a.count desc, a.action) from action_breakdown a), '[]'::jsonb),
    'by_department',    coalesce((select jsonb_agg(to_jsonb(d) order by d.files desc) from by_department d), '[]'::jsonb),
    /* File by file, so an EOD can be expanded instead of retyped. */
    'files',            coalesce((select jsonb_agg(jsonb_build_object(
                                    'id', l.id, 'subject', l.subject, 'department', l.department,
                                    'unit', l.unit, 'actions', to_jsonb(l.actions),
                                    'action_count', l.action_count, 'notes', l.work_notes,
                                    'resulting_status', l.resulting_status, 'completed_at', l.completed_at)
                                    order by l.completed_at) from logs l), '[]'::jsonb),
    'minutes_logged',   (select total from minutes)
  )
$function$

;

-- ── entity_visible learns the new audit type ─────────────────────────────
-- Default-deny is the function's whole point (0246 note) — which means every
-- new entity type must be added here or its audit trail is written and never
-- readable. A schedule event is keyed to the PERSON scheduled.
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    when 'time_entry'         then exists (select 1 from public.time_entries te where te.id::text = p_entity_id)
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    /* Added with work_schedules (0250): the event is about a PERSON's
       schedule, so it is visible exactly when their schedule row is. */
    when 'work_schedule'      then exists (select 1 from public.work_schedules ws where ws.user_id::text = p_entity_id)
    else false
  end
$function$;
