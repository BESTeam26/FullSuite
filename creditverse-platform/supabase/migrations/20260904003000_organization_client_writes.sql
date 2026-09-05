-- =============================================================================
-- Organization client writes (approved by Dee, 2026-09-04)
--
-- Since 0027 §E only BES could insert/update fulfillment_clients and
-- funding_clients. An organization is a SaaS customer that owns and runs its
-- own operations (rule 16, model 1), so its members must be able to create and
-- update ITS OWN clients. Permissive OR alongside the BES policies:
--   insert  — organization admins/managers (is_org_admin), entitled product,
--             organization-owned record (never an outsourcing group), same agency
--   update  — members within the same reach the SELECT policy already grants
--             (org_scope_allows), entitled product, organization-owned record
-- Nothing about BES data or outsourcing-partner clients changes.
-- =============================================================================
create policy fulfillment_clients_org_insert on public.fulfillment_clients for insert to authenticated
  with check (organization_id is not null and outsourcing_group_id is null
              and public.org_has_product(organization_id, 'creditOps')
              and public.is_org_admin(organization_id)
              and agency_id = public.org_agency(organization_id));
create policy fulfillment_clients_org_update on public.fulfillment_clients for update to authenticated
  using (organization_id is not null and outsourcing_group_id is null
         and public.org_has_product(organization_id, 'creditOps')
         and public.org_scope_allows(organization_id, assigned_agent_id))
  with check (organization_id is not null and outsourcing_group_id is null
              and public.org_has_product(organization_id, 'creditOps'));
create policy funding_clients_org_insert on public.funding_clients for insert to authenticated
  with check (organization_id is not null and outsourcing_group_id is null
              and public.org_has_product(organization_id, 'fundingOps')
              and public.is_org_admin(organization_id)
              and agency_id = public.org_agency(organization_id));
create policy funding_clients_org_update on public.funding_clients for update to authenticated
  using (organization_id is not null and outsourcing_group_id is null
         and public.org_has_product(organization_id, 'fundingOps')
         and public.org_scope_allows(organization_id, assigned_agent_id))
  with check (organization_id is not null and outsourcing_group_id is null
              and public.org_has_product(organization_id, 'fundingOps'));
