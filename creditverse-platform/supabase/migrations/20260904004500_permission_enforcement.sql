-- =============================================================================
-- 0065 — Permission keys enforced where the action happens
--
-- 0064 made permissions data and gave the interface member_can(). A switch in
-- the tree is only authorization if the database consults it, so every
-- security-relevant function now calls require_permission() after its
-- existing visibility and reviewer/writable checks:
--
--   approve_dispute_letter        creditops.letters.approve
--   open_dispute_round,
--   mark_letter_mailed            creditops.letters.build
--   move_funding_file,
--   create_renewal_file           fundingops.files.edit
--   record_document_disposition   fundingops.documents.review
--   set_offer_status, start_closing,
--   advance_closing               fundingops.offers.manage
--   confirm_funding               fundingops.funding.confirm
--
-- BES staff are not gated by an organization's permission keys — their access
-- is the engagement and scope the earlier checks already enforce. A record
-- with no organization (outsourcing-only) has no keys to consult. Function
-- bodies below are the live definitions with the one line added; grants are
-- preserved by CREATE OR REPLACE.
-- =============================================================================

create or replace function public.require_permission(p_org uuid, p_key text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_agency_staff() then return; end if;
  if p_org is null then return; end if;
  if not public.member_can(p_org, p_key) then
    raise exception 'Not permitted: your role does not include %', p_key using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_permission(uuid, text) from public, anon;
grant execute on function public.require_permission(uuid, text) to authenticated;

-- approve_dispute_letter: creditops.letters.approve
CREATE OR REPLACE FUNCTION public.approve_dispute_letter(p_letter uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  l public.dispute_letters%rowtype;
  c public.fulfillment_clients%rowtype;
  v_bad text;
begin
  select * into l from public.dispute_letters where id = p_letter;
  if l.id is null then raise exception 'Letter not visible' using errcode = '42501'; end if;
  if not public.credit_client_writable(l.client_id) then raise exception 'Not permitted to approve letters for this client' using errcode = '42501'; end if;
  perform public.require_permission((select fc.organization_id from public.fulfillment_clients fc where fc.id = l.client_id), 'creditops.letters.approve');
  if l.status <> 'draft' then raise exception 'Only a draft can be approved' using errcode = '22023'; end if;
  if length(trim(l.body_final)) < 40 then raise exception 'The letter has no body' using errcode = '22023'; end if;
  if not exists (select 1 from public.dispute_attestations a where a.letter_id = p_letter) then
    raise exception 'The consumer attestation (truth gate) is missing' using errcode = '22023';
  end if;
  if l.recipient_kind = 'furnisher' and (l.body_final ilike '%1681e(b)%') then
    raise exception 'Section 1681e(b) is a consumer reporting agency duty; it cannot be cited to a furnisher' using errcode = '22023';
  end if;
  if l.recipient_kind = 'furnisher' and l.dispute_origin = 'cro_prepared' and l.body_final ilike '%1022.43%' then
    raise exception 'A credit-repair-organization-prepared direct dispute cannot rely on 12 C.F.R. § 1022.43; use the CRA route' using errcode = '22023';
  end if;
  v_bad := public.letter_prohibited_phrase(l.body_final);
  if v_bad is not null then raise exception 'The letter contains a prohibited phrase: "%"', v_bad using errcode = '22023'; end if;

  update public.dispute_letters set status = 'approved', approved_by = auth.uid(), approved_at = now(), qa_passed_at = now(), qa_by = auth.uid() where id = p_letter;

  select * into c from public.fulfillment_clients where id = l.client_id;
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', l.client_id::text, auth.uid(),
          'Letter approved', l.recipient_name || ' · ' || l.recipient_kind::text, 'letter:' || p_letter::text, 'draft', 'approved',
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $function$;

-- mark_letter_mailed: creditops.letters.build
CREATE OR REPLACE FUNCTION public.mark_letter_mailed(p_letter uuid, p_mailed_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare l public.dispute_letters%rowtype;
begin
  select * into l from public.dispute_letters where id = p_letter;
  if l.id is null then raise exception 'Letter not visible' using errcode = '42501'; end if;
  if not public.credit_client_writable(l.client_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  perform public.require_permission((select fc.organization_id from public.fulfillment_clients fc where fc.id = l.client_id), 'creditops.letters.build');
  if l.status not in ('approved', 'printed') then raise exception 'Only an approved letter can be mailed' using errcode = '22023'; end if;
  update public.dispute_letters set status = 'mailed', mailed_at = p_mailed_at where id = p_letter;
  if l.recipient_kind = 'cra' then
    insert into public.dispute_timers (letter_id, kind, due_at, note) values
      (p_letter, 'furnisher_notice', p_mailed_at + interval '5 days', 'CRA notice to the furnisher — 5 business days (approximated as 5 calendar days; check the calendar)'),
      (p_letter, 'reinvestigation', p_mailed_at + interval '30 days', '30 days; +15 only if the consumer supplies new relevant information during the reinvestigation'),
      (p_letter, 'results_notice', p_mailed_at + interval '35 days', 'written results within 5 business days of completion'),
      (p_letter, 'reinsertion_watch', p_mailed_at + interval '120 days', 'compare the next imports for reappearance of any deleted item');
  end if;
end $function$;

-- open_dispute_round: creditops.letters.build
CREATE OR REPLACE FUNCTION public.open_dispute_round(p_client uuid, p_strategy dispute_strategy, p_reset_cycle boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  c        public.fulfillment_clients%rowtype;
  v_open   public.dispute_rounds%rowtype;
  v_id     uuid;
  v_number integer;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  if not public.credit_client_writable(p_client) then raise exception 'Not permitted to build letters for this client' using errcode = '42501'; end if;
  perform public.require_permission(c.organization_id, 'creditops.letters.build');

  select * into v_open from public.dispute_rounds where client_id = p_client and closed_at is null order by round_number desc limit 1;
  if v_open.id is not null and not p_reset_cycle then
    return v_open.id;                                   -- keep the counter: letters join the running round
  end if;
  if v_open.id is not null then
    update public.dispute_rounds set closed_at = now() where id = v_open.id;
  end if;
  select coalesce(max(round_number), 0) + 1 into v_number from public.dispute_rounds where client_id = p_client;
  insert into public.dispute_rounds (client_id, round_number, strategy, cycle_reset, created_by)
  values (p_client, v_number, p_strategy, p_reset_cycle, auth.uid()) returning id into v_id;
  -- The client's credit-status round is an enum label; the round record keeps the exact number.
  update public.fulfillment_clients
     set round = case when v_number >= 4 then 'Round 4+' else ('Round ' || v_number) end::public.fulfillment_round
   where id = p_client;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(),
          'Dispute round opened', 'Round ' || v_number || ' · ' || p_strategy::text || case when v_open.id is not null then ' (previous round closed)' else '' end,
          'round', coalesce(v_open.round_number::text, null), v_number::text,
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
  return v_id;
end $function$;

-- confirm_funding: fundingops.funding.confirm
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
  perform public.require_permission((select t.organization_id from public.funding_file_tenancy(c.file_id) t), 'fundingops.funding.confirm');
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

-- set_offer_status: fundingops.offers.manage
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
  perform public.require_permission((select t.organization_id from public.funding_file_tenancy(o.file_id) t), 'fundingops.offers.manage');
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

-- start_closing: fundingops.offers.manage
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
  perform public.require_permission((select t.organization_id from public.funding_file_tenancy(o.file_id) t), 'fundingops.offers.manage');
  if o.status <> 'client_accepted' then raise exception 'Only an accepted offer can start closing' using errcode = '22023'; end if;
  insert into public.closings (file_id, offer_id, started_by, note) values (o.file_id, p_offer, auth.uid(), p_note) returning id into v_id;
  update public.funding_files set stage = 'Final Approval', waiting_on = 'Internal Team', last_activity_at = now() where id = o.file_id;
  select * into t from public.funding_file_tenancy(o.file_id);
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(), 'Closing started', coalesce(p_note, 'Closing started on the accepted offer'), 'closing:' || v_id::text, null, 'started',
          public.funding_event_visibility(t.agency_id, t.organization_id));
  return v_id;
end $function$;

-- advance_closing: fundingops.offers.manage
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
  perform public.require_permission((select t.organization_id from public.funding_file_tenancy(c.file_id) t), 'fundingops.offers.manage');
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

-- record_document_disposition: fundingops.documents.review
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
  perform public.require_permission((select t.organization_id from public.funding_file_tenancy(i.file_id) t), 'fundingops.documents.review');
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

-- move_funding_file: fundingops.files.edit
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
  perform public.require_permission((select t.organization_id from public.funding_file_tenancy(p_file) t), 'fundingops.files.edit');
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

-- create_renewal_file: fundingops.files.edit
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
  perform public.require_permission((select t.organization_id from public.funding_file_tenancy(r.file_id) t), 'fundingops.files.edit');
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
