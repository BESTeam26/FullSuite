-- =============================================================================
-- Two gates the doctrine (rule 16) requires and the schema did not enforce
--
-- 1. FULFILLMENT IS NOT SUBSCRIPTION.
--    `organizations.is_fulfillment_subscriber` existed as a column that no
--    policy read. BES staff could see every organization's operational records
--    whether or not BES was engaged to work them. The doctrine is explicit:
--    "BES Agency HQ access to organization records must depend on the
--    authorized fulfillment/service relationship and permissions."
--
--    Live data makes the gap concrete: of five organizations, Empire Capital &
--    Credit and Vantage Funding Group are SaaS-only. BES had full read/write on
--    their client records regardless.
--
-- 2. ENTITLEMENT WAS INTERFACE-ONLY.
--    `product_entitlements` gated nothing but itself. An organization entitled
--    to FundingOps only still had its CreditOps tables readable. Rule 1:
--    authorization is enforced in data access, not only in the interface.
--
-- What deliberately does NOT change: BES always sees the organization RECORD
-- (it is BES's customer — billing, settings, support), and always sees
-- outsourcing-only clients, which have no organization and are BES's own
-- contract work. Only a customer's OPERATIONAL records are gated.
--
-- This is not multi-agency work. There is one agency and there is meant to be
-- one; `organization_id` is the boundary being tightened here.
-- =============================================================================

/**
 * Is this organization entitled to this product?
 *
 * Default deny: an organization with no entitlement row for a product is not
 * entitled to it. NULL organization means an agency-owned record, which is not
 * entitlement-gated.
 */
create or replace function public.org_has_product(
  p_org uuid,
  p_product public.product_key
)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_org is null or exists (
    select 1 from public.product_entitlements
    where organization_id = p_org and product = p_product and enabled
  )
$$;

/**
 * May BES work this organization's records?
 *
 * Requires BES staff of the owning agency AND an authorized fulfillment
 * relationship. A NULL organization is outsourcing-only work that belongs to
 * BES directly, so staff membership alone is enough there.
 */
create or replace function public.bes_may_fulfil(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_org is null then public.is_staff_of(
      (select id from public.agencies order by created_at limit 1))
    else exists (
      select 1 from public.organizations o
      where o.id = p_org
        and o.is_fulfillment_subscriber
        and public.is_staff_of(o.agency_id)
    )
  end
$$;

revoke all on function public.org_has_product(uuid, public.product_key) from public, anon;
revoke all on function public.bes_may_fulfil(uuid) from public, anon;
grant execute on function public.org_has_product(uuid, public.product_key) to authenticated;
grant execute on function public.bes_may_fulfil(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- CreditOps client records
--
-- An organization's own members keep their access — this gates BES, not the
-- customer. Entitlement applies to both: a record for a module the organization
-- does not have should not be served to anyone.
-- -----------------------------------------------------------------------------
drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients for select to authenticated
  using (
    public.org_has_product(organization_id, 'creditOps')
    and (public.bes_may_fulfil(organization_id) or public.is_org_member(organization_id))
  );

drop policy if exists fulfillment_clients_insert on public.fulfillment_clients;
create policy fulfillment_clients_insert on public.fulfillment_clients for insert to authenticated
  with check (
    public.org_has_product(organization_id, 'creditOps')
    and public.bes_may_fulfil(organization_id)
    and public.is_staff_of(agency_id)
  );

drop policy if exists fulfillment_clients_update on public.fulfillment_clients;
create policy fulfillment_clients_update on public.fulfillment_clients for update to authenticated
  using (
    public.bes_may_fulfil(organization_id)
    and (assigned_agent_id = auth.uid() or public.is_manager_of(agency_id))
  )
  with check (public.bes_may_fulfil(organization_id) and public.is_staff_of(agency_id));

-- -----------------------------------------------------------------------------
-- FundingOps client records
-- -----------------------------------------------------------------------------
drop policy if exists funding_clients_select on public.funding_clients;
create policy funding_clients_select on public.funding_clients for select to authenticated
  using (
    public.org_has_product(organization_id, 'fundingOps')
    and (public.bes_may_fulfil(organization_id) or public.is_org_member(organization_id))
  );

drop policy if exists funding_clients_insert on public.funding_clients;
create policy funding_clients_insert on public.funding_clients for insert to authenticated
  with check (
    public.org_has_product(organization_id, 'fundingOps')
    and public.bes_may_fulfil(organization_id)
    and public.is_staff_of(agency_id)
  );

drop policy if exists funding_clients_update on public.funding_clients;
create policy funding_clients_update on public.funding_clients for update to authenticated
  using (
    public.bes_may_fulfil(organization_id)
    and (assigned_agent_id = auth.uid() or public.is_manager_of(agency_id))
  )
  with check (public.bes_may_fulfil(organization_id) and public.is_staff_of(agency_id));

-- -----------------------------------------------------------------------------
-- Department statuses follow their client, so the gate cannot be side-stepped
-- by reading the child table directly.
-- -----------------------------------------------------------------------------
drop policy if exists client_department_statuses_select on public.client_department_statuses;
create policy client_department_statuses_select
  on public.client_department_statuses for select to authenticated
  using (exists (
    select 1 from public.fulfillment_clients c
    where c.id = client_id
      and public.org_has_product(c.organization_id, 'creditOps')
      and (public.bes_may_fulfil(c.organization_id) or public.is_org_member(c.organization_id))
  ));

drop policy if exists funding_dept_select on public.funding_department_statuses;
create policy funding_dept_select
  on public.funding_department_statuses for select to authenticated
  using (exists (
    select 1 from public.funding_clients c
    where c.id = client_id
      and public.org_has_product(c.organization_id, 'fundingOps')
      and (public.bes_may_fulfil(c.organization_id) or public.is_org_member(c.organization_id))
  ));
