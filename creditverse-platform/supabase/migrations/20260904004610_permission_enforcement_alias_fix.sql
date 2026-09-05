-- =============================================================================
-- 0067 — 0065 correction: the permission line's subquery alias
--
-- 0065 inserted
--   perform public.require_permission((select t.organization_id from public.funding_file_tenancy(x) t), '<key>');
-- into seven funding functions that already declare a PL/pgSQL variable
-- `t record`. PL/pgSQL substitutes the (unassigned) variable for `t.organization_id`
-- and raises 55000 "record t is not assigned yet" — every stage move, offer,
-- closing, funding confirmation and renewal was refused. Found by the full
-- matrix (phase 24 probes) before anything shipped. Same bodies, alias `ten`.
-- The three letter functions have no such variable and are unchanged.
-- =============================================================================

-- advance_closing
CREATE OR REPLACE FUNCTION public.advance_closing(p_closing uuid, p_status closing_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare c public.closings%rowtype; t record;
begin
  select * into c from public.closings where id = p_closing;
  if c.id is null then raise exception 'Closing not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(c.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  perform public.require_permission((select ten.organization_id from public.funding_file_tenancy(c.file_id) ten), 'fundingops.offers.manage');
  if p_status = 'funded' then raise exception 'Funded is set only by confirming funding with disbursement data' using errcode = '22023'; end if;
  if c.status in ('funded', 'cancelled') then raise exception 'This closing is finished' using errcode = '22023'; end if;
  update public.closings set status = p_status, note = coalesce(p_note, note), signed_at = case when p_status = 'signed' then now() else signed_at end where id = p_closing;
  if p_status = 'funding_pending' then
    update public.funding_files set stage = 'Funding', waiting_on = 'Lender', last_activity_at = now() where id = c.file_id;
  elsif p_status = 'awaiting_signatures' then
    update public.funding_files set waiting_on = 'Client', last_activity_at = now() where id = c.file_id;
  elsif p_status = 'cancelled' then
    update public.funding_files set waiting_on = 'Internal Team', last_activity_at = now() where id = c.file_id;
  end if;
  select * into t from public.funding_file_tenancy(c.file_id);
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(), 'Closing status', coalesce(p_note, 'Closing ' || c.status::text || ' → ' || p_status::text), 'closing:' || p_closing::text, c.status::text, p_status::text,
          public.funding_event_visibility(t.agency_id, t.organization_id));
end $function$;

-- confirm_funding
CREATE OR REPLACE FUNCTION public.confirm_funding(p_closing uuid, p_gross numeric, p_net numeric, p_funded_at timestamp with time zone, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare c public.closings%rowtype; o public.offers%rowtype; f public.funding_files%rowtype; d public.funding_deals%rowtype; t record; v_id uuid;
begin
  select * into c from public.closings where id = p_closing;
  if c.id is null then raise exception 'Closing not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(c.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  perform public.require_permission((select ten.organization_id from public.funding_file_tenancy(c.file_id) ten), 'fundingops.funding.confirm');
  if c.status <> 'funding_pending' then raise exception 'Funding is confirmed from Funding Pending only' using errcode = '22023'; end if;
  if p_gross is null or p_net is null or p_funded_at is null then raise exception 'Gross, net and the funding date are required' using errcode = '22023'; end if;
  if p_net > p_gross then raise exception 'Net funded cannot exceed gross funded' using errcode = '22023'; end if;
  select * into o from public.offers where id = c.offer_id;
  select * into f from public.funding_files where id = c.file_id;
  select * into d from public.funding_deals where id = o.deal_id;

  insert into public.funded_deals (file_id, deal_id, offer_id, closing_id, lender_id, lender_name, requested_amount, accepted_offer_amount, gross_funded, net_funded, funded_at, disbursement_reference, confirmed_by, note)
  values (c.file_id, o.deal_id, o.id, c.id, coalesce(o.lender_id, d.lender_id), d.lender, f.requested_amount, o.offer_amount, p_gross, p_net, p_funded_at, p_reference, auth.uid(), p_note)
  returning id into v_id;
  update public.closings set status = 'funded' where id = p_closing;
  update public.funding_deals set status = 'Funded', funded_at = p_funded_at, updated_at = now() where id = o.deal_id;
  update public.funding_files set stage = 'Funded', secondary_status = 'Funded', waiting_on = 'No Action Required', last_activity_at = now() where id = c.file_id;
  update public.funding_clients set status = 'Funded', last_activity_at = now() where id = f.client_id;
  insert into public.renewal_opportunities (funded_deal_id, file_id, potential_renewal_date, status, updated_by)
  values (v_id, c.file_id, (p_funded_at + interval '6 months')::date, 'monitoring', auth.uid());

  select * into t from public.funding_file_tenancy(c.file_id);
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(), 'Funding confirmed',
          coalesce(p_note, f.purpose || ' · gross $' || p_gross::text || ' · net $' || p_net::text || case when o.offer_amount is not null and o.offer_amount <> p_gross then ' · accepted $' || o.offer_amount::text else '' end),
          'funded_deal:' || v_id::text, f.stage::text, 'Funded', public.funding_event_visibility(t.agency_id, t.organization_id));
  return v_id;
end $function$;

-- create_renewal_file
CREATE OR REPLACE FUNCTION public.create_renewal_file(p_renewal uuid, p_purpose text, p_requested_amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.renewal_opportunities%rowtype; f public.funding_files%rowtype; t record; v_id uuid;
begin
  select * into r from public.renewal_opportunities where id = p_renewal;
  if r.id is null then raise exception 'Renewal not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(r.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  perform public.require_permission((select ten.organization_id from public.funding_file_tenancy(r.file_id) ten), 'fundingops.files.edit');
  if r.new_file_id is not null then raise exception 'A new file already exists for this renewal' using errcode = '22023'; end if;
  select * into f from public.funding_files where id = r.file_id;
  insert into public.funding_files (agency_id, client_id, business_id, purpose, requested_amount, stage, secondary_status, waiting_on, assigned_agent_id, created_by, renews_file_id)
  values (f.agency_id, f.client_id, f.business_id, p_purpose, p_requested_amount, 'New Application', 'Active Funding', 'Internal Team', f.assigned_agent_id, auth.uid(), f.id)
  returning id into v_id;
  update public.renewal_opportunities set status = 'new_file_created', new_file_id = v_id, updated_by = auth.uid() where id = p_renewal;
  select * into t from public.funding_file_tenancy(f.id);
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(), 'Renewal file created', p_purpose || ' · $' || p_requested_amount::text || ' · renews ' || f.purpose, 'renewal:' || p_renewal::text, r.status::text, 'new_file_created',
          public.funding_event_visibility(t.agency_id, t.organization_id));
  return v_id;
end $function$;

-- move_funding_file
CREATE OR REPLACE FUNCTION public.move_funding_file(p_file uuid, p_stage funding_pipeline_stage DEFAULT NULL::funding_pipeline_stage, p_secondary funding_secondary_status DEFAULT NULL::funding_secondary_status, p_waiting_on funding_waiting_on DEFAULT NULL::funding_waiting_on, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  f public.funding_files%rowtype;
  t record;
  v_vis public.activity_visibility;
begin
  select * into f from public.funding_files where id = p_file;
  if f.id is null then raise exception 'Funding file not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(p_file) then raise exception 'Not permitted to move this file' using errcode = '42501'; end if;
  perform public.require_permission((select ten.organization_id from public.funding_file_tenancy(p_file) ten), 'fundingops.files.edit');
  if p_stage = 'Funded' or p_secondary = 'Funded' then
    raise exception 'Funded is set only by confirming funding with disbursement data' using errcode = '22023';
  end if;
  if p_stage is null and p_secondary is null and p_waiting_on is null then return; end if;

  select * into t from public.funding_file_tenancy(p_file);
  v_vis := case when public.is_staff_of(t.agency_id) and t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                when public.is_staff_of(t.agency_id) then 'bes_internal'
                when t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                else 'organization_internal' end::public.activity_visibility;

  update public.funding_files
     set stage = coalesce(p_stage, stage),
         secondary_status = coalesce(p_secondary, secondary_status),
         waiting_on = coalesce(p_waiting_on, waiting_on),
         last_activity_at = now()
   where id = p_file;
  update public.funding_clients set last_activity_at = now() where id = f.client_id;

  if p_stage is not null and p_stage <> f.stage then
    insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
    values (t.agency_id, t.organization_id, 'funding_client', f.client_id::text, auth.uid(), 'Stage changed',
            coalesce(p_note, f.purpose || ' · ' || f.stage::text || ' → ' || p_stage::text), 'stage:' || p_file::text, f.stage::text, p_stage::text, v_vis);
  end if;
  if p_secondary is not null and p_secondary <> f.secondary_status then
    insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
    values (t.agency_id, t.organization_id, 'funding_client', f.client_id::text, auth.uid(), 'Status changed',
            coalesce(p_note, f.purpose || ' · ' || f.secondary_status::text || ' → ' || p_secondary::text), 'secondary_status:' || p_file::text, f.secondary_status::text, p_secondary::text, v_vis);
  end if;
  if p_waiting_on is not null and p_waiting_on <> f.waiting_on then
    insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
    values (t.agency_id, t.organization_id, 'funding_client', f.client_id::text, auth.uid(), 'Waiting on changed',
            coalesce(p_note, f.purpose || ' · waiting on ' || p_waiting_on::text), 'waiting_on:' || p_file::text, f.waiting_on::text, p_waiting_on::text, v_vis);
  end if;
end $function$;

-- record_document_disposition
CREATE OR REPLACE FUNCTION public.record_document_disposition(p_instance uuid, p_disposition document_disposition, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  i public.document_instances%rowtype;
  f public.funding_files%rowtype;
  c public.funding_clients%rowtype;
  v_prev text;
begin
  select * into i from public.document_instances where id = p_instance;
  if i.id is null then raise exception 'Document not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(i.file_id) then raise exception 'Not a reviewer for this file' using errcode = '42501'; end if;
  perform public.require_permission((select ten.organization_id from public.funding_file_tenancy(i.file_id) ten), 'fundingops.documents.review');
  if p_disposition = 'pending_review' then raise exception 'A disposition cannot return to pending' using errcode = '22023'; end if;
  select * into f from public.funding_files where id = i.file_id;
  select * into c from public.funding_clients where id = f.client_id;
  v_prev := i.disposition::text;

  update public.document_instances set disposition = p_disposition, reviewed_by = auth.uid(), reviewed_at = now(), reason = p_reason where id = p_instance;

  -- Accepting an instance satisfies the request it answers; any other disposition leaves the request open.
  if i.request_id is not null then
    if p_disposition = 'accepted' then
      update public.document_requests set status = 'satisfied', satisfied_by_instance_id = p_instance where id = i.request_id;
    else
      update public.document_requests set status = 'open', satisfied_by_instance_id = null where id = i.request_id and satisfied_by_instance_id = p_instance;
    end if;
  end if;

  update public.funding_files set last_activity_at = now() where id = i.file_id;
  update public.funding_clients set last_activity_at = now() where id = f.client_id;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (f.agency_id, c.organization_id, 'funding_client', f.client_id::text, auth.uid(),
          'Document disposition', coalesce(p_reason, f.purpose || ' · ' || coalesce(i.classified_type, 'document') || ' → ' || p_disposition::text),
          'document:' || coalesce(i.classified_type, 'document') || ':' || i.file_id::text, v_prev, p_disposition::text,
          case when public.is_staff_of(f.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(f.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $function$;

-- set_offer_status
CREATE OR REPLACE FUNCTION public.set_offer_status(p_offer uuid, p_status offer_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  o public.offers%rowtype; t record; f public.funding_files%rowtype;
  allowed boolean;
begin
  select * into o from public.offers where id = p_offer;
  if o.id is null then raise exception 'Offer not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(o.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  perform public.require_permission((select ten.organization_id from public.funding_file_tenancy(o.file_id) ten), 'fundingops.offers.manage');
  allowed := case o.status
    when 'received'          then p_status in ('internal_review', 'withdrawn', 'expired')
    when 'internal_review'   then p_status in ('ready_to_present', 'withdrawn', 'expired')
    when 'ready_to_present'  then p_status in ('presented', 'internal_review', 'withdrawn', 'expired')
    when 'presented'         then p_status in ('client_considering', 'client_accepted', 'client_declined', 'expired', 'withdrawn')
    when 'client_considering' then p_status in ('client_accepted', 'client_declined', 'expired', 'withdrawn')
    else false end;
  if not allowed then raise exception 'An offer cannot go from % to %', o.status, p_status using errcode = '22023'; end if;

  update public.offers set status = p_status, note = coalesce(p_note, note),
         presented_at = case when p_status = 'presented' then now() else presented_at end,
         presented_by = case when p_status = 'presented' then auth.uid() else presented_by end,
         client_decided_at = case when p_status in ('client_accepted', 'client_declined') then now() else client_decided_at end
   where id = p_offer;
  select * into f from public.funding_files where id = o.file_id;
  if p_status = 'client_accepted' then
    update public.funding_files set stage = 'Offer Accepted', waiting_on = 'Internal Team', last_activity_at = now() where id = o.file_id;
    update public.funding_deals set status = 'Offer Received', updated_at = now() where id = o.deal_id and status not in ('Funded');
  elsif p_status = 'client_declined' then
    update public.funding_files set secondary_status = case when secondary_status = 'Active Funding' then 'Client Declined Offer' else secondary_status end, last_activity_at = now() where id = o.file_id;
  elsif p_status = 'presented' then
    update public.funding_files set waiting_on = 'Client', last_activity_at = now() where id = o.file_id;
  end if;
  select * into t from public.funding_file_tenancy(o.file_id);
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(), 'Offer status',
          coalesce(p_note, f.purpose || ' · offer ' || o.status::text || ' → ' || p_status::text), 'offer:' || p_offer::text, o.status::text, p_status::text,
          public.funding_event_visibility(t.agency_id, t.organization_id));
end $function$;

-- start_closing
CREATE OR REPLACE FUNCTION public.start_closing(p_offer uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare o public.offers%rowtype; t record; v_id uuid;
begin
  select * into o from public.offers where id = p_offer;
  if o.id is null then raise exception 'Offer not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(o.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  perform public.require_permission((select ten.organization_id from public.funding_file_tenancy(o.file_id) ten), 'fundingops.offers.manage');
  if o.status <> 'client_accepted' then raise exception 'Only an accepted offer can start closing' using errcode = '22023'; end if;
  insert into public.closings (file_id, offer_id, started_by, note) values (o.file_id, p_offer, auth.uid(), p_note) returning id into v_id;
  update public.funding_files set stage = 'Final Approval', waiting_on = 'Internal Team', last_activity_at = now() where id = o.file_id;
  select * into t from public.funding_file_tenancy(o.file_id);
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(), 'Closing started', coalesce(p_note, 'Closing started on the accepted offer'), 'closing:' || v_id::text, null, 'started',
          public.funding_event_visibility(t.agency_id, t.organization_id));
  return v_id;
end $function$;
