----------------------------------------------------------------------
-- 0239  A clock-out means NOW — and the system says so when it is the system.
--
-- Two holes in 0236/0238's guard, both found by phase 69:
--
--   · The self-heal closes a stale timer from inside an INSERT trigger. That
--     UPDATE fires the guard with the AGENT's auth.uid() (SECURITY DEFINER
--     changes the role, never the JWT claims), so the guard stripped the
--     auto_stopped flag off the system's own act — the cron bypass keyed on a
--     NULL uid and missed this path entirely.
--   · The within-cap branch honoured whatever ended_at the caller supplied as
--     long as it was in the past — so a crafted call could shave a running
--     timer's recorded end backwards. Shortening one's own time inflates
--     nothing, but Dee's rule is not "no inflation"; it is that an agent
--     NEVER writes a custom time.
--
-- The rule is now literal: for a non-manager, ended_at is computed — the
-- moment of the call, capped at ten hours — whatever value arrived. System
-- paths (sweep, self-heal, an approved decision) declare themselves with a
-- transaction-local flag that PostgREST callers have no way to set, instead
-- of being guessed from the shape of auth.uid().
----------------------------------------------------------------------

create or replace function public.time_entries_guard()
returns trigger language plpgsql security definer set search_path = public as $function$
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
  if new.ended_at is not null then
    /* Whatever was sent, a clock-out is the moment it happened — capped. */
    if now() >= old.started_at + public.timer_cap() then
      new.ended_at := old.started_at + public.timer_cap();
      new.auto_stopped := true;
    else
      new.ended_at := now();
    end if;
  end if;
  return new;
end $function$;

create or replace function public.time_entries_self_heal()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_stale public.time_entries;
begin
  perform set_config('bes.time_system', '1', true);
  update public.time_entries
     set ended_at = started_at + public.timer_cap(), auto_stopped = true
   where employee_id = new.employee_id
     and ended_at is null
     and started_at < now() - public.timer_cap()
  returning * into v_stale;
  perform set_config('bes.time_system', '', true);
  if v_stale.id is not null then
    perform public.notify_timer_stopped(v_stale);
  end if;
  return new;
end $function$;

create or replace function public.auto_stop_stale_timers()
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_row public.time_entries;
  v_count integer := 0;
begin
  perform set_config('bes.time_system', '1', true);
  for v_row in
    update public.time_entries
       set ended_at = started_at + public.timer_cap(), auto_stopped = true
     where ended_at is null and started_at < now() - public.timer_cap()
    returning *
  loop
    perform public.notify_timer_stopped(v_row);
    v_count := v_count + 1;
  end loop;
  perform set_config('bes.time_system', '', true);
  return v_count;
end $function$;
revoke execute on function public.auto_stop_stale_timers() from public, anon, authenticated;
