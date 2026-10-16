-- An idle timer stops at the last activity, and says so (D-029, step 1).
--
-- Dee, 2026-10-15: "a capability that the app can track … activity to
-- ensure they are working … Like if the screen went to sleep, their clock
-- will be kicked out." A browser app cannot watch the screen or other
-- windows; it CAN say when the person was last active inside FullSuite.
--
-- So: while clocked in, the app sends a heartbeat (time_heartbeat) when the
-- person has been active in the last minute — a click, a key, a scroll, the
-- tab coming back. A sleeping screen, a locked laptop or a closed tab sends
-- nothing. Every five minutes the idle sweep closes any open work timer
-- whose last heartbeat is older than the agency's idle window, at the time
-- of that last heartbeat (not at the sweep), marks it auto-stopped with
-- reason 'idle', and tells the agent and every lead of their teams — the
-- same path the 10-hour cap already uses.
--
-- A timer that never sent a heartbeat (an older build, a phone that could
-- not) is left to the 10-hour cap: nobody is clocked out on no evidence.
-- Breaks and lunch are not work timers and are never idle-stopped.
--
-- Cost scales with: one heartbeat per clocked-in person per active minute,
-- bounded by head count; one sweep every five minutes over open timers.

begin;

alter table public.agencies
  add column if not exists idle_clock_out_minutes integer
  check (idle_clock_out_minutes is null or idle_clock_out_minutes between 5 and 240);
comment on column public.agencies.idle_clock_out_minutes is
  'Minutes without a FullSuite heartbeat after which an open work timer is stopped at its last heartbeat. Null: off (D-029).';
update public.agencies set idle_clock_out_minutes = 15 where name = 'Blessed Empire Services';

alter table public.time_entries
  add column if not exists last_activity_at timestamptz,
  add column if not exists auto_stop_reason text
  check (auto_stop_reason is null or auto_stop_reason in ('cap', 'idle'));
comment on column public.time_entries.last_activity_at is 'The last heartbeat from the app while this timer ran; null when none arrived.';
comment on column public.time_entries.auto_stop_reason is 'Why the system stopped it: cap (10 hours) or idle (no activity). Null when a person stopped it.';
create index if not exists time_entries_open_idle_idx on public.time_entries (last_activity_at) where ended_at is null;

/* The cap writers name their reason (the guard's clock-out-past-cap stays
   null and reads as the cap). */
create or replace function public.auto_stop_stale_timers()
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_row public.time_entries;
  v_count integer := 0;
begin
  perform set_config('bes.time_system', '1', true);
  for v_row in
    update public.time_entries
       set ended_at = started_at + public.timer_cap(), auto_stopped = true, auto_stop_reason = 'cap'
     where ended_at is null and started_at < now() - public.timer_cap()
    returning *
  loop
    perform public.notify_timer_stopped(v_row);
    v_count := v_count + 1;
  end loop;
  perform set_config('bes.time_system', '', true);
  return v_count;
end $function$;

/* One notice, worded by reason. */
create or replace function public.notify_timer_stopped(p_entry public.time_entries)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_name text;
  v_idle boolean := p_entry.auto_stop_reason = 'idle';
  v_at text := to_char(p_entry.ended_at at time zone 'America/New_York', 'FMHH12:MI AM');
begin
  select coalesce(nullif(trim(full_name), ''), email) into v_name
    from public.profiles where id = p_entry.employee_id;

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_entry.employee_id, p_entry.agency_id, 'timer', 'time_entry', p_entry.id::text,
          'My Time', 'Your timer was stopped automatically',
          case when v_idle
            then 'FullSuite saw no activity from you, so your timer was stopped at your last activity, ' || v_at || ' ET. If you were working, request an adjustment from My Time — your lead approves it.'
            else 'It reached the 10-hour cap, so it was stopped at ' || v_at || ' ET. If the real time differs, request an adjustment from My Time — your lead approves it.' end,
          'bes_internal');

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select distinct tm2.user_id, p_entry.agency_id, 'timer', 'time_entry', p_entry.id::text,
         'Team EOD', v_name || '''s timer was stopped automatically',
         case when v_idle
           then 'No activity in FullSuite, so it was stopped at their last activity, ' || v_at || ' ET on ' || to_char(p_entry.work_date, 'FMMon DD') || '. An adjustment request may follow.'
           else 'It reached the 10-hour cap. They may have forgotten to clock out on ' || to_char(p_entry.work_date, 'FMMon DD') || '; an adjustment request may follow.' end,
         'bes_internal'::public.activity_visibility
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = p_entry.employee_id
     and tm2.user_id <> p_entry.employee_id;
end $function$;

/* The heartbeat: the caller's own open WORK timer, nothing else. Returns
   whether one exists, so the app can slow down when nothing is running. */
create or replace function public.time_heartbeat()
returns boolean language plpgsql security definer set search_path = public as $function$
declare v_n integer;
begin
  if auth.uid() is null then return false; end if;
  perform set_config('bes.time_system', '1', true);
  update public.time_entries
     set last_activity_at = now()
   where employee_id = auth.uid() and ended_at is null and kind = 'work';
  get diagnostics v_n = row_count;
  perform set_config('bes.time_system', '', true);
  return v_n > 0;
end $function$;
revoke all on function public.time_heartbeat() from public, anon;
grant execute on function public.time_heartbeat() to authenticated;

/* The idle sweep. */
create or replace function public.auto_stop_idle_timers()
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_row public.time_entries;
  v_count integer := 0;
begin
  perform set_config('bes.time_system', '1', true);
  for v_row in
    update public.time_entries t
       set ended_at = t.last_activity_at, auto_stopped = true, auto_stop_reason = 'idle'
      from public.agencies a
     where a.id = t.agency_id
       and a.idle_clock_out_minutes is not null
       and t.ended_at is null and t.kind = 'work'
       and t.last_activity_at is not null
       and t.last_activity_at < now() - make_interval(mins => a.idle_clock_out_minutes)
       and t.last_activity_at > t.started_at
    returning t.*
  loop
    perform public.notify_timer_stopped(v_row);
    v_count := v_count + 1;
  end loop;
  perform set_config('bes.time_system', '', true);
  return v_count;
end $function$;
revoke all on function public.auto_stop_idle_timers() from public, anon, authenticated;

select cron.schedule('timer-idle-stop', '*/5 * * * *', $$select public.auto_stop_idle_timers()$$);

commit;
