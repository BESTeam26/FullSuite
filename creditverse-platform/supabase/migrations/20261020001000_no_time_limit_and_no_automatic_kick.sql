-- No time limit on a timer, and no automatic kick (Dee, 2026-10-20).
--
-- Dee: "Remove the time limit and the autokick of the hours." Reported by
-- the team the same morning: Danicko's timer "died again, it clocks out by
-- itself … even with activity." The idle clock-out (D-029) stopped nine
-- timers in three days — the team works most of the day in DisputeFox and
-- GHL with FullSuite in a background tab, where no heartbeat is sent. It is
-- OFF (agencies.idle_clock_out_minutes = null, set live at 10:58 ET).
--
-- The 10-hour cap becomes a per-agency setting, agencies.timer_cap_hours,
-- and BES has none: a timer is never stopped on its own day. The one rule
-- kept, because a timer cannot span days and the one-open-timer rule must
-- not refuse tomorrow's clock-in: a timer still open from an EARLIER
-- Eastern work day is closed at the end of that day when the person next
-- clocks in, marked auto-stopped with reason day_end, and both the agent
-- and their leads are told. An adjustment request restores the truth.
--
-- Cost impact: none (the stale-timer sweep now skips agencies without a cap).

begin;

alter table public.agencies
  add column if not exists timer_cap_hours integer
  check (timer_cap_hours is null or timer_cap_hours between 1 and 24);
comment on column public.agencies.timer_cap_hours is
  'Hours after which a running timer is stopped automatically. Null: no limit (BES, Dee 2026-10-20).';
update public.agencies set timer_cap_hours = null, idle_clock_out_minutes = null where name = 'Blessed Empire Services';

alter table public.time_entries drop constraint if exists time_entries_auto_stop_reason_check;
alter table public.time_entries add constraint time_entries_auto_stop_reason_check
  check (auto_stop_reason is null or auto_stop_reason in ('cap', 'idle', 'day_end'));

/* The cap is the agency's, or none. The old no-argument form is gone so
   nothing can keep reading ten hours. */
drop function if exists public.timer_cap();
create or replace function public.timer_cap(p_agency uuid)
returns interval language sql stable set search_path = public as $$
  select make_interval(hours => a.timer_cap_hours) from public.agencies a where a.id = p_agency and a.timer_cap_hours is not null
$$;

CREATE OR REPLACE FUNCTION public.time_entries_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('bes.time_system', true), '') = '1'
     or public.is_manager_of(old.agency_id) then
    return new;  -- the system's own hand, or a manager's decision
  end if;
  new.started_at := old.started_at;
  new.work_date  := old.work_date;
  new.employee_id := old.employee_id;
  new.agency_id   := old.agency_id;
  new.auto_stopped := old.auto_stopped;
  if old.ended_at is not null then
    /* Already finished. Its end is history, and an edit is not a clock-out. */
    new.ended_at := old.ended_at;
  elsif new.ended_at is not null then
    /* Closing now: whatever was sent, a clock-out is the moment it happened. */
    /* A cap only when the agency has one (Dee, 2026-10-20: none at BES). */
    if public.timer_cap(old.agency_id) is not null
       and now() >= old.started_at + public.timer_cap(old.agency_id) then
      new.ended_at := old.started_at + public.timer_cap(old.agency_id);
      new.auto_stopped := true;
      new.auto_stop_reason := 'cap';
    else
      new.ended_at := now();
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.time_entries_self_heal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stale public.time_entries;
begin
  perform set_config('bes.time_system', '1', true);
  /* With a cap: a timer past it closes at the cap, as before. Without one
     (Dee, 2026-10-20): a timer is never cut short on its own day, but a
     timer still open from an EARLIER Eastern work day closes at the end of
     that day when the person clocks in again — a timer cannot span days,
     and the one-open-timer rule must not refuse today's clock-in. */
  update public.time_entries
     set ended_at = case when public.timer_cap(agency_id) is not null
                         then started_at + public.timer_cap(agency_id)
                         else ((work_date + 1)::timestamp at time zone 'America/New_York') - interval '1 second' end,
         auto_stopped = true,
         auto_stop_reason = case when public.timer_cap(agency_id) is not null then 'cap' else 'day_end' end
   where employee_id = new.employee_id
     and ended_at is null
     and ((public.timer_cap(agency_id) is not null and started_at < now() - public.timer_cap(agency_id))
          or (public.timer_cap(agency_id) is null and work_date < (now() at time zone 'America/New_York')::date))
  returning * into v_stale;
  perform set_config('bes.time_system', '', true);
  if v_stale.id is not null then
    perform public.notify_timer_stopped(v_stale);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.auto_stop_stale_timers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.time_entries;
  v_count integer := 0;
begin
  perform set_config('bes.time_system', '1', true);
  for v_row in
    update public.time_entries t
       set ended_at = t.started_at + public.timer_cap(t.agency_id), auto_stopped = true, auto_stop_reason = 'cap'
      from public.agencies a
     where a.id = t.agency_id and a.timer_cap_hours is not null
       and t.ended_at is null and t.started_at < now() - public.timer_cap(t.agency_id)
    returning t.*
  loop
    perform public.notify_timer_stopped(v_row);
    v_count := v_count + 1;
  end loop;
  perform set_config('bes.time_system', '', true);
  return v_count;
end $function$
;

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
  v_end := least(now(), v_entry.started_at + coalesce(public.timer_cap(v_entry.agency_id), interval '100 years'));

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
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_timer_stopped(p_entry time_entries)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text;
  v_idle boolean := p_entry.auto_stop_reason = 'idle';
  v_day_end boolean := p_entry.auto_stop_reason = 'day_end';
  v_cap text := coalesce((select a.timer_cap_hours::text from public.agencies a where a.id = p_entry.agency_id), '?') || '-hour';
  v_at text := to_char(p_entry.ended_at at time zone 'America/New_York', 'FMHH12:MI AM');
begin
  select coalesce(nullif(trim(full_name), ''), email) into v_name
    from public.profiles where id = p_entry.employee_id;

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_entry.employee_id, p_entry.agency_id, 'timer', 'time_entry', p_entry.id::text,
          'My Time', 'Your timer was stopped automatically',
          case when v_idle
            then 'FullSuite saw no activity from you, so your timer was stopped at your last activity, ' || v_at || ' ET. If you were working, request an adjustment from My Time — your lead approves it.'
            when v_day_end
            then 'It was still running from ' || to_char(p_entry.work_date, 'FMMon DD') || ' when you clocked in again, so it was closed at the end of that day (' || v_at || ' ET). If the real time differs, request an adjustment from My Time — your lead approves it.'
            else 'It reached the ' || v_cap || ' cap, so it was stopped at ' || v_at || ' ET. If the real time differs, request an adjustment from My Time — your lead approves it.' end,
          'bes_internal');

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select distinct tm2.user_id, p_entry.agency_id, 'timer', 'time_entry', p_entry.id::text,
         'Team EOD', v_name || '''s timer was stopped automatically',
         case when v_idle
           then 'No activity in FullSuite, so it was stopped at their last activity, ' || v_at || ' ET on ' || to_char(p_entry.work_date, 'FMMon DD') || '. An adjustment request may follow.'
           when v_day_end
           then 'It was still running from ' || to_char(p_entry.work_date, 'FMMon DD') || ' at their next clock-in and was closed at the end of that day. An adjustment request may follow.'
           else 'It reached the ' || v_cap || ' cap. They may have forgotten to clock out on ' || to_char(p_entry.work_date, 'FMMon DD') || '; an adjustment request may follow.' end,
         'bes_internal'::public.activity_visibility
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = p_entry.employee_id
     and tm2.user_id <> p_entry.employee_id;
end $function$
;

commit;
