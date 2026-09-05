-- =============================================================================
-- FundingOS records (Addendum C2, Dee's design): offers, closing, funded deals,
-- renewals, submission snapshots, decline reasons, lender contacts and
-- relationship, policy updates with acknowledgement.
--
-- Doctrine carried into the schema:
--   Offer accepted ≠ funded. Signed ≠ funded. Only confirm_funding() with
--   disbursement data creates a funded deal, and it keeps four amounts apart
--   (requested, accepted offer, actual gross, net). Raw lender terms are stored
--   exactly as provided with their pricing type; a factor rate is never labelled
--   APR; calculated values live in code, labelled as calculated.
--   A submission preserves the policy version and the Program Fit snapshot it
--   was made under; history is never recomputed with today's criteria.
--   Lender-reported decline reasons are kept verbatim AND normalised.
--   A renewal creates a NEW funding file with lineage; prior funding never
--   means current eligibility.
-- =============================================================================

create type public.offer_status as enum ('received', 'internal_review', 'ready_to_present', 'presented', 'client_considering', 'client_accepted', 'client_declined', 'expired', 'withdrawn');
create type public.pricing_type as enum ('factor_rate', 'interest_rate', 'apr', 'fee_based', 'not_provided');
create type public.closing_status as enum ('started', 'requirements_outstanding', 'awaiting_signatures', 'signed', 'funding_pending', 'funded', 'cancelled');
create type public.renewal_status as enum ('monitoring', 'review_due', 'outreach', 'client_interested', 'new_file_created', 'not_pursued');
create type public.decline_reason_category as enum ('personal_credit', 'revenue', 'cash_flow', 'time_in_business', 'industry', 'documentation', 'existing_debt', 'identity_verification', 'other', 'not_stated');
create type public.policy_change_kind as enum ('tightened', 'relaxed', 'paused', 'resumed', 'clarified');

-- Submission snapshot and decline reasons ------------------------------------
alter table public.funding_deals
  add column if not exists policy_version_id uuid references public.lender_policy_versions(id) on delete set null,
  add column if not exists fit_snapshot jsonb;             -- Program Fit at submission: outcome, criteria results, policy version label
alter table public.lender_decisions
  add column if not exists reason_verbatim text,           -- exactly what the lender said
  add column if not exists reason_category public.decline_reason_category;
alter table public.funding_files add column if not exists renews_file_id uuid references public.funding_files(id) on delete set null;

-- Lender relationship intelligence -------------------------------------------
create table public.lender_contacts (
  id           uuid primary key default gen_random_uuid(),
  lender_id    uuid not null references public.lenders(id) on delete cascade,
  name         text not null,
  role         text,                                       -- BDM, underwriter, ISO manager …
  email        citext,
  phone        text,
  verified_at  timestamptz,
  verified_by  uuid references public.profiles(id) on delete set null,
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index lender_contacts_lender_idx on public.lender_contacts (lender_id);
alter table public.lenders
  add column if not exists partner_status text not null default 'none' check (partner_status in ('none', 'prospect', 'active_partner', 'preferred_partner', 'paused')),
  add column if not exists last_contact_at timestamptz;

/** A change between policy versions, its kind, and the active files the deterministic fit engine found affected at the time. */
create table public.policy_updates (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.lender_programs(id) on delete cascade,
  from_version      integer,
  to_version        integer not null,
  change_kind       public.policy_change_kind not null,
  summary           text not null,
  affected_file_ids uuid[] not null default '{}',
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  acknowledged_by   uuid references public.profiles(id) on delete set null,
  acknowledged_at   timestamptz
);
create index policy_updates_open_idx on public.policy_updates (program_id) where acknowledged_at is null;

-- Offers --------------------------------------------------------------------
create table public.offers (
  id                 uuid primary key default gen_random_uuid(),
  deal_id            uuid not null references public.funding_deals(id) on delete cascade,
  file_id            uuid not null references public.funding_files(id) on delete cascade,
  lender_id          uuid references public.lenders(id) on delete set null,
  received_at        timestamptz not null default now(),
  /** Raw lender terms, exactly as provided. */
  offer_amount       numeric(14,2) check (offer_amount is null or offer_amount >= 0),
  pricing_type       public.pricing_type not null default 'not_provided',
  pricing_value      numeric(10,4),                         -- 1.24 factor, 9.5 (%) interest, 18.2 (%) APR — meaning follows pricing_type
  term_text          text,                                  -- as stated: "12 months", "180 daily payments"
  payment_frequency  text,                                  -- daily | weekly | monthly | as stated
  payment_amount     numeric(14,2),
  origination_fee    numeric(14,2),
  other_fees         jsonb not null default '[]'::jsonb,
  prepayment_terms   text,
  expires_at         timestamptz,
  status             public.offer_status not null default 'received',
  presented_at       timestamptz,
  presented_by       uuid references public.profiles(id) on delete set null,
  client_decided_at  timestamptz,
  note               text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger offers_updated_at before update on public.offers for each row execute function public.set_updated_at();
create index offers_file_idx on public.offers (file_id, status);

-- Closing -------------------------------------------------------------------
create table public.closings (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.funding_files(id) on delete cascade,
  offer_id    uuid not null references public.offers(id) on delete restrict,
  status      public.closing_status not null default 'started',
  started_by  uuid references public.profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  signed_at   timestamptz,
  note        text,
  updated_at  timestamptz not null default now()
);
create trigger closings_updated_at before update on public.closings for each row execute function public.set_updated_at();
create unique index closings_one_open_per_file on public.closings (file_id) where status not in ('funded', 'cancelled');

-- Funded deals (immutable) ---------------------------------------------------
create table public.funded_deals (
  id                     uuid primary key default gen_random_uuid(),
  file_id                uuid not null references public.funding_files(id) on delete restrict,
  deal_id                uuid not null references public.funding_deals(id) on delete restrict,
  offer_id               uuid references public.offers(id) on delete set null,
  closing_id             uuid references public.closings(id) on delete set null,
  lender_id              uuid references public.lenders(id) on delete set null,
  lender_name            text not null,
  requested_amount       numeric(14,2) not null,
  accepted_offer_amount  numeric(14,2),
  gross_funded           numeric(14,2) not null check (gross_funded >= 0),
  net_funded             numeric(14,2) not null check (net_funded >= 0),
  funded_at              timestamptz not null,
  disbursement_reference text,
  confirmed_by           uuid references public.profiles(id) on delete set null,
  confirmed_at           timestamptz not null default now(),
  note                   text,
  unique (deal_id)
);
create index funded_deals_file_idx on public.funded_deals (file_id);

-- Renewals ------------------------------------------------------------------
create table public.renewal_opportunities (
  id                      uuid primary key default gen_random_uuid(),
  funded_deal_id          uuid not null references public.funded_deals(id) on delete cascade,
  file_id                 uuid not null references public.funding_files(id) on delete cascade,
  /** An operational reminder, never eligibility. */
  potential_renewal_date  date,
  status                  public.renewal_status not null default 'monitoring',
  next_follow_up_at       date,
  new_file_id             uuid references public.funding_files(id) on delete set null,
  note                    text,
  updated_by              uuid references public.profiles(id) on delete set null,
  updated_at              timestamptz not null default now()
);
create trigger renewal_opportunities_updated_at before update on public.renewal_opportunities for each row execute function public.set_updated_at();
create index renewal_opportunities_due_idx on public.renewal_opportunities (status, potential_renewal_date);

-- ---------------------------------------------------------------------------
-- Transitions — explicit human actions, each with its audit row
-- ---------------------------------------------------------------------------
create or replace function public.funding_event_visibility(p_agency uuid, p_org uuid)
returns public.activity_visibility language sql stable security definer set search_path = public as $$
  select case when public.is_staff_of(p_agency) and p_org is not null and public.bes_engaged_with(p_org) then 'shared_with_partner'
              when public.is_staff_of(p_agency) then 'bes_internal'
              when p_org is not null and public.bes_engaged_with(p_org) then 'shared_with_partner'
              else 'organization_internal' end::public.activity_visibility
$$;

/** Offer state machine. Accepting an offer moves the file to Offer Accepted; it does NOT fund anything. */
create or replace function public.set_offer_status(p_offer uuid, p_status public.offer_status, p_note text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  o public.offers%rowtype; t record; f public.funding_files%rowtype;
  allowed boolean;
begin
  select * into o from public.offers where id = p_offer;
  if o.id is null then raise exception 'Offer not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(o.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
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
end $$;

/** Start Closing is explicit. Only an accepted offer can be closed. */
create or replace function public.start_closing(p_offer uuid, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare o public.offers%rowtype; t record; v_id uuid;
begin
  select * into o from public.offers where id = p_offer;
  if o.id is null then raise exception 'Offer not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(o.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if o.status <> 'client_accepted' then raise exception 'Only an accepted offer can start closing' using errcode = '22023'; end if;
  insert into public.closings (file_id, offer_id, started_by, note) values (o.file_id, p_offer, auth.uid(), p_note) returning id into v_id;
  update public.funding_files set stage = 'Final Approval', waiting_on = 'Internal Team', last_activity_at = now() where id = o.file_id;
  select * into t from public.funding_file_tenancy(o.file_id);
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_client', t.client_id::text, auth.uid(), 'Closing started', coalesce(p_note, 'Closing started on the accepted offer'), 'closing:' || v_id::text, null, 'started',
          public.funding_event_visibility(t.agency_id, t.organization_id));
  return v_id;
end $$;

create or replace function public.advance_closing(p_closing uuid, p_status public.closing_status, p_note text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare c public.closings%rowtype; t record;
begin
  select * into c from public.closings where id = p_closing;
  if c.id is null then raise exception 'Closing not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(c.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
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
end $$;

/** The ONLY action that creates a funded deal. Requested, accepted, gross and net stay separate; discrepancies are for the interface to surface. */
create or replace function public.confirm_funding(p_closing uuid, p_gross numeric, p_net numeric, p_funded_at timestamptz, p_reference text default null, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare c public.closings%rowtype; o public.offers%rowtype; f public.funding_files%rowtype; d public.funding_deals%rowtype; t record; v_id uuid;
begin
  select * into c from public.closings where id = p_closing;
  if c.id is null then raise exception 'Closing not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(c.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
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
end $$;

/** A renewal is a NEW funding file with lineage; nothing is copied from the old fit. */
create or replace function public.create_renewal_file(p_renewal uuid, p_purpose text, p_requested_amount numeric)
returns uuid language plpgsql security invoker set search_path = public as $$
declare r public.renewal_opportunities%rowtype; f public.funding_files%rowtype; t record; v_id uuid;
begin
  select * into r from public.renewal_opportunities where id = p_renewal;
  if r.id is null then raise exception 'Renewal not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(r.file_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
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
end $$;

create or replace function public.acknowledge_policy_update(p_update uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare u public.policy_updates%rowtype;
begin
  select * into u from public.policy_updates where id = p_update;
  if u.id is null then raise exception 'Policy update not visible' using errcode = '42501'; end if;
  if u.acknowledged_at is not null then return; end if;
  update public.policy_updates set acknowledged_by = auth.uid(), acknowledged_at = now() where id = p_update;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lender_contacts       enable row level security;
alter table public.policy_updates        enable row level security;
alter table public.offers                enable row level security;
alter table public.closings              enable row level security;
alter table public.funded_deals          enable row level security;
alter table public.renewal_opportunities enable row level security;
revoke all on public.lender_contacts, public.policy_updates, public.offers, public.closings, public.funded_deals, public.renewal_opportunities from public, anon;
grant select, insert, update on public.lender_contacts, public.policy_updates, public.offers, public.closings, public.renewal_opportunities to authenticated;
grant select, insert on public.funded_deals to authenticated;     -- immutable: no update, no delete

create policy lender_contacts_select on public.lender_contacts for select to authenticated using (public.lender_visible(lender_id));
create policy lender_contacts_insert on public.lender_contacts for insert to authenticated with check (public.lender_editable(lender_id));
create policy lender_contacts_update on public.lender_contacts for update to authenticated using (public.lender_editable(lender_id)) with check (public.lender_editable(lender_id));

create policy policy_updates_select on public.policy_updates for select to authenticated
  using (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_visible(p.lender_id)));
create policy policy_updates_insert on public.policy_updates for insert to authenticated
  with check (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_editable(p.lender_id)));
create policy policy_updates_update on public.policy_updates for update to authenticated
  using (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_editable(p.lender_id)))
  with check (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_editable(p.lender_id)));

-- offers: readable with the file (and by the lender who made them); reviewers write; a lender user records an offer on their own deal.
create policy offers_select on public.offers for select to authenticated
  using (public.funding_file_visible(file_id) or public.is_borrower_of_file(file_id) or public.is_lender_for_file(file_id));
create policy offers_insert on public.offers for insert to authenticated
  with check (public.file_reviewer(file_id)
              or (lender_id is not null and public.is_lender_for_file(file_id) and exists (select 1 from public.lender_users lu where lu.lender_id = offers.lender_id and lu.user_id = auth.uid())));
create policy offers_update on public.offers for update to authenticated using (public.file_reviewer(file_id)) with check (public.file_reviewer(file_id));

create policy closings_select on public.closings for select to authenticated using (public.funding_file_visible(file_id) or public.is_borrower_of_file(file_id));
create policy closings_insert on public.closings for insert to authenticated with check (public.file_reviewer(file_id));
create policy closings_update on public.closings for update to authenticated using (public.file_reviewer(file_id)) with check (public.file_reviewer(file_id));

create policy funded_deals_select on public.funded_deals for select to authenticated using (public.funding_file_visible(file_id) or public.is_borrower_of_file(file_id) or public.is_lender_for_file(file_id));
create policy funded_deals_insert on public.funded_deals for insert to authenticated with check (public.file_reviewer(file_id));

create policy renewal_opportunities_select on public.renewal_opportunities for select to authenticated using (public.funding_file_visible(file_id));
create policy renewal_opportunities_insert on public.renewal_opportunities for insert to authenticated with check (public.file_reviewer(file_id));
create policy renewal_opportunities_update on public.renewal_opportunities for update to authenticated using (public.file_reviewer(file_id)) with check (public.file_reviewer(file_id));

revoke execute on function
  public.funding_event_visibility(uuid, uuid), public.set_offer_status(uuid, public.offer_status, text), public.start_closing(uuid, text),
  public.advance_closing(uuid, public.closing_status, text), public.confirm_funding(uuid, numeric, numeric, timestamptz, text, text),
  public.create_renewal_file(uuid, text, numeric), public.acknowledge_policy_update(uuid)
  from public, anon;
grant execute on function
  public.funding_event_visibility(uuid, uuid), public.set_offer_status(uuid, public.offer_status, text), public.start_closing(uuid, text),
  public.advance_closing(uuid, public.closing_status, text), public.confirm_funding(uuid, numeric, numeric, timestamptz, text, text),
  public.create_renewal_file(uuid, text, numeric), public.acknowledge_policy_update(uuid)
  to authenticated;
