-- An inactive person holds no work and is never offered any.
--
-- Dee, 2026-10-15, on Leslie Caudillo Zamora's file: "I cant choose active
-- Agents here. Also, remove from the options and all work everyone that is
-- inactive."
--
-- What the live database held that morning: 635 department rows and 585
-- client files still assigned to people deactivated weeks ago (Jet Manugas
-- alone: 395 rows). Deactivation (set_agency_member_status, 20260907001000)
-- changed the membership and nothing else, so the work stayed in a queue
-- nobody opens, and every assignee picker still listed them.
--
-- Three things, each the smallest form of the rule:
--   1. RELEASE. Every open assignment held by an inactive member is set back
--      to unassigned, with the reason recorded on the row (the same shape
--      20261003004000 used to release test clients from real staff). The
--      headline assignee on the client follows. Nothing is deleted; the
--      activity triggers write the change as usual.
--   2. GUARD. An inactive member cannot be assigned work — a department
--      row, a client headline or a work item. The guard refuses an explicit
--      choice (42501) so the person choosing is told, and releases a
--      system assignment silently with the reason recorded (the sweep's
--      picker already chooses only active staff; this is the backstop).
--   3. DEACTIVATION RELEASES. set_agency_member_status(..., 'inactive') now
--      releases the person's open work in the same transaction, so the
--      queues are honest the moment somebody leaves.
--
-- Who may be OFFERED is the interface's job (assignablePeople() filters
-- every picker to active members); this is the rule underneath it.
-- Cost impact: none.

create or replace function public.is_active_member(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.status = 'active')
$$;
revoke execute on function public.is_active_member(uuid) from anon, public;
grant execute on function public.is_active_member(uuid) to authenticated;

/* ── 2. Guards ──────────────────────────────────────────────────────────── */

create or replace function public.department_row_refuses_inactive_assignee()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not public.is_active_member(new.assignee_id) then
    /* A person's explicit choice is refused so they are told; the sweep,
       a handoff or a partner action releases silently with the reason. */
    if new.assignment_method in ('manual_override', 'team_lead') then
      raise exception 'That person is no longer active and cannot be assigned work' using errcode = '42501';
    end if;
    new.assignee_id := null;
    new.assignment_method := null;
    new.assignment_reason := 'Released: the person is no longer active';
  end if;
  return new;
end $$;

drop trigger if exists client_department_statuses_inactive_guard on public.client_department_statuses;
create trigger client_department_statuses_inactive_guard
  before insert or update of assignee_id on public.client_department_statuses
  for each row execute function public.department_row_refuses_inactive_assignee();

create or replace function public.client_headline_refuses_inactive_assignee()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.assigned_agent_id is not null
     and (tg_op = 'INSERT' or new.assigned_agent_id is distinct from old.assigned_agent_id)
     and not public.is_active_member(new.assigned_agent_id) then
    raise exception 'That person is no longer active and cannot be assigned work' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists fulfillment_clients_inactive_guard on public.fulfillment_clients;
create trigger fulfillment_clients_inactive_guard
  before insert or update of assigned_agent_id on public.fulfillment_clients
  for each row execute function public.client_headline_refuses_inactive_assignee();

create or replace function public.work_item_refuses_inactive_assignee()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and exists (select 1 from public.agency_memberships m where m.user_id = new.assigned_to)
     and not public.is_active_member(new.assigned_to) then
    raise exception 'That person is no longer active and cannot be assigned work' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists work_items_inactive_guard on public.work_items;
create trigger work_items_inactive_guard
  before insert or update of assigned_to on public.work_items
  for each row execute function public.work_item_refuses_inactive_assignee();

/* ── 3. Deactivation releases the person's open work ───────────────────── */

create or replace function public.release_work_of_inactive_member(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_rows int := 0;
  v_n int;
begin
  update public.client_department_statuses s
     set assignee_id = null, assigned_at = now(), assignment_method = null,
         assignment_reason = 'Released: the person is no longer active'
    from public.fulfillment_clients c
   where c.id = s.client_id and c.archived_at is null
     and s.assignee_id = p_user;
  get diagnostics v_n = row_count; v_rows := v_rows + v_n;

  update public.fulfillment_clients
     set assigned_agent_id = null
   where archived_at is null and assigned_agent_id = p_user;
  get diagnostics v_n = row_count; v_rows := v_rows + v_n;

  update public.funding_clients
     set assigned_agent_id = null
   where assigned_agent_id = p_user;
  get diagnostics v_n = row_count; v_rows := v_rows + v_n;

  update public.work_items
     set assigned_to = null, updated_at = now()
   where completed_at is null and archived_at is null and assigned_to = p_user;
  get diagnostics v_n = row_count; v_rows := v_rows + v_n;

  return v_rows;
end $$;
revoke all on function public.release_work_of_inactive_member(uuid) from public, anon, authenticated;

create or replace function public.set_agency_member_status(
  p_membership uuid,
  p_status     text
)
returns void
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid; v_role public.agency_role; v_user uuid; v_actor text; v_released int;
begin
  select m.agency_id, m.role, m.user_id into v_agency, v_role, v_user
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Status must be active or inactive';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change who is active';
  end if;
  if v_role = 'agency_owner' and p_status = 'inactive' then
    raise exception 'An agency owner cannot be deactivated. Change the role first, deliberately.';
  end if;
  if v_user = auth.uid() and p_status = 'inactive' then
    raise exception 'You cannot deactivate yourself';
  end if;
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  update public.agency_memberships
     set status = p_status,
         deactivated_at = case when p_status = 'inactive' then now() else null end,
         deactivated_by = case when p_status = 'inactive' then auth.uid() else null end
   where id = p_membership;
  /* The person's open work goes back to the queue with them gone. */
  if p_status = 'inactive' then
    v_released := public.release_work_of_inactive_member(v_user);
  end if;
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          case when p_status = 'inactive' then 'Member deactivated' else 'Member restored' end,
          'status', case when p_status = 'inactive' then 'active' else 'inactive' end,
          p_status || case when coalesce(v_released, 0) > 0 then ' · ' || v_released || ' open assignments released' else '' end,
          'bes_internal');
end;
$function$;

/* ── 1. Release what inactive people hold today ────────────────────────── */

do $$
declare r record; v_total int := 0; v_n int;
begin
  for r in
    select distinct m.user_id
      from public.agency_memberships m
     where m.status <> 'active'
  loop
    v_n := public.release_work_of_inactive_member(r.user_id);
    v_total := v_total + v_n;
  end loop;
  raise notice 'Released % open assignments held by inactive members', v_total;
end $$;
