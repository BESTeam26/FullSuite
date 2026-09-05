-- =============================================================================
-- Separation step 1: department / work status becomes real data.
--
-- The rows existed (client_department_statuses, funding_department_statuses)
-- but only BES could write them and no screen did. Two changes:
--   1. Organization members may write the rows of THEIR OWN clients, within the
--      reach the client policies already grant (the same organization-write
--      rule Dee approved for client records, 0050) — entitled product only.
--   2. One function per division sets a department's status (and optional
--      assignee) and writes the activity event in the same transaction, as the
--      caller (SECURITY INVOKER): policies decide, the function guarantees the
--      audit trail cannot be skipped. Status vocabulary is validated against
--      the Status Guide codes mirrored here; department is the enum.
-- Credit status (fulfillment_clients.status/round) is untouched: three truths,
-- three places.
-- =============================================================================

create policy client_department_statuses_org_insert on public.client_department_statuses for insert to authenticated
  with check (exists (select 1 from public.fulfillment_clients c
                where c.id = client_department_statuses.client_id
                  and c.organization_id is not null and c.outsourcing_group_id is null
                  and public.org_has_product(c.organization_id, 'creditOps')
                  and public.org_scope_allows(c.organization_id, c.assigned_agent_id)));
create policy client_department_statuses_org_update on public.client_department_statuses for update to authenticated
  using (exists (select 1 from public.fulfillment_clients c
            where c.id = client_department_statuses.client_id
              and c.organization_id is not null and c.outsourcing_group_id is null
              and public.org_has_product(c.organization_id, 'creditOps')
              and public.org_scope_allows(c.organization_id, c.assigned_agent_id)))
  with check (exists (select 1 from public.fulfillment_clients c
            where c.id = client_department_statuses.client_id
              and c.organization_id is not null and c.outsourcing_group_id is null
              and public.org_has_product(c.organization_id, 'creditOps')));

create policy funding_department_statuses_org_insert on public.funding_department_statuses for insert to authenticated
  with check (exists (select 1 from public.funding_clients c
                where c.id = funding_department_statuses.client_id
                  and c.organization_id is not null and c.outsourcing_group_id is null
                  and public.org_has_product(c.organization_id, 'fundingOps')
                  and public.org_scope_allows(c.organization_id, c.assigned_agent_id)));
create policy funding_department_statuses_org_update on public.funding_department_statuses for update to authenticated
  using (exists (select 1 from public.funding_clients c
            where c.id = funding_department_statuses.client_id
              and c.organization_id is not null and c.outsourcing_group_id is null
              and public.org_has_product(c.organization_id, 'fundingOps')
              and public.org_scope_allows(c.organization_id, c.assigned_agent_id)))
  with check (exists (select 1 from public.funding_clients c
            where c.id = funding_department_statuses.client_id
              and c.organization_id is not null and c.outsourcing_group_id is null
              and public.org_has_product(c.organization_id, 'fundingOps')));

/** Status Guide codes per CreditOps department — mirrored by creditops-status-guide.ts. */
create or replace function public.creditops_department_statuses(p_department public.fulfillment_department)
returns text[] language sql immutable as $$
  select case p_department
    when 'Onboarding'     then array['OB NOT STARTED','OB IN REVIEW','DOCS PENDING','MONITORING PENDING','ACCESS VERIFIED','OB READY FOR R1','PARTNER ENDORSED','OB INCOMPLETE']
    when 'Dispute'        then array['NEW ONBOARDING','INCOMPLETE ONBOARDING','READY FOR ROUND 1','READY FOR PROCESSING','ROUND SENT - AWAITING RESULTS','READY FOR REIMPORT / REVIEW','WAITING FOR PARTNER APPROVAL','COMPLETED','ARCHIVED / INACTIVE']
    when 'Support'        then array['SUPPORT NEW','ONBOARDING FOLLOWUP','READY FOR REIMPORT','MONITORING ISSUE','BILLING ISSUE','WAITING CLIENT RESPONSE','ESCALATED TO MANAGEMENT','SUPPORT RESOLVED']
    when 'Complaints'     then array['CM NOT NEEDED','LETTERS PENDING','LETTERS MAILED','CFPB FILED','FTC FILED','BBB FILED','AG FILED','CM AWAITING RESPONSE','CM COMPLETED']
    when 'Bureau Calling' then array['BC NOT NEEDED','BC NEEDED','BC IN PROGRESS','BC COMPLETED']
  end
$$;

create or replace function public.set_client_department_status(
  p_client uuid, p_department public.fulfillment_department, p_status text, p_assignee uuid default null, p_note text default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  c        public.fulfillment_clients%rowtype;
  v_prev   text;
  v_status text := upper(trim(p_status));
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  if not (v_status = any (public.creditops_department_statuses(p_department))) then
    raise exception 'Unknown status % for %', p_status, p_department using errcode = '22023';
  end if;
  select status into v_prev from public.client_department_statuses where client_id = p_client and department = p_department;

  insert into public.client_department_statuses (client_id, department, status, assignee_id)
  values (p_client, p_department, v_status, p_assignee)
  on conflict (client_id, department) do update set status = excluded.status, assignee_id = excluded.assignee_id, updated_at = now();

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(),
          'Department status', coalesce(p_note, p_department::text || ' → ' || v_status), 'department:' || p_department::text, v_prev, v_status,
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $$;
revoke execute on function public.set_client_department_status(uuid, public.fulfillment_department, text, uuid, text) from public, anon;
grant execute on function public.set_client_department_status(uuid, public.fulfillment_department, text, uuid, text) to authenticated;
revoke execute on function public.creditops_department_statuses(public.fulfillment_department) from public, anon;
grant execute on function public.creditops_department_statuses(public.fulfillment_department) to authenticated;
