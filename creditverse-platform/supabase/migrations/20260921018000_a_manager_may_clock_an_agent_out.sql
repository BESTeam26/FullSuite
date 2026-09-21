-- A lead, a division manager or an executive may clock out somebody they manage.
--
-- Dee, 2026-09-21: "I also want the team lead, division head, and the
-- executives to have the capability Clock Out the agents."
--
-- The need is ordinary and daily: an agent closes their laptop with the timer
-- running. Until now the only cure was the 10-hour auto-stop, which files ten
-- hours against a day somebody worked seven, and then needs an adjustment
-- request to undo. A manager stopping it at the moment they notice is both
-- more accurate and faster.
--
-- ── WHO, EXACTLY ──────────────────────────────────────────────────────────
--
-- `managed_people()` and nothing else — the same scope the presence board
-- reads, so the four views answer the way they always do (rule 20b):
--
--   agent             manages nobody      → the function refuses every call
--   team lead         their teams' members
--   division manager  their division, and not the company
--   executive         the company
--
-- Scope is decided in the database, never by which button was rendered
-- (rule 1). Nobody may clock THEMSELVES out through this door: an agent's own
-- clock is their own, and a manager's own clock is My Time.
--
-- ── IT IS A CLOCK-OUT, NOT AN EDIT ────────────────────────────────────────
--
-- Stamped at the moment it happens and capped at ten hours, exactly like the
-- agent's own clock-out. It cannot set an arbitrary end — correcting a
-- finished entry stays an approved adjustment (0236). It writes an
-- `activity_events` row naming the actor, the agent, the entry and the times,
-- and it tells the agent, because somebody else ending your workday is not
-- something to discover on a payslip.
--
-- Cost: no recurring cost. One statement per press, plus one notification.

create or replace function public.manager_clock_out(p_user uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $function$
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
  if not exists (select 1 from public.managed_people() mp where mp.user_id = p_user) then
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

revoke execute on function public.manager_clock_out(uuid, text) from public, anon;
grant execute on function public.manager_clock_out(uuid, text) to authenticated;

comment on function public.manager_clock_out(uuid, text) is
  'Clock out somebody you manage, per managed_people(). Stamped at now and capped like any clock-out, audited to activity_events, and the agent is told. Never yourself (Dee, 2026-09-21).';
