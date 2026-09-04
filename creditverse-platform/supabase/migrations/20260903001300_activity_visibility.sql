-- =============================================================================
-- Activity visibility
--
-- One canonical timeline, four audiences. The rule this enforces is
-- **association is not publication**: an event being linked to an organization,
-- client, case or deal says nothing about who may read it.
--
-- Why one table and not four: splitting per audience would mean the same status
-- change written twice, and every consumer joining across tables to rebuild a
-- timeline. Rule 2 — one canonical record, scoped views.
--
-- The default is the MOST restrictive level, so an event whose classification
-- someone forgot is BES-internal rather than published. Default deny, in the
-- column default.
-- =============================================================================

create type public.activity_visibility as enum (
  'bes_internal',           -- BES agency only. Never a customer, never a client.
  'organization_internal',  -- The customer's own staff. BES only with an engagement.
  'shared_with_partner',    -- BES and the customer, both working the relationship.
  'client_visible'          -- Approved for the end-client / borrower portal.
);

alter table public.activity_events
  add column if not exists visibility public.activity_visibility
  not null default 'bes_internal';

create index if not exists activity_events_visibility_idx
  on public.activity_events (entity_type, entity_id, visibility, created_at desc);

-- -----------------------------------------------------------------------------
-- Which BES service governs an event, derived from what it is about.
--
-- Derived rather than stored: a denormalised service column could drift from
-- the record it describes, and there is nothing to reconcile it against.
-- -----------------------------------------------------------------------------
create or replace function public.activity_service(p_entity_type text)
returns public.fulfillment_service
language sql immutable set search_path = public as $$
  select case p_entity_type
    when 'fulfillment_client' then 'creditops'::public.fulfillment_service
    when 'funding_client'     then 'fundingops'::public.fulfillment_service
    else null
  end
$$;

/**
 * May this caller read this event?
 *
 * Ordering matters. A customer's own staff are checked first, because an
 * organization member is never BES staff and the two branches answer
 * differently for the same row.
 *
 * Default deny: anything not matched returns false.
 */
create or replace function public.can_view_activity(
  p_agency uuid,
  p_org uuid,
  p_visibility public.activity_visibility,
  p_entity_type text
)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    -- The customer's own staff. BES-internal is never theirs to read, whatever
    -- record it hangs off.
    when p_org is not null and public.is_org_member(p_org) then
      p_visibility in ('organization_internal', 'shared_with_partner', 'client_visible')

    -- BES staff. Staff status alone is not access to a customer's material
    -- (rule 16) — the engagement decides.
    when public.is_staff_of(p_agency) then
      case p_visibility
        -- BES's own notes about BES's own work.
        when 'bes_internal' then true
        -- Reading a customer's internal material, or material shared with the
        -- partner, requires an active engagement for the governing service.
        -- Agency-scope events (no organization) are BES's own already.
        else
          p_org is null
          or public.bes_may_fulfil(p_org, null, public.activity_service(p_entity_type))
      end

    else false
  end
$$;

revoke all on function public.activity_service(text) from public, anon;
revoke all on function public.can_view_activity(uuid, uuid, public.activity_visibility, text) from public, anon;
grant execute on function public.activity_service(text) to authenticated;
grant execute on function public.can_view_activity(uuid, uuid, public.activity_visibility, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Classify what already exists, and what the triggers write from now on.
--
-- The split follows who the information is ABOUT:
--   operational movement on a customer's client  → shared_with_partner
--   who at BES is working it, BES workflow, EOD  → bes_internal
-- -----------------------------------------------------------------------------
update public.activity_events set visibility = 'shared_with_partner'
 where entity_type in ('fulfillment_client', 'funding_client')
   and action in ('Status changed', 'Client added', 'Contact updated',
                  'Round changed', 'Deal status changed');

update public.activity_events set visibility = 'bes_internal'
 where entity_type in ('work_item', 'eod_submission')
    or action in ('Assignee changed')
    or action like '% status changed';   -- per-department BES workflow

-- -----------------------------------------------------------------------------
-- Teach the triggers to classify. Each rewritten function is the same as
-- before plus an explicit visibility on every insert — a system event with no
-- classification is exactly the gap this migration closes.
-- -----------------------------------------------------------------------------
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
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, new_value, visibility)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Client added', new.name, new.status::text, 'shared_with_partner');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Status changed', old.status::text || ' → ' || new.status::text,
            'status', old.status::text, new.status::text, 'shared_with_partner');
  end if;

  -- Who at BES is working the file is BES's business, not the customer's.
  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = old.assigned_agent_id), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = new.assigned_agent_id), 'Unassigned'),
            'assigned_agent_id',
            old.assigned_agent_id::text, new.assigned_agent_id::text,
            'bes_internal');
  end if;

  if new.round is distinct from old.round then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Round changed', old.round::text || ' → ' || new.round::text,
            'round', old.round::text, new.round::text, 'shared_with_partner');
  end if;

  if new.email is distinct from old.email then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Email address changed', 'email',
            'shared_with_partner');
  end if;

  if new.phone is distinct from old.phone then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Phone number changed', 'phone',
            'shared_with_partner');
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
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, new_value, visibility)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Client added', new.name, new.status::text, 'shared_with_partner');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Status changed', old.status::text || ' → ' || new.status::text,
            'status', old.status::text, new.status::text, 'shared_with_partner');
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = old.assigned_agent_id), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = new.assigned_agent_id), 'Unassigned'),
            'assigned_agent_id',
            old.assigned_agent_id::text, new.assigned_agent_id::text,
            'bes_internal');
  end if;

  if new.email is distinct from old.email then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Email address changed', 'email',
            'shared_with_partner');
  end if;

  if new.phone is distinct from old.phone then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Phone number changed', 'phone',
            'shared_with_partner');
  end if;

  return new;
end $$;

/* Per-department progress is BES's internal workflow. */
create or replace function public.log_department_status_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
  v_prev  text;
begin
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
     action, detail, field, previous_value, new_value, visibility)
  values (v_org, 'fulfillment_client', new.client_id::text, auth.uid(), v_actor,
          new.department::text || ' status changed',
          coalesce(v_prev, '(none)') || ' → ' || new.status,
          'department_status', v_prev, new.status, 'bes_internal');
  return new;
end $$;

/* A deal moving is the money event; the partner sees it. */
create or replace function public.log_funding_deal_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
  v_prev  text;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    v_prev := old.status::text;
  end if;

  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  select organization_id into v_org
    from public.funding_clients where id = new.client_id;

  insert into public.activity_events
    (organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values (v_org, 'funding_client', new.client_id::text, auth.uid(), v_actor,
          'Deal status changed',
          new.lender || ': ' || coalesce(v_prev, '(new)') || ' → ' || new.status::text,
          'deal_status', v_prev, new.status::text, 'shared_with_partner');
  return new;
end $$;

/* EOD is BES workforce data and never leaves BES. */
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
    (organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values (null, 'eod_submission', new.id::text, auth.uid(), v_actor,
          case when tg_op = 'INSERT' then 'EOD started' else 'EOD state changed' end,
          coalesce(v_prev, '(new)') || ' → ' || new.state::text,
          'state', v_prev, new.state::text, 'bes_internal');
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- RLS: visibility decides, not the interface
-- -----------------------------------------------------------------------------
drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events for select to authenticated
  using (public.can_view_activity(agency_id, organization_id, visibility, entity_type));

/**
 * A writer may only publish as far as they are themselves allowed to read, and
 * BES may not post as the customer's own internal voice.
 */
drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_insert on public.activity_events for insert to authenticated
  with check (
    public.can_view_activity(agency_id, organization_id, visibility, entity_type)
    and (
      -- BES staff may post BES-internal, shared, or client-visible material.
      (public.is_staff_of(agency_id)
        and visibility in ('bes_internal', 'shared_with_partner', 'client_visible'))
      -- Organization staff may post their own internal notes or shared updates.
      or (organization_id is not null and public.is_org_member(organization_id)
        and visibility in ('organization_internal', 'shared_with_partner', 'client_visible'))
    )
  );
