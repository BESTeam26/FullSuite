-- P-013 (found by the full RLS gate, confirmed on live data, 2026-09-19):
-- Ivan Olympia is the assigned agent of a real client whose partner is not
-- assigned to him or his team, and since AD-004 (016000) he could not see it.
-- "Assignment always counts, whatever the ceiling" is the oldest rule in the
-- scope model (0904), and a person cannot be given a file they cannot open.
--
-- One arm, added, nothing widened: the caller is BES staff of the agency and
-- is the record's assigned agent. can_see_partner() and in_scope() are
-- untouched (Dee: "Do not broaden can_see_partner() or in_scope()"); the
-- directory, the partner arm and the organization arms read as in 025000.

drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients
  for select to authenticated
  using (
    client_id in (select public.my_client_ids())
    /* Your own assignment, always. */
    or (assigned_agent_id = auth.uid() and public.is_staff_of(agency_id))
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
    or (organization_id is not null
        and public.org_has_product(organization_id, 'creditOps'::public.product_key)
        and public.org_scope_allows(organization_id, assigned_agent_id))
  );
comment on policy fulfillment_clients_select on public.fulfillment_clients is
  'Read. Portal user; YOUR OWN ASSIGNMENT (always); partner-held (partner visible ∩ scope-or-directory); organization-held under a live engagement in scope; held by nobody in scope; the organization''s own staff by product + org scope.';
