-- 016000 follow-up, minutes later: the directory arm had inherited
-- agency_can('partners.view') from the assignment arm, so a CreditOps user
-- without that key lost the directory even for partners assigned to their
-- team. The directory is opened by creditops.clients.view (via
-- creditops_directory_visible) and filled by can_see_partner; partners.view
-- stays where it was — on the per-record assignment arm.
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
  );
