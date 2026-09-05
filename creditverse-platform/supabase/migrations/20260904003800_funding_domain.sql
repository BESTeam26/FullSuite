-- =============================================================================
-- FundingOps domain data, first-class. Built to Addendum B of
-- ARCHITECTURE_PROPOSAL_FUNDING_DOMAIN.md (2026-09-05).
--
-- Doctrine carried into the schema:
--   GHL owns the relationship; FundingOps owns the funding file.
--   A document REQUEST (what a versioned requirement rule says must exist) is
--   never the same row as a document INSTANCE (what was uploaded). An upload
--   satisfies a request only when a person accepts it.
--   Document disposition ≠ file status ≠ lender decision: three vocabularies,
--   three places. Flags are a controlled taxonomy with evidence, never
--   free-text conclusions; a flag is never a rejection.
--   Lender matching cites a policy VERSION with a last-verified date; a stale
--   policy is "verification required", not a match.
--   Consumer reports are pulled only through a recorded permissible-purpose
--   request.
--   No identifiers (SSN, full EIN, account numbers) live in any of these
--   tables; evidence points at files in the private bucket.
--
-- Deferred to their own steps: GHL broker tables (mappings, inbound events,
-- outbox) land with the Edge Function; funding_leads with the GHL step.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Vocabularies (mirrored in src/lib/funding/*; the SQL is the source of truth)
-- ---------------------------------------------------------------------------
create type public.funding_party_kind as enum ('person', 'business', 'owner_guarantor', 'property', 'vehicle', 'seller', 'affiliate');
create type public.document_requirement as enum ('required', 'conditional');
create type public.document_request_status as enum ('open', 'satisfied', 'waived');
create type public.document_disposition as enum ('pending_review', 'accepted', 'needs_correction', 'not_accepted', 'escalated');
create type public.automated_review_status as enum ('no_issue_detected', 'review_recommended', 'potential_discrepancy', 'insufficient_data', 'processing_failed');
create type public.document_flag_code as enum (
  'MISSING_REQUIRED_DOCUMENT', 'WRONG_DOCUMENT_TYPE', 'UNREADABLE_DOCUMENT', 'MISSING_PAGE', 'EXPIRED_DOCUMENT', 'STALE_DOCUMENT',
  'DUPLICATE_DOCUMENT', 'DUPLICATE_PERIOD', 'STATEMENT_PERIOD_GAP', 'NAME_MISMATCH', 'BUSINESS_NAME_MISMATCH', 'ADDRESS_MISMATCH',
  'APPLICATION_DATA_MISMATCH', 'ACCOUNT_OWNERSHIP_MISMATCH', 'ENTITY_VERIFICATION_MISMATCH', 'FINANCIAL_PERIOD_MISMATCH',
  'CALCULATION_VARIANCE', 'INCOME_VARIANCE', 'PROPERTY_DATA_MISMATCH', 'VIN_MISMATCH', 'THIRD_PARTY_RISK_SIGNAL', 'POSSIBLE_TAMPER_SIGNAL',
  'INSUFFICIENT_EXTRACTION_CONFIDENCE', 'LENDER_SPECIFIC_EXCEPTION', 'COMPLIANCE_REVIEW_REQUIRED', 'PROCESSING_FAILURE'
);
create type public.flag_human_disposition as enum ('accepted', 'dismissed', 'correction_requested', 'escalated');
create type public.lender_decision_kind as enum ('pending', 'approved', 'conditional', 'declined', 'withdrawn', 'expired');
create type public.verification_provider_kind as enum ('identity', 'business', 'bank', 'document', 'fraud_signal', 'credit');
create type public.verification_status as enum ('verified', 'partially_verified', 'unable_to_verify', 'verification_failed');
create type public.consumer_report_authorization as enum ('authorized', 'pending', 'refused');

-- ---------------------------------------------------------------------------
-- Lenders, programs, policy versions
-- ---------------------------------------------------------------------------
create table public.lenders (
  id                   uuid primary key default gen_random_uuid(),
  agency_id            uuid not null references public.agencies(id) on delete cascade,
  organization_id      uuid references public.organizations(id) on delete cascade,   -- null = BES catalogue
  name                 text not null,
  lender_kind          text not null default 'funder' check (lender_kind in ('bank', 'credit_union', 'nonbank_lender', 'funder', 'network', 'cdc')),
  /** Registry identifiers for the "verified lender" panel (authoritative sources, not typed names). */
  nmls_id              text,
  fdic_certificate     text,
  ncua_charter         text,
  official_domain      text,
  last_registry_check  timestamptz,
  active               boolean not null default true,
  notes                text,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger lenders_updated_at before update on public.lenders for each row execute function public.set_updated_at();
create index lenders_org_idx on public.lenders (organization_id, active);

/** Which platform users act for a lender (external role 'lender'). */
create table public.lender_users (
  lender_id  uuid not null references public.lenders(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lender_id, user_id)
);

create table public.lender_programs (
  id               uuid primary key default gen_random_uuid(),
  lender_id        uuid not null references public.lenders(id) on delete cascade,
  name             text not null,
  product_family   text not null,      -- business_funding | mca | sba | real_estate | consumer | auto …
  product_subtype  text,
  states_allowed   text[] not null default '{}',   -- empty = not restricted by state in the stored policy
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index lender_programs_lender_idx on public.lender_programs (lender_id, active);

/** A program's criteria at a point in time. Matching always names the version it used. */
create table public.lender_policy_versions (
  id                     uuid primary key default gen_random_uuid(),
  program_id             uuid not null references public.lender_programs(id) on delete cascade,
  version                integer not null,
  /** min_amount, max_amount, min_credit_score, min_time_in_business_months, min_monthly_revenue, industries_excluded, document_minimums … */
  criteria               jsonb not null default '{}'::jsonb,
  source_type            text not null check (source_type in ('lender_policy_sheet', 'lender_portal', 'lender_email', 'public_program_guide', 'internal_experience')),
  source_reference       text,
  source_published_date  date,
  effective_from         date not null,
  effective_until        date,
  last_verified_at       timestamptz,
  verified_by            uuid references public.profiles(id) on delete set null,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  unique (program_id, version)
);
create index lender_policy_versions_effective_idx on public.lender_policy_versions (program_id, effective_from desc);

alter table public.funding_deals   add column if not exists lender_id uuid references public.lenders(id) on delete set null;
alter table public.funding_deals   add column if not exists program_id uuid references public.lender_programs(id) on delete set null;
alter table public.funding_clients add column if not exists portal_user_id uuid references public.profiles(id) on delete set null;
alter table public.funding_files   add column if not exists referred_by_membership_id uuid references public.external_memberships(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Parties: documents prove something about a party or asset, not "the client"
-- ---------------------------------------------------------------------------
create table public.funding_parties (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.funding_clients(id) on delete cascade,
  kind           public.funding_party_kind not null,
  business_id    uuid references public.funding_businesses(id) on delete set null,
  display_name   text not null,
  ownership_pct  numeric(5,2) check (ownership_pct is null or ownership_pct between 0 and 100),
  /** Descriptive only (address, property type, VIN last 4, role). Never an SSN, full EIN or account number. */
  details        jsonb not null default '{}'::jsonb,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index funding_parties_client_idx on public.funding_parties (client_id, kind);

-- ---------------------------------------------------------------------------
-- Application (screening data), versioned per file
-- ---------------------------------------------------------------------------
create table public.funding_applications (
  id                       uuid primary key default gen_random_uuid(),
  file_id                  uuid not null references public.funding_files(id) on delete cascade,
  version                  integer not null default 1,
  source                   text not null default 'staff' check (source in ('staff', 'portal', 'ghl')),
  submitted_at             timestamptz,
  requested_amount         numeric(14,2) check (requested_amount is null or requested_amount >= 0),
  purpose                  text,
  use_of_funds             text,
  product_family           text,
  state                    text check (state is null or state ~ '^[A-Z]{2}$'),
  entity_type              text,
  time_in_business_months  integer check (time_in_business_months is null or time_in_business_months >= 0),
  monthly_revenue          numeric(14,2) check (monthly_revenue is null or monthly_revenue >= 0),
  annual_revenue           numeric(14,2) check (annual_revenue is null or annual_revenue >= 0),
  credit_score_stated      integer check (credit_score_stated is null or credit_score_stated between 300 and 900),
  existing_debt_monthly    numeric(14,2) check (existing_debt_monthly is null or existing_debt_monthly >= 0),
  collateral               jsonb not null default '{}'::jsonb,
  /** Scenario flags the requirement resolver reads: acquisition, refinance, startup, real_estate, change_of_ownership, affiliates … */
  scenario                 jsonb not null default '{}'::jsonb,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (file_id, version)
);
create trigger funding_applications_updated_at before update on public.funding_applications for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Requirement rules: versioned, effective-dated, sourced. There is no universal checklist.
-- ---------------------------------------------------------------------------
create table public.requirement_rules (
  id                     uuid primary key default gen_random_uuid(),
  agency_id              uuid not null references public.agencies(id) on delete cascade,
  organization_id        uuid references public.organizations(id) on delete cascade,   -- null = BES platform defaults
  product_family         text not null,
  product_subtype        text,
  lender_id              uuid references public.lenders(id) on delete cascade,          -- null = applies to the product regardless of lender
  program_id             uuid references public.lender_programs(id) on delete cascade,
  party_kind             public.funding_party_kind not null,
  document_type          text not null,                                                 -- bank_statement | processing_statement | government_id | tax_return | pnl | balance_sheet | sba_form_1919 …
  requirement            public.document_requirement not null default 'required',
  /** Evaluated by the resolver: amount bands, ownership_pct thresholds, states, entity types, scenario flags. */
  condition              jsonb not null default '{}'::jsonb,
  lookback_months        integer check (lookback_months is null or lookback_months > 0),
  max_age_days           integer check (max_age_days is null or max_age_days > 0),
  sequence_required      boolean not null default false,
  all_pages_required     boolean not null default true,
  signature_required     boolean not null default false,
  source_type            text not null check (source_type in ('statute_or_regulation', 'agency_procedure', 'lender_policy', 'internal_experience')),
  source_reference       text,
  source_published_date  date,
  effective_from         date not null,
  effective_until        date,
  last_verified_at       timestamptz,
  verified_by            uuid references public.profiles(id) on delete set null,
  version                integer not null default 1,
  active                 boolean not null default true,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index requirement_rules_lookup_idx on public.requirement_rules (product_family, effective_from desc) where active;
create index requirement_rules_org_idx on public.requirement_rules (organization_id);

-- ---------------------------------------------------------------------------
-- Document requests (what must exist) and instances (what was uploaded)
-- ---------------------------------------------------------------------------
create table public.document_requests (
  id              uuid primary key default gen_random_uuid(),
  file_id         uuid not null references public.funding_files(id) on delete cascade,
  party_id        uuid references public.funding_parties(id) on delete set null,
  document_type   text not null,
  period          text check (period is null or period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- yyyy-mm for statements
  requirement     public.document_requirement not null default 'required',
  rule_id         uuid references public.requirement_rules(id) on delete set null,
  rule_version    integer,
  status          public.document_request_status not null default 'open',
  waived_by       uuid references public.profiles(id) on delete set null,
  waived_reason   text,
  waived_at       timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger document_requests_updated_at before update on public.document_requests for each row execute function public.set_updated_at();
create unique index document_requests_one_per_need on public.document_requests (file_id, coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type, coalesce(period, ''));
create index document_requests_open_idx on public.document_requests (file_id, status);

create table public.document_instances (
  id                     uuid primary key default gen_random_uuid(),
  file_id                uuid not null references public.funding_files(id) on delete cascade,
  request_id             uuid references public.document_requests(id) on delete set null,
  /** The immutable original in the private bucket. A correction is a NEW instance that supersedes this one. */
  storage_file_id        uuid not null references public.files(id) on delete restrict,
  sha256                 text not null,
  mime_type              text,
  size_bytes             bigint check (size_bytes is null or size_bytes >= 0),
  pages                  integer check (pages is null or pages >= 0),
  uploaded_by            uuid references public.profiles(id) on delete set null,
  upload_source          text not null default 'staff' check (upload_source in ('staff', 'portal', 'ghl')),
  classified_type        text,
  classified_period      text check (classified_period is null or classified_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  /** Structured extraction; never the raw document text. Provenance travels with it. */
  extraction             jsonb not null default '{}'::jsonb,
  extractor              text,
  extractor_version      text,
  extraction_confidence  numeric(4,3) check (extraction_confidence is null or extraction_confidence between 0 and 1),
  disposition            public.document_disposition not null default 'pending_review',
  reviewed_by            uuid references public.profiles(id) on delete set null,
  reviewed_at            timestamptz,
  reason                 text,
  supersedes_id          uuid references public.document_instances(id) on delete set null,
  shareable_with_lender  boolean not null default false,
  created_at             timestamptz not null default now()
);
create index document_instances_file_idx on public.document_instances (file_id, disposition);
create index document_instances_hash_idx on public.document_instances (file_id, sha256);

alter table public.document_requests add column satisfied_by_instance_id uuid references public.document_instances(id) on delete set null;

create table public.document_flags (
  id                 uuid primary key default gen_random_uuid(),
  file_id            uuid not null references public.funding_files(id) on delete cascade,
  instance_id        uuid references public.document_instances(id) on delete cascade,
  request_id         uuid references public.document_requests(id) on delete cascade,
  flag_code          public.document_flag_code not null,
  automated_status   public.automated_review_status not null default 'review_recommended',
  /** Evidence the reviewer can check (expected vs received periods, normalised names, page counts). No conclusions. */
  evidence           jsonb not null default '{}'::jsonb,
  rule_id            text,
  rule_version       text,
  confidence         numeric(4,3) check (confidence is null or confidence between 0 and 1),
  human_disposition  public.flag_human_disposition,
  reviewer           uuid references public.profiles(id) on delete set null,
  reviewer_reason    text,
  reviewed_at        timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (instance_id is not null or request_id is not null)
);
create index document_flags_file_idx on public.document_flags (file_id, human_disposition);

-- ---------------------------------------------------------------------------
-- Lender decisions (their own object), verification results, consumer-report gate
-- ---------------------------------------------------------------------------
create table public.lender_decisions (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references public.funding_deals(id) on delete cascade,
  decision     public.lender_decision_kind not null,
  decided_at   timestamptz not null default now(),
  terms        jsonb not null default '{}'::jsonb,     -- amount, rate/APR as given, term, fees, payment, expires_at
  conditions   text,
  source       text not null default 'staff' check (source in ('staff', 'lender_portal', 'api')),
  recorded_by  uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);
create index lender_decisions_deal_idx on public.lender_decisions (deal_id, decided_at desc);

create table public.verification_results (
  id             uuid primary key default gen_random_uuid(),
  file_id        uuid not null references public.funding_files(id) on delete cascade,
  party_id       uuid references public.funding_parties(id) on delete set null,
  instance_id    uuid references public.document_instances(id) on delete set null,
  provider       text not null,                          -- 'reviewer' for a result a person recorded by hand
  provider_kind  public.verification_provider_kind not null,
  provider_ref   text,
  status         public.verification_status not null,
  /** Reason codes and signals only. Never the provider's raw payload, never identifiers. */
  signals        jsonb not null default '{}'::jsonb,
  requested_by   uuid references public.profiles(id) on delete set null,
  requested_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index verification_results_file_idx on public.verification_results (file_id, provider_kind);

/** No consumer report is pulled without one of these rows. */
create table public.consumer_report_requests (
  id                         uuid primary key default gen_random_uuid(),
  file_id                    uuid not null references public.funding_files(id) on delete cascade,
  party_id                   uuid not null references public.funding_parties(id) on delete restrict,
  product_family             text not null,
  purpose                    text not null,
  permissible_purpose_basis  text not null,
  authorization_state        public.consumer_report_authorization not null default 'pending',
  consent_text_version       text,
  requested_by               uuid references public.profiles(id) on delete set null,
  requested_at               timestamptz not null default now(),
  provider                   text,
  report_id                  uuid references public.credit_reports(id) on delete set null,
  created_at                 timestamptz not null default now()
);
create index consumer_report_requests_file_idx on public.consumer_report_requests (file_id);

-- ---------------------------------------------------------------------------
-- Commissions and lender shares (unchanged from the first draft)
-- ---------------------------------------------------------------------------
create table public.commissions (
  id               uuid primary key default gen_random_uuid(),
  deal_id          uuid not null references public.funding_deals(id) on delete cascade,
  party_kind       text not null check (party_kind in ('agency', 'org_user', 'partner', 'lender_referral')),
  party_id         uuid not null,
  basis            text not null check (basis in ('pct', 'flat')),
  rate_or_amount   numeric(14,4) not null check (rate_or_amount >= 0),
  computed_amount  numeric(14,2) check (computed_amount is null or computed_amount >= 0),
  state            text not null default 'pending' check (state in ('pending', 'approved', 'paid', 'void')),
  funded_at        timestamptz,
  paid_at          timestamptz,
  note             text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger commissions_updated_at before update on public.commissions for each row execute function public.set_updated_at();
create index commissions_deal_idx on public.commissions (deal_id);

create table public.lender_file_shares (
  id          uuid primary key default gen_random_uuid(),
  lender_id   uuid not null references public.lenders(id) on delete cascade,
  file_id     uuid not null references public.funding_files(id) on delete cascade,
  shared_by   uuid references public.profiles(id) on delete set null,
  shared_at   timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (lender_id, file_id)
);
create index lender_file_shares_file_idx on public.lender_file_shares (file_id);

-- ---------------------------------------------------------------------------
-- Helpers (who is who for a file)
-- ---------------------------------------------------------------------------
/** Who sees a funding file = who sees its client (existing policies, INVOKER). */
create or replace function public.funding_file_visible(p_file uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.funding_files f where f.id = p_file)
$$;
create or replace function public.is_borrower_of_file(p_file uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.funding_files f join public.funding_clients c on c.id = f.client_id where f.id = p_file and c.portal_user_id = auth.uid())
$$;
create or replace function public.is_lender_for_file(p_file uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lender_file_shares s join public.lender_users lu on lu.lender_id = s.lender_id
                  where s.file_id = p_file and s.revoked_at is null and lu.user_id = auth.uid())
$$;
create or replace function public.file_org_admin(p_file uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.funding_files f join public.funding_clients c on c.id = f.client_id
                  where f.id = p_file and c.organization_id is not null and public.is_org_admin(c.organization_id) and public.org_has_product(c.organization_id, 'fundingOps'))
$$;
create or replace function public.file_bes_in_scope(p_file uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.funding_files f join public.funding_clients c on c.id = f.client_id
                  where f.id = p_file and public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'fundingops')
                    and public.in_scope(c.agency_id, 'fundingops', c.team_id, c.assigned_agent_id, c.created_by))
$$;
/** Reviewer for a file = organization admin with FundingOps, or BES in scope. Borrowers and lenders never dispose. */
create or replace function public.file_reviewer(p_file uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.file_org_admin(p_file) or public.file_bes_in_scope(p_file)
$$;
create or replace function public.lender_visible(p_lender uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lenders l where l.id = p_lender and (
    (l.organization_id is null and (public.is_agency_staff() or exists (select 1 from public.org_memberships m where m.user_id = auth.uid())))
    or (l.organization_id is not null and (public.is_org_member(l.organization_id) or public.is_manager_of(l.agency_id)))
    or exists (select 1 from public.lender_users lu where lu.lender_id = l.id and lu.user_id = auth.uid())))
$$;
create or replace function public.lender_editable(p_lender uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lenders l where l.id = p_lender and (
    (l.organization_id is null and public.is_manager_of(l.agency_id))
    or (l.organization_id is not null and public.is_org_admin(l.organization_id) and public.org_has_product(l.organization_id, 'fundingOps'))))
$$;

-- ---------------------------------------------------------------------------
-- Dispositions and decisions are transitions with an activity event (rule 10)
-- ---------------------------------------------------------------------------
create or replace function public.record_document_disposition(p_instance uuid, p_disposition public.document_disposition, p_reason text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  i public.document_instances%rowtype;
  f public.funding_files%rowtype;
  c public.funding_clients%rowtype;
  v_prev text;
begin
  select * into i from public.document_instances where id = p_instance;
  if i.id is null then raise exception 'Document not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(i.file_id) then raise exception 'Not a reviewer for this file' using errcode = '42501'; end if;
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
end $$;

/** Deal status follows the lender's decision by a fixed mapping; the decision row is the record. */
create or replace function public.deal_status_for_decision(p_decision public.lender_decision_kind)
returns public.funding_deal_status language sql immutable as $$
  select case p_decision
    when 'approved'    then 'Offer Received'::public.funding_deal_status
    when 'conditional' then 'Stipulations'::public.funding_deal_status
    when 'declined'    then 'Declined'::public.funding_deal_status
    when 'withdrawn'   then 'Withdrawn'::public.funding_deal_status
    else null end
$$;

create or replace function public.record_lender_decision(p_deal uuid, p_decision public.lender_decision_kind, p_terms jsonb default '{}'::jsonb, p_conditions text default null, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  d public.funding_deals%rowtype;
  f public.funding_files%rowtype;
  c public.funding_clients%rowtype;
  v_id uuid;
  v_status public.funding_deal_status;
  v_source text := 'staff';
begin
  select * into d from public.funding_deals where id = p_deal;
  if d.id is null then raise exception 'Deal not visible' using errcode = '42501'; end if;
  select * into f from public.funding_files where id = d.file_id;
  select * into c from public.funding_clients where id = f.client_id;
  if public.is_lender_for_file(d.file_id) and d.lender_id is not null
     and exists (select 1 from public.lender_users lu where lu.lender_id = d.lender_id and lu.user_id = auth.uid()) then
    v_source := 'lender_portal';
  elsif not public.file_reviewer(d.file_id) then
    raise exception 'Not permitted to record a decision on this deal' using errcode = '42501';
  end if;

  insert into public.lender_decisions (deal_id, decision, terms, conditions, source, recorded_by, note)
  values (p_deal, p_decision, coalesce(p_terms, '{}'::jsonb), p_conditions, v_source, auth.uid(), p_note) returning id into v_id;

  v_status := public.deal_status_for_decision(p_decision);
  if v_status is not null then update public.funding_deals set status = v_status, updated_at = now() where id = p_deal; end if;
  update public.funding_files set last_activity_at = now() where id = d.file_id;
  update public.funding_clients set last_activity_at = now() where id = f.client_id;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (f.agency_id, c.organization_id, 'funding_client', f.client_id::text, auth.uid(),
          'Lender decision', coalesce(p_note, d.lender || ' · ' || p_decision::text), 'deal:' || p_deal::text, d.status::text, p_decision::text,
          case when public.is_staff_of(f.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(f.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lenders                  enable row level security;
alter table public.lender_users             enable row level security;
alter table public.lender_programs          enable row level security;
alter table public.lender_policy_versions   enable row level security;
alter table public.funding_parties          enable row level security;
alter table public.funding_applications     enable row level security;
alter table public.requirement_rules        enable row level security;
alter table public.document_requests        enable row level security;
alter table public.document_instances       enable row level security;
alter table public.document_flags           enable row level security;
alter table public.lender_decisions         enable row level security;
alter table public.verification_results     enable row level security;
alter table public.consumer_report_requests enable row level security;
alter table public.commissions              enable row level security;
alter table public.lender_file_shares       enable row level security;

revoke all on public.lenders, public.lender_users, public.lender_programs, public.lender_policy_versions, public.funding_parties,
  public.funding_applications, public.requirement_rules, public.document_requests, public.document_instances, public.document_flags,
  public.lender_decisions, public.verification_results, public.consumer_report_requests, public.commissions, public.lender_file_shares from public, anon;
grant select, insert, update on public.lenders, public.lender_programs, public.lender_policy_versions, public.funding_parties, public.funding_applications,
  public.requirement_rules, public.document_requests, public.document_instances, public.document_flags, public.commissions, public.lender_file_shares to authenticated;
grant select on public.lender_users to authenticated;
-- Append-only records: no update grant, no update policy (history cannot be rewritten).
grant select, insert on public.lender_decisions, public.verification_results, public.consumer_report_requests to authenticated;

-- lenders / programs / policy versions
create policy lenders_select on public.lenders for select to authenticated using (public.lender_visible(id));
create policy lenders_insert on public.lenders for insert to authenticated
  with check ((organization_id is null and public.is_manager_of(agency_id)) or (organization_id is not null and public.is_org_admin(organization_id) and public.org_has_product(organization_id, 'fundingOps')));
create policy lenders_update on public.lenders for update to authenticated using (public.lender_editable(id)) with check (public.lender_editable(id));
create policy lender_users_select on public.lender_users for select to authenticated using (user_id = auth.uid() or public.lender_editable(lender_id));
create policy lender_programs_select on public.lender_programs for select to authenticated using (public.lender_visible(lender_id));
create policy lender_programs_insert on public.lender_programs for insert to authenticated with check (public.lender_editable(lender_id));
create policy lender_programs_update on public.lender_programs for update to authenticated using (public.lender_editable(lender_id)) with check (public.lender_editable(lender_id));
create policy lender_policy_versions_select on public.lender_policy_versions for select to authenticated
  using (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_visible(p.lender_id)));
create policy lender_policy_versions_insert on public.lender_policy_versions for insert to authenticated
  with check (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_editable(p.lender_id)));
-- A policy version is a record of what was believed at the time: it is verified (last_verified_at) or superseded, never rewritten.
create policy lender_policy_versions_verify on public.lender_policy_versions for update to authenticated
  using (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_editable(p.lender_id)))
  with check (exists (select 1 from public.lender_programs p where p.id = program_id and public.lender_editable(p.lender_id)));

-- parties: follow the client (existing funding_clients policies), plus the borrower.
create policy funding_parties_select on public.funding_parties for select to authenticated
  using (exists (select 1 from public.funding_clients c where c.id = client_id) or exists (select 1 from public.funding_clients c where c.id = client_id and c.portal_user_id = auth.uid()));
create policy funding_parties_insert on public.funding_parties for insert to authenticated
  with check (exists (select 1 from public.funding_files f where f.client_id = funding_parties.client_id and public.file_reviewer(f.id))
              or exists (select 1 from public.funding_clients c where c.id = client_id and c.portal_user_id = auth.uid()));
create policy funding_parties_update on public.funding_parties for update to authenticated
  using (exists (select 1 from public.funding_files f where f.client_id = funding_parties.client_id and public.file_reviewer(f.id)))
  with check (exists (select 1 from public.funding_files f where f.client_id = funding_parties.client_id and public.file_reviewer(f.id)));

-- applications: follow the file; borrower and shared lender read; borrower writes drafts.
create policy funding_applications_select on public.funding_applications for select to authenticated
  using (public.funding_file_visible(file_id) or public.is_borrower_of_file(file_id) or public.is_lender_for_file(file_id));
create policy funding_applications_insert on public.funding_applications for insert to authenticated
  with check (public.file_reviewer(file_id) or (public.is_borrower_of_file(file_id) and source = 'portal'));
create policy funding_applications_update on public.funding_applications for update to authenticated
  using (public.file_reviewer(file_id) or (public.is_borrower_of_file(file_id) and submitted_at is null))
  with check (public.file_reviewer(file_id) or public.is_borrower_of_file(file_id));

-- requirement rules: platform rows readable by anyone with a FundingOps seat; organization rows by that organization and BES.
create policy requirement_rules_select on public.requirement_rules for select to authenticated
  using ((organization_id is null and (public.is_agency_staff() or exists (select 1 from public.org_memberships m where m.user_id = auth.uid())))
         or (organization_id is not null and (public.is_org_member(organization_id) or public.is_manager_of(agency_id))));
create policy requirement_rules_insert on public.requirement_rules for insert to authenticated
  with check ((organization_id is null and public.is_manager_of(agency_id)) or (organization_id is not null and public.is_org_admin(organization_id) and public.org_has_product(organization_id, 'fundingOps')));
create policy requirement_rules_update on public.requirement_rules for update to authenticated
  using ((organization_id is null and public.is_manager_of(agency_id)) or (organization_id is not null and public.is_org_admin(organization_id)))
  with check ((organization_id is null and public.is_manager_of(agency_id)) or (organization_id is not null and public.is_org_admin(organization_id)));

-- requests: reviewers write; borrower reads (their next action); shared lender reads.
create policy document_requests_select on public.document_requests for select to authenticated
  using (public.funding_file_visible(file_id) or public.is_borrower_of_file(file_id) or public.is_lender_for_file(file_id));
create policy document_requests_insert on public.document_requests for insert to authenticated with check (public.file_reviewer(file_id));
create policy document_requests_update on public.document_requests for update to authenticated using (public.file_reviewer(file_id)) with check (public.file_reviewer(file_id));

-- instances: borrower uploads (portal) and sees their own; reviewers see all and dispose through the function; lenders see shareable, accepted instances only.
create policy document_instances_select on public.document_instances for select to authenticated
  using (public.funding_file_visible(file_id) or public.is_borrower_of_file(file_id)
         or (public.is_lender_for_file(file_id) and shareable_with_lender and disposition = 'accepted'));
create policy document_instances_insert on public.document_instances for insert to authenticated
  with check (public.file_reviewer(file_id) or (public.is_borrower_of_file(file_id) and upload_source = 'portal' and disposition = 'pending_review'));
create policy document_instances_update on public.document_instances for update to authenticated using (public.file_reviewer(file_id)) with check (public.file_reviewer(file_id));

-- flags: reviewers only (the borrower sees the plain-language request, never the flag).
create policy document_flags_select on public.document_flags for select to authenticated using (public.funding_file_visible(file_id) and public.file_reviewer(file_id));
create policy document_flags_insert on public.document_flags for insert to authenticated with check (public.file_reviewer(file_id));
create policy document_flags_update on public.document_flags for update to authenticated using (public.file_reviewer(file_id)) with check (public.file_reviewer(file_id));

-- lender decisions: readable with the deal's file or by the lender who posted; inserted through record_lender_decision (policy mirrors it).
create policy lender_decisions_select on public.lender_decisions for select to authenticated
  using (exists (select 1 from public.funding_deals d where d.id = deal_id and (public.funding_file_visible(d.file_id) or public.is_lender_for_file(d.file_id))));
create policy lender_decisions_insert on public.lender_decisions for insert to authenticated
  with check (exists (select 1 from public.funding_deals d where d.id = deal_id and (public.file_reviewer(d.file_id)
              or (d.lender_id is not null and public.is_lender_for_file(d.file_id) and exists (select 1 from public.lender_users lu where lu.lender_id = d.lender_id and lu.user_id = auth.uid())))));

-- verification results and consumer-report requests: reviewers only.
create policy verification_results_select on public.verification_results for select to authenticated using (public.file_reviewer(file_id));
create policy verification_results_insert on public.verification_results for insert to authenticated with check (public.file_reviewer(file_id));
create policy consumer_report_requests_select on public.consumer_report_requests for select to authenticated using (public.file_reviewer(file_id));
create policy consumer_report_requests_insert on public.consumer_report_requests for insert to authenticated with check (public.file_reviewer(file_id));

-- commissions: reviewers see all for their deals; a party sees its own rows.
create policy commissions_select on public.commissions for select to authenticated
  using (exists (select 1 from public.funding_deals d where d.id = deal_id and public.file_reviewer(d.file_id))
         or (party_kind = 'org_user' and party_id = auth.uid())
         or (party_kind in ('partner', 'lender_referral') and exists (select 1 from public.external_memberships em where em.id = party_id and em.user_id = auth.uid())));
create policy commissions_insert on public.commissions for insert to authenticated
  with check (exists (select 1 from public.funding_deals d where d.id = deal_id and public.file_reviewer(d.file_id)));
create policy commissions_update on public.commissions for update to authenticated
  using (exists (select 1 from public.funding_deals d where d.id = deal_id and public.file_reviewer(d.file_id)))
  with check (exists (select 1 from public.funding_deals d where d.id = deal_id and public.file_reviewer(d.file_id)));

create policy lender_file_shares_select on public.lender_file_shares for select to authenticated
  using (public.funding_file_visible(file_id) or exists (select 1 from public.lender_users lu where lu.lender_id = lender_id and lu.user_id = auth.uid()));
create policy lender_file_shares_insert on public.lender_file_shares for insert to authenticated with check (public.file_reviewer(file_id));
create policy lender_file_shares_update on public.lender_file_shares for update to authenticated using (public.file_reviewer(file_id)) with check (public.file_reviewer(file_id));

-- lenders post offers as deals on files shared with them (existing funding_deals insert policy is BES/org; this adds the lender branch).
create policy funding_deals_lender_insert on public.funding_deals for insert to authenticated
  with check (lender_id is not null and public.is_lender_for_file(file_id)
              and exists (select 1 from public.lender_users lu where lu.lender_id = funding_deals.lender_id and lu.user_id = auth.uid()));
create policy funding_deals_lender_select on public.funding_deals for select to authenticated using (public.is_lender_for_file(file_id));
-- …and record_lender_decision() moves the status of their own deal (SECURITY INVOKER, so the update needs this policy).
create policy funding_deals_lender_update on public.funding_deals for update to authenticated
  using (lender_id is not null and public.is_lender_for_file(file_id) and exists (select 1 from public.lender_users lu where lu.lender_id = funding_deals.lender_id and lu.user_id = auth.uid()))
  with check (lender_id is not null and public.is_lender_for_file(file_id) and exists (select 1 from public.lender_users lu where lu.lender_id = funding_deals.lender_id and lu.user_id = auth.uid()));

revoke execute on function
  public.funding_file_visible(uuid), public.is_borrower_of_file(uuid), public.is_lender_for_file(uuid), public.file_org_admin(uuid),
  public.file_bes_in_scope(uuid), public.file_reviewer(uuid), public.lender_visible(uuid), public.lender_editable(uuid),
  public.record_document_disposition(uuid, public.document_disposition, text), public.deal_status_for_decision(public.lender_decision_kind),
  public.record_lender_decision(uuid, public.lender_decision_kind, jsonb, text, text)
  from public, anon;
grant execute on function
  public.funding_file_visible(uuid), public.is_borrower_of_file(uuid), public.is_lender_for_file(uuid), public.file_org_admin(uuid),
  public.file_bes_in_scope(uuid), public.file_reviewer(uuid), public.lender_visible(uuid), public.lender_editable(uuid),
  public.record_document_disposition(uuid, public.document_disposition, text), public.deal_status_for_decision(public.lender_decision_kind),
  public.record_lender_decision(uuid, public.lender_decision_kind, jsonb, text, text)
  to authenticated;
