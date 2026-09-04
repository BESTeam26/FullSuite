-- =============================================================================
-- Work Engine integrity: organization-owned work, production idempotency, and
-- the last agency-blind policies on operational tables
--
-- Three defects, each reproduced against the live database before this was
-- written (see BUILD_STATUS.md, Phase 3):
--
-- 1. `work_items_insert` was `is_staff_of(agency_id) AND can_write_work(...)`.
--    `can_write_work` contains an `is_org_member` branch that the `AND` made
--    unreachable, so an organization admin inserting ORGANIZATION-scope work
--    for their own organization got 42501. The canonical Work Engine must
--    carry BES-owned AND organization-owned work; today it carried only one.
--
-- 2. `production_logs` had no uniqueness beyond its primary key. Two identical
--    inserts in one transaction produced two rows. UI guards existed; the
--    database did not enforce "exactly once" for a completion.
--
-- 3. Seven operational policies still used `is_agency_staff()`, which asks
--    "is this person staff of ANY agency" — the agency-blind helper rule 16
--    calls a safety net, not an authorization.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Organization-owned work
--
-- An organization user cannot read `agencies` (correctly), so they cannot
-- supply `work_items.agency_id`. It is DERIVED here from the organization, on
-- the server, overriding anything the client sent — the agency context comes
-- from the record's tenancy, never from UI input (rule 16). The policy then
-- re-checks the derivation, so the two layers agree by construction.
-- -----------------------------------------------------------------------------
create or replace function public.work_items_derive_tenancy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scope = 'ORGANIZATION' then
    if new.organization_id is null then
      raise exception 'ORGANIZATION-scope work requires an organization' using errcode = '23502';
    end if;
    select o.agency_id into new.agency_id from public.organizations o where o.id = new.organization_id;
    if new.agency_id is null then
      raise exception 'Unknown organization' using errcode = '23503';
    end if;
  end if;
  -- Attribution is the caller, never a chosen value (rules 4, 10).
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

-- Also on UPDATE of the tenancy columns: moving an ORGANIZATION-scope item to
-- another organization must re-derive its agency rather than leave the old one
-- behind. (`work_items_update`'s WITH CHECK already requires membership in the
-- destination organization; this keeps the agency column truthful too.)
drop trigger if exists work_items_derive_tenancy on public.work_items;
create trigger work_items_derive_tenancy
  before insert or update of organization_id, scope on public.work_items
  for each row execute function public.work_items_derive_tenancy();

drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert on public.work_items for insert to authenticated
  with check (
    -- BES-owned work: staff of THIS agency. Reads are then scoped by in_scope.
    (scope = 'AGENCY' and public.is_staff_of(agency_id))
    -- Organization-owned work: a member of that organization, filed under the
    -- organization's own agency (the trigger set it; this proves it).
    or (scope = 'ORGANIZATION'
        and organization_id is not null
        and public.is_org_member(organization_id)
        and agency_id = (select o.agency_id from public.organizations o where o.id = organization_id))
    -- BES creating work inside a customer's space needs an engagement for the
    -- governing service. No division → no way to know the service → deny.
    or (scope = 'ORGANIZATION'
        and organization_id is not null
        and division is not null
        and public.is_staff_of(agency_id)
        and public.bes_may_fulfil(organization_id, null, division))
  );

-- -----------------------------------------------------------------------------
-- 2. Production idempotency, enforced by the database
--
-- The client mints one request id per submission intent and reuses it on every
-- retry. A second arrival hits this index and is reported as 23505, which the
-- data layer treats as "already recorded". Nullable and partial, so the eight
-- rows written before this exist unchanged; only new rows carry an id.
-- -----------------------------------------------------------------------------
alter table public.production_logs add column if not exists request_id uuid;
create unique index if not exists production_logs_request_idx
  on public.production_logs (agency_id, request_id) where request_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Agency-scoped writes on the operational tables that lacked them
--
-- These tables carry no agency_id of their own; they hang off a client that
-- does. Each policy now resolves the agency through that parent and asks
-- `is_staff_of` — and, where the parent is a scoped client, the EXISTS runs
-- under the caller's own RLS, so person-level scope on the client flows down
-- to its department statuses, deals and businesses without restating it.
-- -----------------------------------------------------------------------------
-- FOR ALL was the leak the review found: its USING is OR-ed into SELECT and it
-- also grants DELETE, so every staff member could read and erase every status.
-- Split into the two writes the workflow actually needs. No DELETE: department
-- state is history and is transitioned, not removed (rule 11).
drop policy if exists client_department_statuses_write on public.client_department_statuses;
create policy client_department_statuses_insert on public.client_department_statuses for insert to authenticated
  with check (exists (select 1 from public.fulfillment_clients c
                  where c.id = client_department_statuses.client_id and public.is_staff_of(c.agency_id)));
create policy client_department_statuses_update on public.client_department_statuses for update to authenticated
  using (exists (select 1 from public.fulfillment_clients c
                  where c.id = client_department_statuses.client_id and public.is_staff_of(c.agency_id)))
  with check (exists (select 1 from public.fulfillment_clients c
                  where c.id = client_department_statuses.client_id and public.is_staff_of(c.agency_id)));

drop policy if exists funding_dept_insert on public.funding_department_statuses;
create policy funding_dept_insert on public.funding_department_statuses for insert to authenticated
  with check (exists (select 1 from public.funding_clients c
                  where c.id = funding_department_statuses.client_id and public.is_staff_of(c.agency_id)));
drop policy if exists funding_dept_update on public.funding_department_statuses;
create policy funding_dept_update on public.funding_department_statuses for update to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = funding_department_statuses.client_id and public.is_staff_of(c.agency_id)));

drop policy if exists funding_deals_insert on public.funding_deals;
create policy funding_deals_insert on public.funding_deals for insert to authenticated
  with check (exists (select 1 from public.funding_clients c
                  where c.id = funding_deals.client_id and public.is_staff_of(c.agency_id)));
drop policy if exists funding_deals_update on public.funding_deals;
create policy funding_deals_update on public.funding_deals for update to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = funding_deals.client_id and public.is_staff_of(c.agency_id)));

drop policy if exists funding_businesses_write on public.funding_businesses;
create policy funding_businesses_write on public.funding_businesses for insert to authenticated
  with check (exists (select 1 from public.funding_clients c
                  where c.id = funding_businesses.client_id and public.is_staff_of(c.agency_id)));
drop policy if exists funding_businesses_update on public.funding_businesses;
create policy funding_businesses_update on public.funding_businesses for update to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = funding_businesses.client_id and public.is_staff_of(c.agency_id)));
