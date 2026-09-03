-- =============================================================================
-- Audit trail for CreditOps fulfillment clients
--
-- Changing a client's status is the single most common action in the CreditOps
-- workspace, and until now it left no trace: no activity row, no audit row, no
-- record of who moved it or from what. Verified against the live database on
-- 2026-09-03 by changing a status through the interface and finding zero rows
-- written. That is a rule 10 failure, and in a credit-repair operation it is
-- the kind of gap a compliance review exists to catch.
--
-- This mirrors `log_work_activity` on work_items rather than inventing a second
-- pattern: same table, same shape, same append-only guarantee, so one timeline
-- component can read both.
--
-- Enforced in the DATABASE, not the client. A trigger cannot be skipped by a
-- caller that forgets to log, by a direct PostgREST write, or by a future
-- screen that talks to the table without going through the store (rule 1: the
-- interface is never the enforcement point).
-- =============================================================================

create or replace function public.log_fulfillment_client_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
begin
  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();

  -- Outsourcing-only clients have no organization; NULL means agency scope,
  -- which the activity_events policies already read as "BES staff only".
  v_org := new.organization_id;

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, new_value)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Client added', new.name, new.status::text);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Status changed', old.status::text || ' → ' || new.status::text,
            'status', old.status::text, new.status::text);
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = old.assigned_agent_id), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = new.assigned_agent_id), 'Unassigned'),
            'assigned_agent_id',
            old.assigned_agent_id::text, new.assigned_agent_id::text);
  end if;

  if new.round is distinct from old.round then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Round changed', old.round::text || ' → ' || new.round::text,
            'round', old.round::text, new.round::text);
  end if;

  -- Contact edits are recorded as "changed", never with the values themselves:
  -- an append-only timeline that quotes an email address becomes a second,
  -- unerasable copy of personal data (rule 1).
  if new.email is distinct from old.email then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Email address changed', 'email');
  end if;

  if new.phone is distinct from old.phone then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Phone number changed', 'phone');
  end if;

  return new;
end $$;

create trigger fulfillment_clients_activity_insert
  after insert on public.fulfillment_clients
  for each row execute function public.log_fulfillment_client_activity();

create trigger fulfillment_clients_activity_update
  after update on public.fulfillment_clients
  for each row execute function public.log_fulfillment_client_activity();

-- Department status moves are operational history too.
create or replace function public.log_department_status_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
  v_prev  text;
begin
  -- OLD is unassigned during INSERT, and SQL's AND does not guarantee
  -- short-circuit evaluation, so the two cases are separated rather than
  -- combined into one condition that could read OLD on an insert.
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    v_prev := old.status;
  end if;

  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  select organization_id into v_org
    from public.fulfillment_clients where id = new.client_id;

  insert into public.activity_events
    (organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value)
  values (v_org, 'fulfillment_client', new.client_id::text, auth.uid(), v_actor,
          new.department::text || ' status changed',
          coalesce(v_prev, '(none)') || ' → ' || new.status,
          'department_status',
          v_prev, new.status);
  return new;
end $$;

create trigger client_department_statuses_activity
  after insert or update on public.client_department_statuses
  for each row execute function public.log_department_status_activity();

-- -----------------------------------------------------------------------------
-- Grants. Learned in migrations 0003/0004: a SECURITY DEFINER function is
-- reachable through TWO independent grants — Supabase's grant to `anon` and
-- Postgres's default grant to PUBLIC. Revoking one leaves the other open.
-- Trigger functions are not callable through PostgREST, but these run as the
-- definer, so they are locked down explicitly rather than by assumption.
-- -----------------------------------------------------------------------------
revoke execute on function public.log_fulfillment_client_activity() from public, anon;
revoke execute on function public.log_department_status_activity() from public, anon;
