----------------------------------------------------------------------
-- 0237  The lead reminders cast their visibility.
--
-- 0236's per-lead notification inserts used SELECT form, where Postgres does
-- not coerce a text literal into the activity_visibility enum the way the
-- VALUES form does — so the very first sweep failed on the cast, before any
-- reminder went out. Same functions, one explicit cast.
----------------------------------------------------------------------

create or replace function public.notify_timer_stopped(p_entry public.time_entries)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_name text;
begin
  select coalesce(nullif(trim(full_name), ''), email) into v_name
    from public.profiles where id = p_entry.employee_id;

  /* The agent themself. */
  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_entry.employee_id, p_entry.agency_id, 'timer', 'time_entry', p_entry.id::text,
          'My Time', 'Your timer was stopped automatically',
          'It reached the 10-hour cap, so it was stopped at ' || to_char(p_entry.started_at + public.timer_cap(), 'FMHH12:MI AM') ||
          '. If the real time differs, request an adjustment from My Time — your lead approves it.',
          'bes_internal');

  /* The lead(s) of every live team the agent is on — not the agent twice. */
  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select distinct tm2.user_id, p_entry.agency_id, 'timer', 'time_entry', p_entry.id::text,
         'Team EOD', v_name || '''s timer was stopped automatically',
         'It reached the 10-hour cap. They may have forgotten to clock out on ' ||
         to_char(p_entry.work_date, 'FMMon DD') || '; an adjustment request may follow.',
         'bes_internal'::public.activity_visibility
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = p_entry.employee_id
     and tm2.user_id <> p_entry.employee_id;
end $function$;

create or replace function public.request_time_adjustment(
  p_entry uuid, p_ended_at timestamptz, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_entry public.time_entries;
  v_id    uuid;
  v_name  text;
begin
  select * into v_entry from public.time_entries where id = p_entry;
  if v_entry.id is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  if v_entry.employee_id <> auth.uid() then
    raise exception 'You can only request an adjustment to your own time' using errcode = '42501';
  end if;
  if v_entry.ended_at is null then
    raise exception 'That timer is still running — clock out first' using errcode = '22023';
  end if;
  if p_ended_at <= v_entry.started_at or p_ended_at > now() then
    raise exception 'The corrected stop time must be after the clock started and not in the future' using errcode = '22023';
  end if;

  insert into public.time_adjustment_requests (agency_id, entry_id, requested_by, requested_ended_at, reason)
  values (v_entry.agency_id, p_entry, auth.uid(), p_ended_at, trim(p_reason))
  returning id into v_id;

  select coalesce(nullif(trim(full_name), ''), email) into v_name from public.profiles where id = auth.uid();
  /* Tell the people who can decide: this agent's team lead(s). */
  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select distinct tm2.user_id, v_entry.agency_id, 'timer', 'time_entry', v_entry.id::text,
         'Team EOD', v_name || ' requested a time adjustment',
         'For ' || to_char(v_entry.work_date, 'FMMon DD') || ': ' || left(trim(p_reason), 200),
         'bes_internal'::public.activity_visibility
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = auth.uid()
     and tm2.user_id <> auth.uid();
  return v_id;
end $function$;
