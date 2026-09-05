-- CreditOps ⇄ FundingOps hand-off, part 2 (approved 2026-09-04). See
-- ARCHITECTURE_PROPOSAL_FUNDING_READINESS_HANDOFF.md. SECURITY INVOKER: the caller
-- must already be allowed to write both records under existing policies (BES in
-- scope, or — since 0050 — the organization's own admins/members); the functions
-- add atomicity and the activity trail, never a bypass.
-- Send a funding client to CreditOps for funding readiness. Links an existing
-- CreditOps client (p_existing_client, confirmed by the agent) or creates one.
create or replace function public.handoff_to_creditops(p_funding_client uuid, p_existing_client uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  f public.funding_clients%rowtype;
  v_client uuid;
begin
  select * into f from public.funding_clients where id = p_funding_client;
  if f.id is null then raise exception 'Funding client not visible' using errcode = '42501'; end if;
  if f.status not in ('Onboarding', 'Readiness Review', 'Declined') then
    raise exception 'A client in % is past readiness' , f.status using errcode = '22023';
  end if;
  if f.organization_id is not null and not public.org_entitled(f.organization_id, 'creditOps') then
    raise exception 'Organization is not entitled to CreditOps' using errcode = '42501';
  end if;

  if p_existing_client is not null then
    select id into v_client from public.fulfillment_clients where id = p_existing_client
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000') = coalesce(f.organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(outsourcing_group_id, '00000000-0000-0000-0000-000000000000') = coalesce(f.outsourcing_group_id, '00000000-0000-0000-0000-000000000000');
    if v_client is null then raise exception 'CreditOps client not visible or belongs elsewhere' using errcode = '42501'; end if;
  elsif f.fulfillment_client_id is not null then
    v_client := f.fulfillment_client_id;
  else
    insert into public.fulfillment_clients (agency_id, name, email, phone, mode, organization_id, outsourcing_group_id, auto_sync, status, round, created_by)
    values (f.agency_id, f.name, f.email, f.phone, f.mode, f.organization_id, f.outsourcing_group_id, f.auto_sync, 'Onboarding', 'Pre-Round', auth.uid())
    returning id into v_client;
  end if;

  update public.funding_clients set fulfillment_client_id = v_client, status = 'Credit Readiness', last_activity_at = now()
   where id = p_funding_client;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (f.agency_id, f.organization_id, 'funding_client', p_funding_client::text, auth.uid(), 'Sent to CreditOps for funding readiness', 'Credit readiness work begins in CreditOps', 'status', f.status::text, 'Credit Readiness', 'organization_internal'),
         (f.agency_id, f.organization_id, 'fulfillment_client', v_client::text, auth.uid(), 'Received from FundingOps', 'Funding readiness: qualify for funding, then return to FundingOps', null, null, null, 'organization_internal');
  return v_client;
end $$;

-- Return a qualified client to FundingOps.
create or replace function public.handoff_to_fundingops(p_fulfillment_client uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  f public.funding_clients%rowtype;
begin
  select * into f from public.funding_clients where fulfillment_client_id = p_fulfillment_client and status = 'Credit Readiness' limit 1;
  if f.id is null then raise exception 'No linked funding client in credit readiness' using errcode = '22023'; end if;
  update public.funding_clients set status = 'Readiness Review', last_activity_at = now() where id = f.id;
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (f.agency_id, f.organization_id, 'funding_client', f.id::text, auth.uid(), 'Returned from CreditOps — qualified', 'Funding readiness complete', 'status', 'Credit Readiness', 'Readiness Review', 'organization_internal'),
         (f.agency_id, f.organization_id, 'fulfillment_client', p_fulfillment_client::text, auth.uid(), 'Returned to FundingOps — qualified', 'Client qualified for funding', null, null, null, 'organization_internal');
  return f.id;
end $$;
revoke execute on function public.handoff_to_creditops(uuid, uuid) from public, anon;
revoke execute on function public.handoff_to_fundingops(uuid) from public, anon;
grant execute on function public.handoff_to_creditops(uuid, uuid) to authenticated;
grant execute on function public.handoff_to_fundingops(uuid) to authenticated;
