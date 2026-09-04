-- =============================================================================
-- First-class fulfillment engagements
--
-- Replaces `organizations.is_fulfillment_subscriber` as the AUTHORIZATION
-- concept. A boolean could only answer "does BES fulfil for this company"; the
-- business needs "what exactly did they hire BES to do, is it active now, and
-- which BES team may work it".
--
--   Apex Credit Co.        CreditOps SaaS  YES   BES CreditOps fulfilment  YES
--                          FundingOps SaaS YES   BES Funding  fulfilment   NO
--
--   ABC Credit Repair      BES SaaS        NO    BES CreditOps fulfilment  YES
--
-- Neither line is expressible with one flag. The first needs per-service
-- authorization; the second needs an engagement with no organization at all.
--
-- SERVICE IS NOT ENTITLEMENT. `product_key` is what the customer bought in the
-- SaaS product. `fulfillment_service` is what BES was hired to perform. They
-- overlap in name and must not be merged: Apex is entitled to FundingOps as
-- software while BES fulfils only CreditOps for them.
--
-- Not reseller architecture. One agency, as rule 16 requires; `agency_id` here
-- is the BES side of the relationship, not a tenant axis.
-- =============================================================================

create type public.fulfillment_service as enum (
  'creditops', 'fundingops', 'bes_crm', 'talentops'
);

create type public.engagement_status as enum (
  'pending', 'active', 'paused', 'ended'
);

create table public.fulfillment_engagements (
  id                    uuid primary key default gen_random_uuid(),
  /** The BES side of the relationship. */
  agency_id             uuid not null references public.agencies(id) on delete cascade,

  /**
   * The partner. Exactly one of these identifies who BES is working for:
   *   organization_id      — a BES SaaS customer (model 2)
   *   outsourcing_group_id — a partner with no BES SaaS tenant (model 3)
   * Model 3 is why `organization_id` must be nullable.
   */
  organization_id       uuid references public.organizations(id) on delete cascade,
  outsourcing_group_id  uuid references public.outsourcing_groups(id) on delete cascade,

  service               public.fulfillment_service not null,
  status                public.engagement_status not null default 'active',

  effective_from        date not null default (now() at time zone 'utc')::date,
  /** NULL means open-ended. */
  effective_to          date,

  /** BES team or scope authorized to work it. NULL = any BES staff. */
  authorized_team       text,

  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint fulfillment_engagements_partner_ck check (
    (organization_id is not null and outsourcing_group_id is null) or
    (organization_id is null and outsourcing_group_id is not null)
  ),
  constraint fulfillment_engagements_dates_ck check (
    effective_to is null or effective_to >= effective_from
  )
);

/**
 * One live engagement per partner per service. Two overlapping "active" rows
 * for the same service would make authorization ambiguous, and the ambiguity
 * would resolve as "allowed" — the wrong direction.
 */
create unique index fulfillment_engagements_one_active_per_service
  on public.fulfillment_engagements (
    coalesce(organization_id, outsourcing_group_id), service
  )
  where status = 'active';

/* Shaped for the authorization lookup: partner + service + status is the exact
   predicate `bes_may_fulfil` runs, so it never scans (rule 14). */
create index fulfillment_engagements_lookup_idx
  on public.fulfillment_engagements (organization_id, service, status);
create index fulfillment_engagements_group_lookup_idx
  on public.fulfillment_engagements (outsourcing_group_id, service, status);
create index fulfillment_engagements_agency_idx
  on public.fulfillment_engagements (agency_id, status);

create trigger fulfillment_engagements_updated_at
  before update on public.fulfillment_engagements
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Migrate the existing legitimate relationships
--
-- Every organization currently flagged as a fulfillment subscriber gets an
-- active CreditOps engagement — CreditOps is the only service BES actually
-- fulfils today, and granting FundingOps too would widen access, which is
-- exactly the bug this table exists to prevent.
--
-- Outsourcing groups are model 3 and are already BES's own contract work, so
-- each gets an active CreditOps engagement to preserve current access.
-- -----------------------------------------------------------------------------
insert into public.fulfillment_engagements
  (agency_id, organization_id, service, status, effective_from)
select o.agency_id, o.id, 'creditops', 'active', current_date
  from public.organizations o
 where o.is_fulfillment_subscriber;

insert into public.fulfillment_engagements
  (agency_id, outsourcing_group_id, service, status, effective_from)
select g.agency_id, g.id, 'creditops', 'active', current_date
  from public.outsourcing_groups g;

-- -----------------------------------------------------------------------------
-- Authorization
-- -----------------------------------------------------------------------------

/** Is this engagement live today? Status plus the effective window. */
create or replace function public.engagement_is_live(
  p_status public.engagement_status,
  p_from date,
  p_to date
)
returns boolean
language sql immutable set search_path = public as $$
  select p_status = 'active'
     and p_from <= current_date
     and (p_to is null or p_to >= current_date)
$$;

/**
 * May BES work this record, for this service?
 *
 * Default deny: no active engagement, no access. Being BES staff is not
 * access (rule 16). A SaaS subscription is not access either — the engagement
 * is a separate purchase and this function never reads entitlements.
 *
 * Takes BOTH partner columns because a client record carries one or the other,
 * and model 3 records have no organization at all.
 */
create or replace function public.bes_may_fulfil(
  p_org uuid,
  p_group uuid,
  p_service public.fulfillment_service
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.fulfillment_engagements e
     where e.service = p_service
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
       and (
         (p_org is not null and e.organization_id = p_org) or
         (p_group is not null and e.outsourcing_group_id = p_group)
       )
       and public.is_staff_of(e.agency_id)
  )
$$;

revoke all on function public.bes_may_fulfil(uuid, uuid, public.fulfillment_service) from public, anon;
revoke all on function public.engagement_is_live(public.engagement_status, date, date) from public, anon;
grant execute on function public.bes_may_fulfil(uuid, uuid, public.fulfillment_service) to authenticated;
grant execute on function public.engagement_is_live(public.engagement_status, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS on the engagements themselves
-- -----------------------------------------------------------------------------
alter table public.fulfillment_engagements enable row level security;

/* A customer may see what BES is engaged to do for them — that is their own
   contract. They may not see other partners' engagements, and may not edit. */
create policy fulfillment_engagements_select
  on public.fulfillment_engagements for select to authenticated
  using (
    public.is_staff_of(agency_id)
    or (organization_id is not null and public.is_org_member(organization_id))
  );

create policy fulfillment_engagements_write
  on public.fulfillment_engagements for all to authenticated
  using (public.is_manager_of(agency_id))
  with check (public.is_manager_of(agency_id));

revoke all on public.fulfillment_engagements from anon;

-- -----------------------------------------------------------------------------
-- Re-point the record policies at the engagement
-- -----------------------------------------------------------------------------
drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients for select to authenticated
  using (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
    or (public.org_has_product(organization_id, 'creditOps')
        and public.is_org_member(organization_id))
  );

drop policy if exists fulfillment_clients_insert on public.fulfillment_clients;
create policy fulfillment_clients_insert on public.fulfillment_clients for insert to authenticated
  with check (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
    and public.is_staff_of(agency_id)
  );

drop policy if exists fulfillment_clients_update on public.fulfillment_clients;
create policy fulfillment_clients_update on public.fulfillment_clients for update to authenticated
  using (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
    and (assigned_agent_id = auth.uid() or public.is_manager_of(agency_id))
  )
  with check (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
    and public.is_staff_of(agency_id)
  );

drop policy if exists funding_clients_select on public.funding_clients;
create policy funding_clients_select on public.funding_clients for select to authenticated
  using (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
    or (public.org_has_product(organization_id, 'fundingOps')
        and public.is_org_member(organization_id))
  );

drop policy if exists funding_clients_insert on public.funding_clients;
create policy funding_clients_insert on public.funding_clients for insert to authenticated
  with check (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
    and public.is_staff_of(agency_id)
  );

drop policy if exists funding_clients_update on public.funding_clients;
create policy funding_clients_update on public.funding_clients for update to authenticated
  using (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
    and (assigned_agent_id = auth.uid() or public.is_manager_of(agency_id))
  )
  with check (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
    and public.is_staff_of(agency_id)
  );

/* Children follow their client, so the gate cannot be side-stepped. */
drop policy if exists client_department_statuses_select on public.client_department_statuses;
create policy client_department_statuses_select
  on public.client_department_statuses for select to authenticated
  using (exists (
    select 1 from public.fulfillment_clients c
    where c.id = client_id
      and (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
           or public.is_org_member(c.organization_id))
  ));

drop policy if exists funding_dept_select on public.funding_department_statuses;
create policy funding_dept_select
  on public.funding_department_statuses for select to authenticated
  using (exists (
    select 1 from public.funding_clients c
    where c.id = client_id
      and (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'fundingops')
           or public.is_org_member(c.organization_id))
  ));

comment on column public.organizations.is_fulfillment_subscriber is
  'PRESENTATION AND BILLING ONLY. Authorization moved to fulfillment_engagements '
  '(migration 0016). Never gate access on this column.';

-- -----------------------------------------------------------------------------
-- Retire the coarse check LAST, once no policy references it any more.
-- Dropping it earlier fails: Postgres refuses while dependents exist, which is
-- the database correctly refusing to leave a policy pointing at nothing.
-- -----------------------------------------------------------------------------
drop function if exists public.bes_may_fulfil(uuid);
