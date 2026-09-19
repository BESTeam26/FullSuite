-- P-012 (found by the full RLS gate, 2026-09-19): the customer's own staff
-- could not read their own CreditOps clients. 20260913004300 rewrote
-- fulfillment_clients_select around the shared directory and dropped the
-- organization arm that 20260907000600 carried ("The customer's own staff,
-- in their own workspace. Untouched."); 20260919016000/016100 inherited the
-- omission. No real organization user exists yet, so nobody was hurt — but
-- the Organization platform is paused, not removed (rule 16b), and its
-- foundation must keep working. The arm returns exactly as it read on Sep 7.
-- Everything else in the policy is unchanged from 016100.

drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients
  for select to authenticated
  using (
    client_id in (select public.my_client_ids())
    or (outsourcing_group_id is not null
        and public.bes_holds_partner(outsourcing_group_id)
        and public.can_see_partner(outsourcing_group_id)
        and ((public.agency_can('partners.view')
              and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))
             or public.creditops_directory_visible(agency_id)))
    or (outsourcing_group_id is null and organization_id is not null
        and public.bes_may_fulfil(organization_id, null, 'creditops'::public.fulfillment_service)
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))
    or (outsourcing_group_id is null and organization_id is null
        and public.is_staff_of(agency_id)
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))
    /* The customer's own staff, in their own workspace (0907, restored). */
    or (organization_id is not null
        and public.org_has_product(organization_id, 'creditOps'::public.product_key)
        and public.org_scope_allows(organization_id, assigned_agent_id))
  );
comment on policy fulfillment_clients_select on public.fulfillment_clients is
  'Read. Portal user; partner-held (partner visible ∩ scope-or-directory); organization-held under a live engagement in scope; held by nobody in scope; and the organization''s own staff by product + org scope (restored 2026-09-19).';
