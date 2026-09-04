-- =============================================================================
-- Activity triggers stamp the agency from the RECORD, not from the actor
--
-- `stamp_activity_agency` resolves the agency from the event's organization,
-- falling back to the acting user's membership. Both are unavailable when the
-- writer is not a signed-in user: an outsourcing-only client has no
-- organization, and a migration or a service-role job has no `auth.uid()`.
-- The stamp then raises, and the whole write fails.
--
-- Every one of these triggers fires on a row that already knows its agency, so
-- they now pass it explicitly. The stamp trigger stays as the backstop for
-- anything inserting activity by hand.
-- =============================================================================

create or replace function public.log_fulfillment_client_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
begin
  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  v_org := new.organization_id;

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Client added', new.name, new.status::text, 'shared_with_partner');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Status changed', old.status::text || ' → ' || new.status::text,
            'status', old.status::text, new.status::text, 'shared_with_partner');
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = old.assigned_agent_id), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = new.assigned_agent_id), 'Unassigned'),
            'assigned_agent_id',
            old.assigned_agent_id::text, new.assigned_agent_id::text, 'bes_internal');
  end if;

  if new.round is distinct from old.round then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Round changed', old.round::text || ' → ' || new.round::text,
            'round', old.round::text, new.round::text, 'shared_with_partner');
  end if;

  if new.email is distinct from old.email then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Email address changed', 'email', 'shared_with_partner');
  end if;

  if new.phone is distinct from old.phone then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Phone number changed', 'phone', 'shared_with_partner');
  end if;

  return new;
end $$;

create or replace function public.log_funding_client_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
begin
  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  v_org := new.organization_id;

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, new_value, visibility)
    values (new.agency_id, v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Client added', new.name, new.status::text, 'shared_with_partner');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Status changed', old.status::text || ' → ' || new.status::text,
            'status', old.status::text, new.status::text, 'shared_with_partner');
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = old.assigned_agent_id), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = new.assigned_agent_id), 'Unassigned'),
            'assigned_agent_id',
            old.assigned_agent_id::text, new.assigned_agent_id::text, 'bes_internal');
  end if;

  if new.email is distinct from old.email then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (new.agency_id, v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Email address changed', 'email', 'shared_with_partner');
  end if;

  if new.phone is distinct from old.phone then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (new.agency_id, v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Phone number changed', 'phone', 'shared_with_partner');
  end if;

  return new;
end $$;

create or replace function public.log_department_status_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  text;
  v_org    uuid;
  v_agency uuid;
  v_prev   text;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    v_prev := old.status;
  end if;

  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  select organization_id, agency_id into v_org, v_agency
    from public.fulfillment_clients where id = new.client_id;

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values (v_agency, v_org, 'fulfillment_client', new.client_id::text, auth.uid(), v_actor,
          new.department::text || ' status changed',
          coalesce(v_prev, '(none)') || ' → ' || new.status,
          'department_status', v_prev, new.status, 'bes_internal');
  return new;
end $$;

create or replace function public.log_funding_deal_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  text;
  v_org    uuid;
  v_agency uuid;
  v_prev   text;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    v_prev := old.status::text;
  end if;

  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  select organization_id, agency_id into v_org, v_agency
    from public.funding_clients where id = new.client_id;

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values (v_agency, v_org, 'funding_client', new.client_id::text, auth.uid(), v_actor,
          'Deal status changed',
          new.lender || ': ' || coalesce(v_prev, '(new)') || ' → ' || new.status::text,
          'deal_status', v_prev, new.status::text, 'shared_with_partner');
  return new;
end $$;

create or replace function public.log_eod_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_prev  text;
begin
  if tg_op = 'UPDATE' then
    if new.state is not distinct from old.state then
      return new;
    end if;
    v_prev := old.state::text;
  end if;

  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values (new.agency_id, null, 'eod_submission', new.id::text, auth.uid(), v_actor,
          case when tg_op = 'INSERT' then 'EOD started' else 'EOD state changed' end,
          coalesce(v_prev, '(new)') || ' → ' || new.state::text,
          'state', v_prev, new.state::text, 'bes_internal');
  return new;
end $$;
