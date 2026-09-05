-- A lender user with an active share could read the application and post a
-- deal in principle (0058), but could not read the funding_files row itself —
-- so the deal insert selected zero rows and record_lender_decision() saw no
-- deal (matrix phase 22: 42501). The lender reads the shared FILE (purpose,
-- amount, stage), never the funding CLIENT (the person); the decision function
-- takes tenancy from a definer helper so the activity event lands under the
-- right agency and organization whoever records it.
create policy funding_files_lender_select on public.funding_files for select to authenticated
  using (public.is_lender_for_file(id));

create or replace function public.funding_file_tenancy(p_file uuid)
returns table (agency_id uuid, organization_id uuid, client_id uuid)
language sql stable security definer set search_path = public as $$
  select f.agency_id, c.organization_id, f.client_id
    from public.funding_files f join public.funding_clients c on c.id = f.client_id
   where f.id = p_file
$$;
revoke execute on function public.funding_file_tenancy(uuid) from public, anon;
grant execute on function public.funding_file_tenancy(uuid) to authenticated;

-- SECURITY DEFINER with the authorization spelled out below: the function IS
-- the gate. A lender user cannot read the funding client, so under invoker
-- rights the activity event (entity = funding_client) could never be written
-- for a lender-recorded decision; a decision without its audit row is worse
-- than no decision (rule 10).
create or replace function public.record_lender_decision(p_deal uuid, p_decision public.lender_decision_kind, p_terms jsonb default '{}'::jsonb, p_conditions text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  d public.funding_deals%rowtype;
  t record;
  v_id uuid;
  v_status public.funding_deal_status;
  v_source text := 'staff';
  v_is_lender boolean;
begin
  select * into d from public.funding_deals where id = p_deal;
  if d.id is null then raise exception 'Deal not found' using errcode = '42501'; end if;
  select * into t from public.funding_file_tenancy(d.file_id);
  v_is_lender := d.lender_id is not null and public.is_lender_for_file(d.file_id)
                 and exists (select 1 from public.lender_users lu where lu.lender_id = d.lender_id and lu.user_id = auth.uid());
  if v_is_lender then
    v_source := 'lender_portal';
  elsif not public.file_reviewer(d.file_id) then
    raise exception 'Not permitted to record a decision on this deal' using errcode = '42501';
  end if;

  insert into public.lender_decisions (deal_id, decision, terms, conditions, source, recorded_by, note)
  values (p_deal, p_decision, coalesce(p_terms, '{}'::jsonb), p_conditions, v_source, auth.uid(), p_note) returning id into v_id;

  v_status := public.deal_status_for_decision(p_decision);
  if v_status is not null then update public.funding_deals set status = v_status, updated_at = now() where id = p_deal; end if;
  update public.funding_files set last_activity_at = now() where id = d.file_id;
  update public.funding_clients set last_activity_at = now() where id = t.client_id;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(),
          'Lender decision', coalesce(p_note, d.lender || ' · ' || p_decision::text), 'deal:' || p_deal::text, d.status::text, p_decision::text,
          case when public.is_staff_of(t.agency_id) and t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
               when public.is_staff_of(t.agency_id) then 'bes_internal'
               when t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
  return v_id;
end $$;
