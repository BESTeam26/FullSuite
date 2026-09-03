-- =============================================================================
-- Phase 5 — FundingOps Agency Fulfillment Workspace
--
-- Mirrors the CreditOps shape deliberately: same partner scoping, same
-- one-email-per-partner identity rule, same append-only audit, same grant
-- lockdown. A reviewer who has read migration 0005 should recognise all of it.
--
-- ON RULE 2 (one canonical data model)
-- ------------------------------------
-- A funding client is NOT a copy of a CreditOps client, and this table is not
-- a second people table. `fulfillment_clients` today carries CreditOps-specific
-- columns (round, dispute open_items), so it is really the CreditOps
-- ENGAGEMENT, not a canonical person. Splitting a shared person record out from
-- under it belongs with the Phase 6 SaaS client workspace, where the person
-- record gets a real home.
--
-- What this migration does instead of duplicating quietly:
--   * enforces the SAME one-email-per-partner index inside FundingOps, so a
--     person cannot fork within this division;
--   * carries `fulfillment_client_id`, an explicit link to the CreditOps record
--     for the same human when one exists;
--   * ships `find_client_across_divisions()` so the Add Client flow can SEE the
--     other division's record and link to it instead of creating a stranger.
--
-- The link is explicit and queryable, which is what rule 2 is protecting. Full
-- unification is recorded as Phase 6 work, not silently skipped.
-- =============================================================================

create type public.funding_client_status as enum (
  'Onboarding', 'Readiness Review', 'Document Review', 'Lender Matching',
  'Submitted', 'Stipulations', 'Offer Received', 'Funded', 'Declined',
  'Withdrawn', 'Archived'
);

create type public.funding_provenance as enum ('bes_saas_synced', 'agency_manual');

create type public.funding_file_stage as enum (
  'Readiness Review', 'Document Review', 'Lender Matching', 'Submitted',
  'Stipulations', 'Offer Received', 'Funded', 'Declined', 'Withdrawn'
);

create type public.funding_deal_status as enum (
  'Draft', 'Submitted', 'In Review', 'Stipulations', 'Offer Received',
  'Funded', 'Declined', 'Withdrawn'
);

create type public.funding_department as enum (
  'Readiness Review', 'Document Review', 'Lender Matching', 'Submissions',
  'Stipulations', 'Offers', 'Funded Deals'
);

-- -----------------------------------------------------------------------------
-- funding_clients
-- -----------------------------------------------------------------------------
create table public.funding_clients (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,

  name                  text not null,
  email                 citext not null,
  phone                 text,

  mode                  public.fulfillment_mode not null,
  provenance            public.funding_provenance not null default 'agency_manual',
  organization_id       uuid references public.organizations(id) on delete cascade,
  outsourcing_group_id  uuid references public.outsourcing_groups(id) on delete cascade,
  auto_sync             boolean not null default false,

  /** The same human's CreditOps record, when they have one. See the header. */
  fulfillment_client_id uuid references public.fulfillment_clients(id) on delete set null,

  status                public.funding_client_status not null default 'Onboarding',
  assigned_agent_id     uuid references public.profiles(id) on delete set null,
  due_at                timestamptz,

  last_activity_at      timestamptz not null default now(),
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  partner_scope_id      uuid generated always as (
                          coalesce(organization_id, outsourcing_group_id)
                        ) stored,

  constraint funding_clients_mode_scope_ck check (
    (mode = 'saas_pulled'      and organization_id is not null and outsourcing_group_id is null) or
    (mode = 'outsourcing_only' and outsourcing_group_id is not null and organization_id is null)
  )
);

/** ONE EMAIL = ONE FILE PER PARTNER, same rule CreditOps enforces. */
create unique index funding_clients_one_email_per_partner
  on public.funding_clients (partner_scope_id, lower(email::text));

create index funding_clients_agency_idx on public.funding_clients (agency_id, status);
create index funding_clients_partner_idx on public.funding_clients (partner_scope_id);
create index funding_clients_agent_idx on public.funding_clients (assigned_agent_id);
create index funding_clients_link_idx on public.funding_clients (fulfillment_client_id);

create trigger funding_clients_updated_at before update on public.funding_clients
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- funding_businesses — one client may own several
-- -----------------------------------------------------------------------------
create table public.funding_businesses (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.funding_clients(id) on delete cascade,
  legal_name        text not null,
  dba               text,
  industry          text,
  /** Last 4 only. A full EIN is an identifier and does not belong here (rule 1). */
  ein_last4         text check (ein_last4 is null or ein_last4 ~ '^[0-9]{4}$'),
  annual_revenue    numeric(14,2),
  time_in_business_months integer check (time_in_business_months is null or time_in_business_months >= 0),
  created_at        timestamptz not null default now()
);

create index funding_businesses_client_idx on public.funding_businesses (client_id);

-- -----------------------------------------------------------------------------
-- funding_files — one funding cycle for one business
-- -----------------------------------------------------------------------------
create table public.funding_files (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  client_id         uuid not null references public.funding_clients(id) on delete cascade,
  business_id       uuid not null references public.funding_businesses(id) on delete restrict,

  purpose           text not null,
  requested_amount  numeric(14,2) not null check (requested_amount >= 0),
  stage             public.funding_file_stage not null default 'Readiness Review',
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  due_at            timestamptz,

  last_activity_at  timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index funding_files_client_idx on public.funding_files (client_id, stage);
create index funding_files_agency_stage_idx on public.funding_files (agency_id, stage);

create trigger funding_files_updated_at before update on public.funding_files
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- funding_deals — one lender submission inside a file
-- -----------------------------------------------------------------------------
create table public.funding_deals (
  id                uuid primary key default gen_random_uuid(),
  file_id           uuid not null references public.funding_files(id) on delete cascade,
  client_id         uuid not null references public.funding_clients(id) on delete cascade,

  lender            text not null,
  program           text,
  amount            numeric(14,2) not null check (amount >= 0),
  rate              text,
  term              text,
  status            public.funding_deal_status not null default 'Draft',
  stips_outstanding integer not null default 0 check (stips_outstanding >= 0),

  submitted_at      timestamptz,
  funded_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  /** A deal cannot be funded without a funded date, or dated without funding. */
  constraint funding_deals_funded_ck check (
    (status = 'Funded') = (funded_at is not null)
  )
);

create index funding_deals_file_idx on public.funding_deals (file_id, status);
create index funding_deals_client_idx on public.funding_deals (client_id);

create trigger funding_deals_updated_at before update on public.funding_deals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- funding_department_statuses — per-stage progress, mirroring CreditOps
-- -----------------------------------------------------------------------------
create table public.funding_department_statuses (
  client_id   uuid not null references public.funding_clients(id) on delete cascade,
  department  public.funding_department not null,
  status      text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (client_id, department)
);

-- =============================================================================
-- Row Level Security — identical shape to CreditOps
-- =============================================================================
alter table public.funding_clients enable row level security;
alter table public.funding_businesses enable row level security;
alter table public.funding_files enable row level security;
alter table public.funding_deals enable row level security;
alter table public.funding_department_statuses enable row level security;

/* Agency staff see everything; an organization's members see only their own.
   Outsourcing-only clients belong to a BES contract, so `can_view_org` on a
   NULL organization resolves to agency staff only. */
create policy funding_clients_select on public.funding_clients for select to authenticated
  using (public.is_agency_staff() or public.is_org_member(organization_id));
create policy funding_clients_write on public.funding_clients for all to authenticated
  using (public.is_agency_staff() or public.is_org_member(organization_id))
  with check (public.is_agency_staff() or public.is_org_member(organization_id));

/* Children inherit the parent client's visibility rather than restating it,
   so the two can never drift apart. */
create policy funding_businesses_all on public.funding_businesses for all to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))))
  with check (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))));

create policy funding_files_all on public.funding_files for all to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))))
  with check (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))));

create policy funding_deals_all on public.funding_deals for all to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))))
  with check (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))));

create policy funding_dept_all on public.funding_department_statuses for all to authenticated
  using (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))))
  with check (exists (select 1 from public.funding_clients c
                  where c.id = client_id
                    and (public.is_agency_staff() or public.is_org_member(c.organization_id))));

-- =============================================================================
-- Audit — the same treatment CreditOps status changes got (rule 10)
-- =============================================================================
create or replace function public.log_funding_client_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
begin
  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  v_org := new.organization_id;

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, new_value)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Client added', new.name, new.status::text);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Status changed', old.status::text || ' → ' || new.status::text,
            'status', old.status::text, new.status::text);
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = old.assigned_agent_id), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = new.assigned_agent_id), 'Unassigned'),
            'assigned_agent_id',
            old.assigned_agent_id::text, new.assigned_agent_id::text);
  end if;

  -- Contact changes are recorded WITHOUT the values, so the append-only
  -- timeline does not become a second copy of personal data (rule 1).
  if new.email is distinct from old.email then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Email address changed', 'email');
  end if;

  if new.phone is distinct from old.phone then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field)
    values (v_org, 'funding_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Phone number changed', 'phone');
  end if;

  return new;
end $$;

create trigger funding_clients_activity_insert after insert on public.funding_clients
  for each row execute function public.log_funding_client_activity();
create trigger funding_clients_activity_update after update on public.funding_clients
  for each row execute function public.log_funding_client_activity();

/* A deal moving is the money event in this division; it is audited against the
   CLIENT so one timeline tells the whole story. */
create or replace function public.log_funding_deal_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org   uuid;
  v_prev  text;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    v_prev := old.status::text;
  end if;

  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  select organization_id into v_org
    from public.funding_clients where id = new.client_id;

  insert into public.activity_events
    (organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value)
  values (v_org, 'funding_client', new.client_id::text, auth.uid(), v_actor,
          'Deal status changed',
          new.lender || ': ' || coalesce(v_prev, '(new)') || ' → ' || new.status::text,
          'deal_status', v_prev, new.status::text);
  return new;
end $$;

create trigger funding_deals_activity
  after insert or update on public.funding_deals
  for each row execute function public.log_funding_deal_activity();

-- =============================================================================
-- Cross-division identity lookup (see the rule 2 note in the header)
--
-- SECURITY INVOKER: the caller's own RLS decides which records they may see, so
-- this cannot be used to probe clients outside their scope.
-- =============================================================================
create or replace function public.find_client_across_divisions(
  p_email citext,
  p_scope uuid
)
returns table (division text, client_id uuid, client_name text, status text)
language sql
stable
set search_path = public as $$
  select 'creditops', fc.id, fc.name, fc.status::text
    from public.fulfillment_clients fc
   where lower(fc.email::text) = lower(p_email::text)
     and (p_scope is null or fc.partner_scope_id = p_scope)
  union all
  select 'fundingops', f.id, f.name, f.status::text
    from public.funding_clients f
   where lower(f.email::text) = lower(p_email::text)
     and (p_scope is null or f.partner_scope_id = p_scope);
$$;

-- =============================================================================
-- Grants. A table and a function are each reachable by TWO independent grants —
-- Supabase's to `anon` and Postgres's default to PUBLIC. Revoking one leaves
-- the other open (migrations 0003/0004/0006), so both are withdrawn.
-- =============================================================================
revoke all on public.funding_clients from anon;
revoke all on public.funding_businesses from anon;
revoke all on public.funding_files from anon;
revoke all on public.funding_deals from anon;
revoke all on public.funding_department_statuses from anon;

revoke execute on function public.log_funding_client_activity() from public, anon;
revoke execute on function public.log_funding_deal_activity() from public, anon;
revoke all on function public.find_client_across_divisions(citext, uuid) from public, anon;
grant execute on function public.find_client_across_divisions(citext, uuid) to authenticated;
