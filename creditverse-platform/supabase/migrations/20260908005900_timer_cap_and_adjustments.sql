----------------------------------------------------------------------
-- 0236  The clock stops itself, and time is corrected by approval.
--
-- Dee, 2026-09-08: "time entry should not be manually edited by the agent —
-- request approval / submit a change request with the reason. Allow clock-in
-- then clock-out… auto kick out from the timer in 10 hours max and send the
-- team lead and the agent a reminder that the clock was stopped
-- automatically."
--
-- This SUPERSEDES the same-day "say when you stopped" design, which let the
-- agent write their own ended_at. Under this model:
--
--   · A timer records AT MOST TEN HOURS. Past the cap it is stopped at
--     started_at + 10h, marked auto_stopped, and both the agent and their
--     team lead(s) are told — by a cron sweep, and failing that by the
--     agent's own next clock-in or clock-out, so the deadlock Dee hit
--     ("cannot clock in, cannot clock out") is impossible by construction.
--   · An agent NEVER writes a custom time. A guard trigger clamps every
--     non-manager update to "ended now, within the cap", and a closed entry
--     is corrected only through a TIME ADJUSTMENT REQUEST that a manager
--     approves, with the reason and both identities on the record.
----------------------------------------------------------------------

----------------------------------------------------------------------
-- 1. The cap, and what an auto-stop looks like on the row.
----------------------------------------------------------------------
alter table public.time_entries
  add column if not exists auto_stopped boolean not null default false;

comment on column public.time_entries.auto_stopped is
  'The system ended this entry at the 10-hour cap (0236) — the agent forgot. The recorded duration is the cap, not the forgotten span; a correction goes through time_adjustment_requests.';

/* One place for the number, so the trigger, the sweep and the probes cannot
   disagree about what "too long" means. */
create or replace function public.timer_cap()
returns interval language sql immutable as $function$ select interval '10 hours' $function$;

----------------------------------------------------------------------
-- 2. The guard: a non-manager's update can only ever mean "I stop now".
----------------------------------------------------------------------
create or replace function public.time_entries_guard()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if public.is_manager_of(old.agency_id) then
    return new;  -- corrections through decide_time_adjustment arrive as a manager
  end if;
  /* The clock's start is a fact that already happened. */
  new.started_at := old.started_at;
  new.work_date  := old.work_date;
  new.employee_id := old.employee_id;
  new.agency_id   := old.agency_id;
  new.auto_stopped := old.auto_stopped;
  if new.ended_at is not null then
    /* "I stop now" — never earlier, never later, never past the cap. A
       clock-out arriving after the cap records the cap and says so. */
    if new.ended_at > old.started_at + public.timer_cap() then
      new.ended_at := old.started_at + public.timer_cap();
      new.auto_stopped := true;
    else
      new.ended_at := least(new.ended_at, now());
    end if;
    if new.ended_at <= old.started_at then
      new.ended_at := old.started_at + interval '1 minute';
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists time_entries_guard on public.time_entries;
create trigger time_entries_guard before update on public.time_entries
  for each row execute function public.time_entries_guard();

----------------------------------------------------------------------
-- 3. Stopping a forgotten clock, with the reminders Dee asked for.
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
         'bes_internal'
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = p_entry.employee_id
     and tm2.user_id <> p_entry.employee_id;
end $function$;

create or replace function public.auto_stop_stale_timers()
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_row public.time_entries;
  v_count integer := 0;
begin
  for v_row in
    update public.time_entries
       set ended_at = started_at + public.timer_cap(), auto_stopped = true
     where ended_at is null and started_at < now() - public.timer_cap()
    returning *
  loop
    perform public.notify_timer_stopped(v_row);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;
revoke execute on function public.auto_stop_stale_timers() from public, anon, authenticated;

----------------------------------------------------------------------
-- 4. Clock-in self-heals. Between sweeps, a forgotten yesterday-timer must
--    never hold today hostage: starting a new clock closes the stale one at
--    the cap first (with the same reminders), and only a timer genuinely
--    still inside its cap refuses a second clock-in.
----------------------------------------------------------------------
create or replace function public.time_entries_self_heal()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_stale public.time_entries;
begin
  update public.time_entries
     set ended_at = started_at + public.timer_cap(), auto_stopped = true
   where employee_id = new.employee_id
     and ended_at is null
     and started_at < now() - public.timer_cap()
  returning * into v_stale;
  if v_stale.id is not null then
    perform public.notify_timer_stopped(v_stale);
  end if;
  return new;
end $function$;

drop trigger if exists time_entries_self_heal on public.time_entries;
create trigger time_entries_self_heal before insert on public.time_entries
  for each row execute function public.time_entries_self_heal();

----------------------------------------------------------------------
-- 5. The notification engine learns the kind and the entity.
----------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'note', 'status', 'mention', 'dm',
                  'handoff', 'announcement', 'attention', 'timer'));

create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $function$
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
    /* Added 0223. Its own policy decides, so a project out of somebody's
       scope is invisible here exactly as it is everywhere else. */
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    /* Added 0236: the employee sees their own entry, a manager the team's —
       time_entries' own policy, applied by INVOKER rights as everywhere. */
    when 'time_entry'         then exists (select 1 from public.time_entries te where te.id::text = p_entity_id)
    /* Keyed to the OWNER (0059: entity_id is the org id — and since 0232 an
       agency company document carries the agency id instead). Widened, not
       loosened: reading the row still needs the files policy, where an
       agency document has no organization branch at all (rule 16). */
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    -- An attachment on a note is visible exactly when the note is.
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    else false
  end
$function$;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone — and an activity row about an unknown type is REFUSED, which aborts whatever wrote it. Add the case, with a real check and never `true`, in the same migration that starts writing the type. `channel_message` 0199, `announcement` 0218, `crm_project` 0223, `company_document` widened to the agency owner 0232, `time_entry` 0236.';

----------------------------------------------------------------------
-- 6. Adjustment requests: the agent asks, a manager decides, both on record.
----------------------------------------------------------------------
create table public.time_adjustment_requests (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  entry_id           uuid not null references public.time_entries(id) on delete cascade,
  requested_by       uuid not null references public.profiles(id) on delete cascade,
  /* What the agent says the truth was. Bounded by the entry's own life at
     request time; the DECISION re-checks, because the request is a claim. */
  requested_ended_at timestamptz not null,
  reason             text not null check (length(trim(reason)) between 5 and 1000),
  status             text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by         uuid references public.profiles(id) on delete set null,
  decided_at         timestamptz,
  decision_note      text,
  created_at         timestamptz not null default now()
);
create index time_adjustment_requests_pending_idx
  on public.time_adjustment_requests (agency_id, created_at) where status = 'pending';
create unique index time_adjustment_requests_one_open
  on public.time_adjustment_requests (entry_id) where status = 'pending';

alter table public.time_adjustment_requests enable row level security;
revoke all on public.time_adjustment_requests from public, anon;
grant select on public.time_adjustment_requests to authenticated;

create policy time_adjustments_select on public.time_adjustment_requests
  for select to authenticated
  using (requested_by = auth.uid() or public.is_manager_of(agency_id));

comment on table public.time_adjustment_requests is
  'An agent''s claim that a time entry''s recorded end is wrong, with the reason. Agents never edit time directly (0236): a manager approves or declines, and the decision — both identities, both timestamps — is the audit trail. One open request per entry.';

/* The agent's side. A function rather than an INSERT grant so validation and
   the approver notification cannot be skipped. */
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
         'bes_internal'
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = auth.uid()
     and tm2.user_id <> auth.uid();
  return v_id;
end $function$;
revoke execute on function public.request_time_adjustment(uuid, timestamptz, text) from public, anon;
grant execute on function public.request_time_adjustment(uuid, timestamptz, text) to authenticated;

/* The manager's side. */
create or replace function public.decide_time_adjustment(
  p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_req   public.time_adjustment_requests;
  v_entry public.time_entries;
  v_actor text;
begin
  select * into v_req from public.time_adjustment_requests where id = p_request;
  if v_req.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided' using errcode = '22023';
  end if;
  if not public.is_manager_of(v_req.agency_id) then
    raise exception 'Only a manager or admin can decide a time adjustment' using errcode = '42501';
  end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'You cannot approve your own adjustment' using errcode = '42501';
  end if;

  select * into v_entry from public.time_entries where id = v_req.entry_id;
  if p_approve and (v_req.requested_ended_at <= v_entry.started_at or v_req.requested_ended_at > now()) then
    raise exception 'The requested stop time no longer makes sense for this entry' using errcode = '22023';
  end if;

  update public.time_adjustment_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  if p_approve then
    /* The one write that may move recorded time, and it carries a manager's
       name. auto_stopped clears: a human has now stated the truth. */
    update public.time_entries
       set ended_at = v_req.requested_ended_at, auto_stopped = false
     where id = v_req.entry_id;
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
          'bes_internal');
end $function$;
revoke execute on function public.decide_time_adjustment(uuid, boolean, text) from public, anon;
grant execute on function public.decide_time_adjustment(uuid, boolean, text) to authenticated;

----------------------------------------------------------------------
-- 7. The sweep runs on a clock of its own.
----------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('timer-auto-stop', '*/10 * * * *', $$select public.auto_stop_stale_timers()$$)
 where not exists (select 1 from cron.job where jobname = 'timer-auto-stop');
