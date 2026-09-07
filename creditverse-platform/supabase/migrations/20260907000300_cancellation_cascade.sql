-- 0162 — cancelling is one action, not five screens.
--
-- ---------------------------------------------------------------------------
-- WHAT CANCELLING A SERVICE HAS TO DO, AND WHAT IT MUST NOT
--
-- Dee, 2026-09-07: "Do not rely on Dee manually visiting five screens." When a
-- service ends, billing must stop, the run-rate must drop, the work must leave
-- the active queues and the people on it must be freed — all of it, or the
-- system quietly keeps billing for something nobody is doing.
--
-- Equally: it must stay INSIDE that service's scope.
--
--   Partner has CreditOps (cancelled) and BES CRM (active).
--     → CreditOps work archived, CreditOps billing stopped, CreditOps MRR gone
--     → BES CRM untouched, its $299 still in MRR
--     → the PARTNER stays ACTIVE
--
-- And nothing historical is destroyed. Not a client, not an invoice, not a
-- payment, not a production record, not an EOD, not who worked what. Archived
-- means "out of the active view", never "gone" (rule 11).
-- ---------------------------------------------------------------------------

-- ── Work can belong to a partner, and to one of its services ────────────
alter table public.work_items
  add column if not exists partner_service_id uuid references public.partner_services(id) on delete set null,
  add column if not exists partner_group_id   uuid references public.outsourcing_groups(id) on delete set null,
  /** Out of the active queues, still in the record. */
  add column if not exists archived_at        timestamptz,
  add column if not exists archived_reason    text,
  /** Who had it when it was archived. Releasing an assignee must not erase
      who was doing the work — historical attribution does not change when a
      current assignment does (rule 4). */
  add column if not exists previous_assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists work_items_partner_service_idx
  on public.work_items (partner_service_id) where partner_service_id is not null;
create index if not exists work_items_partner_group_idx
  on public.work_items (partner_group_id) where partner_group_id is not null;
create index if not exists work_items_active_idx
  on public.work_items (agency_id, stage) where archived_at is null;

comment on column public.work_items.archived_at is
  'Out of active queues, kept in full. Set by the cancellation cascade; the assignee is released at the same moment and remembered in previous_assigned_to.';

-- ── A workspace may belong to one service ───────────────────────────────
alter table public.workspaces
  add column if not exists partner_service_id uuid references public.partner_services(id) on delete set null,
  add column if not exists partner_group_id   uuid references public.outsourcing_groups(id) on delete set null;

comment on column public.workspaces.partner_service_id is
  'Set where a workspace exists only to run one service. Only these are archived when that service is cancelled — a shared workspace is never archived out from under the work that is still live.';

-- ── Cancel ONE service, and everything that hangs off it ────────────────
create or replace function public.cancel_partner_service(
  p_service   uuid,
  p_effective date default current_date,
  p_reason    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid;
  v_group  uuid;
  v_name   text;
  v_type   text;
  v_actor  text;
  v_schedule int := 0;
  v_work     int := 0;
  v_spaces   int := 0;
  v_clients  int := 0;
  v_live_after int := 0;
begin
  select s.agency_id, s.group_id, s.name, s.service_type
    into v_agency, v_group, v_name, v_type
    from public.partner_services s where s.id = p_service;
  if v_agency is null then
    raise exception 'Service not found';
  end if;

  /* Authorization is checked here, not inherited from the caller's session:
     this function is DEFINER and would otherwise bypass every policy. */
  if not (public.is_staff_of(v_agency) and public.agency_can('partners.edit')) then
    raise exception 'Not authorized to cancel a service for this partner';
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  -- 1. The engagement itself.
  update public.partner_services
     set status = 'cancelled',
         cancellation_effective_on = p_effective,
         cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
         ended_on = coalesce(ended_on, p_effective)
   where id = p_service;

  -- 2. Future obligations stop. Anything already DUE stands: cancelling
  --    forward is not erasing backwards, and an invoice already earned is
  --    still owed.
  with stopped as (
    update public.partner_billing_schedule
       set status = 'cancelled'
     where service_id = p_service and status = 'scheduled' and due_on >= p_effective
    returning 1
  ) select count(*) into v_schedule from stopped;

  -- 3. Open work for THIS service leaves the active queues, and its assignee
  --    is released — remembered, not erased.
  with archived as (
    update public.work_items
       set archived_at = now(),
           archived_reason = 'Service cancelled: ' || v_name,
           previous_assigned_to = coalesce(previous_assigned_to, assigned_to),
           assigned_to = null
     where partner_service_id = p_service
       and archived_at is null
       and completed_at is null
    returning 1
  ) select count(*) into v_work from archived;

  -- 4. Only workspaces that exist FOR this service. A shared one stays.
  with closed as (
    update public.workspaces
       set archived_at = now()
     where partner_service_id = p_service and archived_at is null
    returning 1
  ) select count(*) into v_spaces from closed;

  -- 5. End clients leave the active queues ONLY when the partner has no other
  --    live fulfilment service to work them under. Their records are
  --    untouched: archived_at is a view filter, and status, history, letters
  --    and activity all stay exactly as they were.
  select count(*) into v_live_after
    from public.partner_services s
   where s.group_id = v_group
     and s.id <> p_service
     and s.status in ('active', 'onboarding')
     and coalesce(s.service_type, '') in ('CREDITOPS_FULFILLMENT', 'FUNDINGOPS');

  if coalesce(v_type, '') in ('CREDITOPS_FULFILLMENT', 'FUNDINGOPS') and v_live_after = 0 then
    with parked as (
      update public.fulfillment_clients
         set archived_at = now()
       where outsourcing_group_id = v_group and archived_at is null
      returning 1
    ) select count(*) into v_clients from parked;
  end if;

  -- 6. History.
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, detail, visibility)
  values (v_agency, 'partner', v_group::text, auth.uid(), v_actor,
          'Service cancelled', 'service_status', 'active', 'cancelled',
          v_name || ' — effective ' || p_effective::text
            || coalesce('. ' || nullif(trim(coalesce(p_reason, '')), ''), '')
            || format('. Stopped %s scheduled charge(s), archived %s work item(s), %s workspace(s), %s client file(s).',
                      v_schedule, v_work, v_spaces, v_clients),
          'bes_internal');

  return jsonb_build_object(
    'service', v_name,
    'effective', p_effective,
    'scheduled_cancelled', v_schedule,
    'work_archived', v_work,
    'workspaces_archived', v_spaces,
    'clients_parked', v_clients,
    'partner_still_active', exists (
      select 1 from public.partner_services s
       where s.group_id = v_group and s.status in ('active', 'onboarding', 'pending')
    )
  );
end;
$function$;
revoke execute on function public.cancel_partner_service(uuid, date, text) from public, anon;
grant execute on function public.cancel_partner_service(uuid, date, text) to authenticated;

comment on function public.cancel_partner_service(uuid, date, text) is
  'Ends ONE service engagement and everything that hangs off it: future billing, its own open work, its own workspace, and the assignments on that work. Scope-aware — another live service is untouched, and the partner stays active. Nothing is deleted.';

-- ── Archive the whole partner, when there is genuinely nothing left ─────
create or replace function public.archive_partner(
  p_group  uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid;
  v_name   text;
  v_actor  text;
  v_live   text[];
  v_work    int := 0;
  v_spaces  int := 0;
  v_clients int := 0;
  v_portal  int := 0;
begin
  select g.agency_id, g.name into v_agency, v_name
    from public.outsourcing_groups g where g.id = p_group;
  if v_agency is null then
    raise exception 'Partner not found';
  end if;
  if not (public.is_staff_of(v_agency) and public.agency_can('partners.archive')) then
    raise exception 'Not authorized to archive this partner';
  end if;

  /* Refuses rather than cascading through live work. Archiving a partner who
     still has a running service would stop BES doing something it is being
     paid for, so the live services are named and the caller decides. */
  select array_agg(s.name) into v_live
    from public.partner_services s
   where s.group_id = p_group and s.status in ('active', 'onboarding');
  if v_live is not null and array_length(v_live, 1) > 0 then
    raise exception 'Cannot archive %: still running %', v_name, array_to_string(v_live, ', ');
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  with archived as (
    update public.work_items
       set archived_at = now(),
           archived_reason = 'Partner archived: ' || v_name,
           previous_assigned_to = coalesce(previous_assigned_to, assigned_to),
           assigned_to = null
     where partner_group_id = p_group and archived_at is null and completed_at is null
    returning 1
  ) select count(*) into v_work from archived;

  with closed as (
    update public.workspaces set archived_at = now()
     where partner_group_id = p_group and archived_at is null
    returning 1
  ) select count(*) into v_spaces from closed;

  with parked as (
    update public.fulfillment_clients set archived_at = now()
     where outsourcing_group_id = p_group and archived_at is null
    returning 1
  ) select count(*) into v_clients from parked;

  /* Portal access ends. Suspended, not deleted — a contact who has signed in
     is history, and restoring the partner restores them. */
  with suspended as (
    update public.partner_contacts set status = 'suspended'
     where group_id = p_group and status = 'active'
    returning 1
  ) select count(*) into v_portal from suspended;

  update public.outsourcing_groups
     set lifecycle = 'archived', ended_on = coalesce(ended_on, current_date)
   where id = p_group;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     new_value, detail, visibility)
  values (v_agency, 'partner', p_group::text, auth.uid(), v_actor,
          'Partner archived', 'lifecycle', 'archived',
          coalesce(nullif(trim(coalesce(p_reason, '')), '') || '. ', '')
            || format('Archived %s work item(s), %s workspace(s), %s client file(s); suspended %s portal contact(s). Every record kept.',
                      v_work, v_spaces, v_clients, v_portal),
          'bes_internal');

  return jsonb_build_object(
    'partner', v_name, 'work_archived', v_work, 'workspaces_archived', v_spaces,
    'clients_parked', v_clients, 'portal_suspended', v_portal
  );
end;
$function$;
revoke execute on function public.archive_partner(uuid, text) from public, anon;
grant execute on function public.archive_partner(uuid, text) to authenticated;

comment on function public.archive_partner(uuid, text) is
  'Ends the whole relationship once no service is running. Refuses while one is, naming it. Clients, work, invoices, payments, production, EOD, files and activity are all kept — only the active views change.';
