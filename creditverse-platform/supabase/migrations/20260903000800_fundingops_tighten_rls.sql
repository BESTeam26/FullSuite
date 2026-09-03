-- =============================================================================
-- Tighten FundingOps row policies
--
-- Migration 0011 shipped a single `FOR ALL` policy per table gated on
-- "agency staff OR a member of this organization". That is correct for SELECT
-- and far too permissive for everything else: it let any member of a customer
-- organization INSERT, UPDATE and DELETE funding clients, files and deals in
-- their own tenant — including deleting operational history, which rule 11
-- forbids outright.
--
-- CreditOps already splits these correctly (migration 0005). This brings
-- FundingOps to the same shape so the two divisions cannot drift:
--
--   select  → agency staff, or a member of the owning organization
--   insert  → agency staff only
--   update  → the assigned agent, or a manager
--   delete  → agency admin only
--
-- Rule 1 (default to deny), rule 3 (role + permission + scope + assignment),
-- rule 11 (history is not deleted by ordinary users).
-- =============================================================================

create or replace function public.can_view_funding_client(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_agency_staff() or (p_org is not null and public.is_org_member(p_org))
$$;

grant execute on function public.can_view_funding_client(uuid) to authenticated;
revoke execute on function public.can_view_funding_client(uuid) from public, anon;

-- -----------------------------------------------------------------------------
-- funding_clients
-- -----------------------------------------------------------------------------
drop policy if exists funding_clients_select on public.funding_clients;
drop policy if exists funding_clients_write  on public.funding_clients;

create policy funding_clients_select on public.funding_clients for select to authenticated
  using (public.can_view_funding_client(organization_id));

create policy funding_clients_insert on public.funding_clients for insert to authenticated
  with check (public.is_agency_staff());

create policy funding_clients_update on public.funding_clients for update to authenticated
  using (assigned_agent_id = auth.uid() or public.is_agency_manager_or_above())
  with check (public.is_agency_staff());

create policy funding_clients_delete on public.funding_clients for delete to authenticated
  using (public.is_agency_admin());

-- -----------------------------------------------------------------------------
-- Children follow their client's visibility for reads, and are agency-staff
-- writable. Deleting a business or a file removes funding history, so that
-- stays with an admin.
-- -----------------------------------------------------------------------------
drop policy if exists funding_businesses_all on public.funding_businesses;
drop policy if exists funding_files_all      on public.funding_files;
drop policy if exists funding_deals_all      on public.funding_deals;
drop policy if exists funding_dept_all       on public.funding_department_statuses;

create policy funding_businesses_select on public.funding_businesses for select to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and public.can_view_funding_client(c.organization_id)));
create policy funding_businesses_write on public.funding_businesses for insert to authenticated
  with check (public.is_agency_staff());
create policy funding_businesses_update on public.funding_businesses for update to authenticated
  using (public.is_agency_staff()) with check (public.is_agency_staff());
create policy funding_businesses_delete on public.funding_businesses for delete to authenticated
  using (public.is_agency_admin());

create policy funding_files_select on public.funding_files for select to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and public.can_view_funding_client(c.organization_id)));
create policy funding_files_insert on public.funding_files for insert to authenticated
  with check (public.is_agency_staff());
create policy funding_files_update on public.funding_files for update to authenticated
  using (assigned_agent_id = auth.uid() or public.is_agency_manager_or_above())
  with check (public.is_agency_staff());
create policy funding_files_delete on public.funding_files for delete to authenticated
  using (public.is_agency_admin());

create policy funding_deals_select on public.funding_deals for select to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and public.can_view_funding_client(c.organization_id)));
create policy funding_deals_insert on public.funding_deals for insert to authenticated
  with check (public.is_agency_staff());
create policy funding_deals_update on public.funding_deals for update to authenticated
  using (public.is_agency_staff()) with check (public.is_agency_staff());
create policy funding_deals_delete on public.funding_deals for delete to authenticated
  using (public.is_agency_admin());

/* Stage statuses are working state rather than history, so agency staff may
   maintain them; deletion still stays with an admin. */
create policy funding_dept_select on public.funding_department_statuses for select to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and public.can_view_funding_client(c.organization_id)));
create policy funding_dept_insert on public.funding_department_statuses for insert to authenticated
  with check (public.is_agency_staff());
create policy funding_dept_update on public.funding_department_statuses for update to authenticated
  using (public.is_agency_staff()) with check (public.is_agency_staff());
create policy funding_dept_delete on public.funding_department_statuses for delete to authenticated
  using (public.is_agency_admin());
