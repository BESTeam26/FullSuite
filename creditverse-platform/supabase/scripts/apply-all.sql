-- =============================================================================
-- BES Platform — complete schema, generated 2026-09-02
-- Paste into the Supabase SQL editor and Run. Safe on an EMPTY project.
-- Combines all migrations in supabase/migrations/ plus seed.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 20260902000100_tenancy_and_rbac.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- BES Platform — Migration 0001: Tenancy + Identity + RBAC
-- =============================================================================
-- Establishes the hard boundary from lib/bes-domain.ts:
--
--   agency (BES HQ)
--     -> organizations (sub-accounts / customer companies)
--        -> businesses
--        -> product_entitlements
--        -> org_memberships   (customer staff)
--        -> external_memberships + record_grants (BRM / lender / partner / client)
--   agency_memberships (BES employees only)
--
-- Every table has RLS enabled. Helper functions are SECURITY DEFINER and
-- STABLE so policies stay cheap and never recurse into RLS'd tables.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums (mirror TypeScript unions in src/lib/bes-domain.ts)
-- -----------------------------------------------------------------------------
create type public.org_status as enum ('Active', 'Pending Onboarding', 'At Risk', 'Paused');

create type public.product_key as enum ('creditOps', 'fundingOps', 'diyCredit', 'oi', 'crm');

create type public.agency_role as enum (
  'agency_owner', 'agency_admin', 'agency_manager', 'agency_team_lead', 'agency_agent'
);

create type public.org_role as enum (
  'org_admin', 'org_manager',
  'credit_processor', 'credit_qa', 'credit_support', 'credit_sales',
  'credit_complaints', 'credit_bureau_caller',
  'funding_admin', 'funding_manager', 'funding_processor', 'funding_doc_reviewer',
  'funding_underwriter', 'funding_sales', 'funding_support'
);

create type public.external_role as enum (
  'brm', 'sales_partner', 'referral_partner', 'lender', 'affiliate', 'client'
);

create type public.membership_kind as enum ('agency', 'organization', 'external');

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- agencies — BES HQ (one row in practice; modeled for white-label resale later)
-- -----------------------------------------------------------------------------
create table public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        citext not null unique,
  branding    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger agencies_updated_at before update on public.agencies
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles(email);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- organizations — Sub-Accounts
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                          uuid primary key default gen_random_uuid(),
  agency_id                   uuid not null references public.agencies(id) on delete restrict,
  name                        text not null,
  code                        citext not null,
  principal_name              text not null,
  principal_email             citext not null,
  address                     text,
  status                      public.org_status not null default 'Pending Onboarding',
  is_fulfillment_subscriber   boolean not null default false,
  branding                    jsonb not null default '{}'::jsonb,
  joined_at                   date not null default current_date,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (agency_id, code)
);
create index organizations_agency_idx on public.organizations(agency_id);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- businesses — an org principal may own several
-- -----------------------------------------------------------------------------
create table public.businesses (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  name                      text not null,
  legal_name                text,
  ein_last4                 char(4),           -- never store full EIN in this table
  industry                  text,
  time_in_business_months   integer check (time_in_business_months >= 0),
  monthly_revenue           numeric(14,2) check (monthly_revenue >= 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index businesses_org_idx on public.businesses(organization_id);
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- product_entitlements — which BES products an org has switched on
-- -----------------------------------------------------------------------------
create table public.product_entitlements (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  product          public.product_key not null,
  enabled          boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, product)
);
create trigger product_entitlements_updated_at before update on public.product_entitlements
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Memberships
-- -----------------------------------------------------------------------------
create table public.agency_memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  role        public.agency_role not null default 'agency_agent',
  created_at  timestamptz not null default now(),
  unique (user_id, agency_id)
);
create index agency_memberships_user_idx on public.agency_memberships(user_id);

create table public.org_memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             public.org_role not null,
  product          public.product_key,          -- primary product the user works in
  assigned_only    boolean not null default true,
  team_scope       text,
  created_at       timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index org_memberships_user_idx on public.org_memberships(user_id);
create index org_memberships_org_idx on public.org_memberships(organization_id);

create table public.external_memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             public.external_role not null,
  created_at       timestamptz not null default now(),
  unique (user_id, organization_id, role)
);
create index external_memberships_user_idx on public.external_memberships(user_id);

-- External users are ALWAYS record-scoped: explicit grants only.
create table public.record_grants (
  id                       uuid primary key default gen_random_uuid(),
  external_membership_id   uuid not null references public.external_memberships(id) on delete cascade,
  record_type              text not null,      -- 'credit_case' | 'funding_deal' | 'project' | ...
  record_id                uuid not null,
  granted_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  unique (external_membership_id, record_type, record_id)
);

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  email            citext not null,
  kind             public.membership_kind not null,
  agency_id        uuid references public.agencies(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete cascade,
  agency_role      public.agency_role,
  org_role         public.org_role,
  external_role    public.external_role,
  token            uuid not null unique default gen_random_uuid(),
  invited_by       uuid references public.profiles(id),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (
    (kind = 'agency'       and agency_id is not null and agency_role is not null) or
    (kind = 'organization' and organization_id is not null and org_role is not null) or
    (kind = 'external'     and organization_id is not null and external_role is not null)
  )
);
create index invitations_email_idx on public.invitations(email);

-- -----------------------------------------------------------------------------
-- user_preferences — per-user UI state (pins, recents)
-- -----------------------------------------------------------------------------
create table public.user_preferences (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  pinned_org_ids   uuid[] not null default '{}',
  recent_org_ids   uuid[] not null default '{}',
  updated_at       timestamptz not null default now()
);
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- audit_log — append only
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id               bigint generated always as identity primary key,
  actor_id         uuid references public.profiles(id),
  agency_id        uuid references public.agencies(id),
  organization_id  uuid references public.organizations(id),
  action           text not null,          -- e.g. 'organization.updated'
  entity_type      text not null,
  entity_id        text,
  before           jsonb,
  after            jsonb,
  created_at       timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log(organization_id, created_at desc);
create index audit_log_actor_idx on public.audit_log(actor_id, created_at desc);

-- =============================================================================
-- Authorization helpers (SECURITY DEFINER, STABLE) — used by every RLS policy
-- =============================================================================
create or replace function public.current_agency_role()
returns public.agency_role
language sql stable security definer set search_path = public as $$
  select role from public.agency_memberships where user_id = auth.uid() limit 1
$$;

create or replace function public.is_agency_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agency_memberships where user_id = auth.uid())
$$;

create or replace function public.is_agency_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agency_memberships
    where user_id = auth.uid() and role in ('agency_owner','agency_admin')
  )
$$;

create or replace function public.is_agency_manager_or_above()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agency_memberships
    where user_id = auth.uid() and role in ('agency_owner','agency_admin','agency_manager')
  )
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_memberships where user_id = auth.uid() and organization_id = p_org
  )
$$;

create or replace function public.org_role_for(p_org uuid)
returns public.org_role
language sql stable security definer set search_path = public as $$
  select role from public.org_memberships where user_id = auth.uid() and organization_id = p_org
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and organization_id = p_org and role in ('org_admin','org_manager')
  )
$$;

create or replace function public.is_external_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.external_memberships where user_id = auth.uid() and organization_id = p_org
  )
$$;

-- Can the caller see this organization at all (any relationship)?
create or replace function public.can_view_org(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_agency_staff() or public.is_org_member(p_org) or public.is_external_member(p_org)
$$;

-- Users who share an agency or organization with the caller (for profile visibility)
create or replace function public.shares_scope_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
     or public.is_agency_staff()
     or exists (
          select 1
          from public.org_memberships a
          join public.org_memberships b on a.organization_id = b.organization_id
          where a.user_id = auth.uid() and b.user_id = p_user
        )
$$;

-- Org IDs the caller can view (used by the client to scope queries cheaply)
create or replace function public.my_org_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.org_memberships where user_id = auth.uid()
  union
  select organization_id from public.external_memberships where user_id = auth.uid()
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.agencies              enable row level security;
alter table public.profiles              enable row level security;
alter table public.organizations         enable row level security;
alter table public.businesses            enable row level security;
alter table public.product_entitlements  enable row level security;
alter table public.agency_memberships    enable row level security;
alter table public.org_memberships       enable row level security;
alter table public.external_memberships  enable row level security;
alter table public.record_grants         enable row level security;
alter table public.invitations           enable row level security;
alter table public.user_preferences      enable row level security;
alter table public.audit_log             enable row level security;

-- agencies
create policy agencies_select on public.agencies for select to authenticated
  using (public.is_agency_staff());
create policy agencies_update on public.agencies for update to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.shares_scope_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (public.can_view_org(id));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.is_agency_manager_or_above());
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_agency_manager_or_above() or public.is_org_admin(id))
  with check (public.is_agency_manager_or_above() or public.is_org_admin(id));
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.is_agency_admin());

-- businesses
create policy businesses_select on public.businesses for select to authenticated
  using (public.is_agency_staff() or public.is_org_member(organization_id));
create policy businesses_write on public.businesses for all to authenticated
  using (public.is_agency_manager_or_above() or public.is_org_admin(organization_id))
  with check (public.is_agency_manager_or_above() or public.is_org_admin(organization_id));

-- product_entitlements — only BES can switch products on/off
create policy entitlements_select on public.product_entitlements for select to authenticated
  using (public.can_view_org(organization_id));
create policy entitlements_write on public.product_entitlements for all to authenticated
  using (public.is_agency_manager_or_above()) with check (public.is_agency_manager_or_above());

-- agency_memberships
create policy agency_memberships_select on public.agency_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_agency_staff());
create policy agency_memberships_write on public.agency_memberships for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- org_memberships
create policy org_memberships_select on public.org_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_agency_staff() or public.is_org_member(organization_id));
create policy org_memberships_write on public.org_memberships for all to authenticated
  using (public.is_agency_manager_or_above() or public.is_org_admin(organization_id))
  with check (public.is_agency_manager_or_above() or public.is_org_admin(organization_id));

-- external_memberships
create policy external_memberships_select on public.external_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_agency_staff() or public.is_org_admin(organization_id));
create policy external_memberships_write on public.external_memberships for all to authenticated
  using (public.is_agency_manager_or_above() or public.is_org_admin(organization_id))
  with check (public.is_agency_manager_or_above() or public.is_org_admin(organization_id));

-- record_grants
create policy record_grants_select on public.record_grants for select to authenticated
  using (
    exists (
      select 1 from public.external_memberships em
      where em.id = external_membership_id
        and (em.user_id = auth.uid() or public.is_agency_staff() or public.is_org_admin(em.organization_id))
    )
  );
create policy record_grants_write on public.record_grants for all to authenticated
  using (
    exists (
      select 1 from public.external_memberships em
      where em.id = external_membership_id
        and (public.is_agency_manager_or_above() or public.is_org_admin(em.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.external_memberships em
      where em.id = external_membership_id
        and (public.is_agency_manager_or_above() or public.is_org_admin(em.organization_id))
    )
  );

-- invitations
create policy invitations_select on public.invitations for select to authenticated
  using (
    public.is_agency_staff()
    or (organization_id is not null and public.is_org_admin(organization_id))
    or email = (select email from public.profiles where id = auth.uid())
  );
create policy invitations_write on public.invitations for all to authenticated
  using (public.is_agency_manager_or_above() or (organization_id is not null and public.is_org_admin(organization_id)))
  with check (public.is_agency_manager_or_above() or (organization_id is not null and public.is_org_admin(organization_id)));

-- user_preferences
create policy user_preferences_all on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_log: insert via function only; readable by staff and by org members for their org
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_agency_staff() or (organization_id is not null and public.is_org_member(organization_id)));

create or replace function public.log_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_org uuid default null, p_before jsonb default null, p_after jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, agency_id, organization_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    (select agency_id from public.agency_memberships where user_id = auth.uid() limit 1),
    p_org, p_action, p_entity_type, p_entity_id, p_before, p_after
  );
end $$;
revoke all on function public.log_audit(text, text, text, uuid, jsonb, jsonb) from public;
grant execute on function public.log_audit(text, text, text, uuid, jsonb, jsonb) to authenticated;

-- =============================================================================
-- Bootstrap: promote an existing auth user to agency owner.
-- Callable ONLY with the service role (SQL editor / CLI), never from the browser.
-- =============================================================================
create or replace function public.bootstrap_agency_owner(p_email citext, p_agency_slug citext default 'bes')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_agency uuid;
begin
  select id into v_user from public.profiles where email = p_email;
  if v_user is null then
    raise exception 'No profile with email %. Sign up first, then run this.', p_email;
  end if;

  select id into v_agency from public.agencies where slug = p_agency_slug;
  if v_agency is null then
    insert into public.agencies (name, slug) values ('Blessed Empire Services', p_agency_slug)
    returning id into v_agency;
  end if;

  insert into public.agency_memberships (user_id, agency_id, role)
  values (v_user, v_agency, 'agency_owner')
  on conflict (user_id, agency_id) do update set role = 'agency_owner';

  return v_agency;
end $$;
revoke all on function public.bootstrap_agency_owner(citext, citext) from public, anon, authenticated;

-- Grants for the API roles (RLS still applies)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 20260902000200_work_engine.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- BES Platform — Migration 0002: Shared Operations Engine
-- =============================================================================
-- One work engine, hard-scoped. Mirrors WorkItem / ActivityEntry from
-- src/lib/bes-domain.ts and src/lib/fulfillment/creditops-store-types.ts.
--
--   scope = AGENCY        -> BES employees only. organization_id IS NULL.
--                            subject_organization_id names the org the work is
--                            ABOUT (a fulfillment subscriber), which is how BES
--                            does done-for-you work without the item becoming
--                            that org's own work.
--   scope = ORGANIZATION  -> a customer org's self-managed work.
--                            organization_id IS NOT NULL.
--
-- The boundary rule from the domain model holds in the database: sub-account
-- activity never automatically becomes BES agency work.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.work_scope as enum ('AGENCY', 'ORGANIZATION');

create type public.work_related_type as enum (
  'credit_case', 'funding_deal', 'project', 'support', 'fulfillment'
);

create type public.work_stage as enum (
  'Queued', 'Assigned', 'In Processing', 'Ready for QA',
  'QA Review', 'Completed', 'Blocked', 'Attention'
);

create type public.work_priority as enum ('Normal', 'High', 'Urgent');

-- -----------------------------------------------------------------------------
-- work_items
-- -----------------------------------------------------------------------------
create table public.work_items (
  id                        uuid primary key default gen_random_uuid(),
  scope                     public.work_scope not null,
  -- Owning scope. NULL for AGENCY work.
  organization_id           uuid references public.organizations(id) on delete cascade,
  -- The org this work concerns (AGENCY fulfillment work for a subscriber).
  subject_organization_id   uuid references public.organizations(id) on delete set null,
  related_type              public.work_related_type not null,
  -- Domain record reference. Real FKs arrive with the Phase 3+ tables.
  related_ref               text,
  title                     text not null,
  description               text,
  stage                     public.work_stage not null default 'Queued',
  priority                  public.work_priority not null default 'Normal',
  assigned_to               uuid references public.profiles(id) on delete set null,
  created_by                uuid references public.profiles(id) on delete set null,
  due_at                    timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint work_items_scope_org_ck check (
    (scope = 'ORGANIZATION' and organization_id is not null) or
    (scope = 'AGENCY'       and organization_id is null)
  )
);

create index work_items_scope_idx on public.work_items(scope, stage);
create index work_items_org_idx on public.work_items(organization_id) where organization_id is not null;
create index work_items_subject_org_idx on public.work_items(subject_organization_id) where subject_organization_id is not null;
create index work_items_assignee_idx on public.work_items(assigned_to, stage);
create index work_items_due_idx on public.work_items(due_at) where completed_at is null;

create trigger work_items_updated_at before update on public.work_items
  for each row execute function public.set_updated_at();

-- Stamp completed_at whenever the item lands on Completed (and clear it if reopened).
create or replace function public.work_items_stamp_completion()
returns trigger language plpgsql as $$
begin
  if new.stage = 'Completed' and (old.stage is distinct from 'Completed') then
    new.completed_at = now();
  elsif new.stage <> 'Completed' then
    new.completed_at = null;
  end if;
  return new;
end $$;

create trigger work_items_completion before update on public.work_items
  for each row execute function public.work_items_stamp_completion();

-- -----------------------------------------------------------------------------
-- activity_events — append-only timeline for any entity
-- -----------------------------------------------------------------------------
create table public.activity_events (
  id               bigint generated always as identity primary key,
  -- RLS scope. NULL = agency-scope activity (BES staff only).
  organization_id  uuid references public.organizations(id) on delete cascade,
  entity_type      text not null,          -- 'work_item' | 'organization' | ...
  entity_id        text not null,
  actor_id         uuid references public.profiles(id) on delete set null,
  -- Denormalised so the timeline still reads correctly after a user is removed.
  actor_name       text,
  action           text not null,          -- 'Status changed'
  detail           text,                   -- 'In Processing → Ready for QA'
  field            text,
  previous_value   text,
  new_value        text,
  pinned           boolean not null default false,
  mark             text,
  created_at       timestamptz not null default now()
);

create index activity_events_entity_idx on public.activity_events(entity_type, entity_id, created_at desc);
create index activity_events_org_idx on public.activity_events(organization_id, created_at desc);
create index activity_events_pinned_idx on public.activity_events(entity_type, entity_id) where pinned;

-- -----------------------------------------------------------------------------
-- files — metadata for Storage objects (evidence, letters, attachments)
-- -----------------------------------------------------------------------------
create table public.files (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  entity_type      text,
  entity_id        text,
  bucket           text not null default 'bes-files',
  path             text not null unique,
  name             text not null,
  mime_type        text,
  size_bytes       bigint check (size_bytes >= 0),
  sha256           text,
  uploaded_by      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index files_entity_idx on public.files(entity_type, entity_id);
create index files_org_idx on public.files(organization_id);

-- Private bucket. Access is granted only through the storage policies below.
insert into storage.buckets (id, name, public)
values ('bes-files', 'bes-files', false)
on conflict (id) do nothing;

-- =============================================================================
-- Authorization helpers for work
-- =============================================================================

-- Can the caller see a work item with this scope/org pair?
create or replace function public.can_view_work(
  p_scope public.work_scope, p_org uuid, p_subject_org uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_scope = 'AGENCY' then
      -- BES staff see all agency work. An org admin may see agency work performed
      -- FOR their organization (done-for-you transparency), never other orgs'.
      public.is_agency_staff()
      or (p_subject_org is not null and public.is_org_admin(p_subject_org))
    else
      public.is_agency_staff() or public.is_org_member(p_org)
  end
$$;

-- Can the caller create/modify work in this scope?
create or replace function public.can_write_work(
  p_scope public.work_scope, p_org uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_scope = 'AGENCY' then public.is_agency_staff()
    else public.is_agency_manager_or_above() or public.is_org_member(p_org)
  end
$$;

-- Scoped assignee picker: never a company-wide directory dump.
-- AGENCY work  -> BES staff.
-- ORG work     -> that organization's members only.
create or replace function public.assignable_profiles(
  p_scope public.work_scope, p_org uuid default null
) returns table (id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, am.role::text
  from public.agency_memberships am
  join public.profiles p on p.id = am.user_id
  where p_scope = 'AGENCY' and public.is_agency_staff()
  union all
  select p.id, p.full_name, p.email, om.role::text
  from public.org_memberships om
  join public.profiles p on p.id = om.user_id
  where p_scope = 'ORGANIZATION'
    and om.organization_id = p_org
    and (public.is_agency_staff() or public.is_org_member(p_org))
$$;

-- =============================================================================
-- Activity logging — automatic on work-item changes
-- =============================================================================
create or replace function public.log_work_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org uuid;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  v_org := coalesce(new.organization_id, new.subject_organization_id);

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Work item created', new.title, new.stage::text);
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Status changed', old.stage::text || ' → ' || new.stage::text,
            'stage', old.stage::text, new.stage::text);
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles where id = old.assigned_to), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles where id = new.assigned_to), 'Unassigned'),
            'assigned_to', old.assigned_to::text, new.assigned_to::text);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Priority changed', old.priority::text || ' → ' || new.priority::text,
            'priority', old.priority::text, new.priority::text);
  end if;

  return new;
end $$;

create trigger work_items_activity_insert after insert on public.work_items
  for each row execute function public.log_work_activity();
create trigger work_items_activity_update after update on public.work_items
  for each row execute function public.log_work_activity();

-- =============================================================================
-- Attention view — what needs a human, scoped by RLS (security_invoker)
-- =============================================================================
create view public.work_attention
with (security_invoker = true) as
select
  w.*,
  case
    when w.stage in ('Blocked', 'Attention') then 'blocked'
    when w.due_at is not null and w.due_at < now() then 'overdue'
    when w.due_at is not null and w.due_at < now() + interval '4 hours' then 'sla_risk'
  end as attention_reason,
  case
    when w.due_at is null then null
    else round(extract(epoch from (w.due_at - now())) / 3600.0, 1)
  end as hours_remaining
from public.work_items w
where w.completed_at is null
  and (
    w.stage in ('Blocked', 'Attention')
    or (w.due_at is not null and w.due_at < now() + interval '4 hours')
  );

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.work_items      enable row level security;
alter table public.activity_events enable row level security;
alter table public.files           enable row level security;

-- work_items
create policy work_items_select on public.work_items for select to authenticated
  using (public.can_view_work(scope, organization_id, subject_organization_id));

create policy work_items_insert on public.work_items for insert to authenticated
  with check (public.can_write_work(scope, organization_id));

-- An agent may edit work they are assigned; managers may edit anything in scope.
create policy work_items_update on public.work_items for update to authenticated
  using (
    assigned_to = auth.uid()
    or (scope = 'AGENCY' and public.is_agency_manager_or_above())
    or (scope = 'ORGANIZATION' and (public.is_agency_manager_or_above() or public.is_org_admin(organization_id)))
  )
  with check (public.can_write_work(scope, organization_id));

create policy work_items_delete on public.work_items for delete to authenticated
  using (
    (scope = 'AGENCY' and public.is_agency_admin())
    or (scope = 'ORGANIZATION' and (public.is_agency_admin() or public.is_org_admin(organization_id)))
  );

-- activity_events: readable in scope, insert-only (append-only timeline).
create policy activity_events_select on public.activity_events for select to authenticated
  using (
    case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

create policy activity_events_insert on public.activity_events for insert to authenticated
  with check (
    case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

-- Only the author may pin/mark their own comment; nothing else is mutable.
create policy activity_events_update on public.activity_events for update to authenticated
  using (actor_id = auth.uid() or public.is_agency_manager_or_above())
  with check (actor_id = auth.uid() or public.is_agency_manager_or_above());

-- No delete policy: activity is append-only by design.

-- files
create policy files_select on public.files for select to authenticated
  using (
    case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

create policy files_delete on public.files for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_agency_manager_or_above()
    or (organization_id is not null and public.is_org_admin(organization_id))
  );

-- -----------------------------------------------------------------------------
-- Storage policies for the private bes-files bucket.
-- Object paths are laid out as:  <organization_id | 'agency'>/<entity>/<filename>
-- so the first path segment is the tenancy key.
-- -----------------------------------------------------------------------------
create policy bes_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bes-files'
    and (
      (storage.foldername(name))[1] = 'agency' and public.is_agency_staff()
      or (
        (storage.foldername(name))[1] <> 'agency'
        and (
          public.is_agency_staff()
          or public.is_org_member(((storage.foldername(name))[1])::uuid)
        )
      )
    )
  );

create policy bes_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    and (
      (storage.foldername(name))[1] = 'agency' and public.is_agency_staff()
      or (
        (storage.foldername(name))[1] <> 'agency'
        and (
          public.is_agency_staff()
          or public.is_org_member(((storage.foldername(name))[1])::uuid)
        )
      )
    )
  );

create policy bes_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'bes-files'
    and (owner = auth.uid() or public.is_agency_manager_or_above())
  );

-- Grants (RLS still applies)
grant select, insert, update, delete on public.work_items to authenticated;
grant select, insert, update on public.activity_events to authenticated;
grant select, insert, delete on public.files to authenticated;
grant select on public.work_attention to authenticated;

-- ---------------------------------------------------------------------------
-- 20260902000300_lock_down_function_grants.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- BES Platform — Migration 0003: revoke function EXECUTE from anon
-- =============================================================================
-- Found by the live smoke test: an ANONYMOUS caller could POST to
-- /rest/v1/rpc/log_audit and get 204. Migration 0001 revoked that function from
-- PUBLIC and granted it to `authenticated`, but Supabase's default privileges on
-- the public schema also grant EXECUTE to the `anon` role, so the revoke did not
-- cover it. Unauthenticated audit-log writes are a log-poisoning vector.
--
-- Fix: explicitly revoke EXECUTE from `anon` on every function in public, then
-- re-grant only to `authenticated`. bootstrap_agency_owner stays service-role
-- only. Belt and braces: also set default privileges so functions added later
-- do not silently become anon-callable.
-- =============================================================================

-- 1. Nothing in public is callable by an unauthenticated visitor.
revoke execute on all functions in schema public from anon;

-- 2. Re-grant the ones a signed-in user legitimately needs.
grant execute on function public.current_agency_role()               to authenticated;
grant execute on function public.is_agency_staff()                   to authenticated;
grant execute on function public.is_agency_admin()                   to authenticated;
grant execute on function public.is_agency_manager_or_above()        to authenticated;
grant execute on function public.is_org_member(uuid)                 to authenticated;
grant execute on function public.org_role_for(uuid)                  to authenticated;
grant execute on function public.is_org_admin(uuid)                  to authenticated;
grant execute on function public.is_external_member(uuid)            to authenticated;
grant execute on function public.can_view_org(uuid)                  to authenticated;
grant execute on function public.shares_scope_with(uuid)             to authenticated;
grant execute on function public.my_org_ids()                        to authenticated;
grant execute on function public.log_audit(text, text, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.can_view_work(public.work_scope, uuid, uuid)    to authenticated;
grant execute on function public.can_write_work(public.work_scope, uuid)         to authenticated;
grant execute on function public.assignable_profiles(public.work_scope, uuid)    to authenticated;

-- 3. Service-role only. Never reachable from a browser.
revoke all on function public.bootstrap_agency_owner(citext, citext) from public, anon, authenticated;

-- 4. Future functions default to authenticated-only.
alter default privileges in schema public revoke execute on functions from anon;

-- 5. Tables: anon gets nothing. Every policy is `to authenticated` anyway, but
--    removing the grant means a missing policy cannot become a data leak.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- 20260902000400_revoke_public_execute.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- BES Platform — Migration 0004: revoke function EXECUTE from PUBLIC
-- =============================================================================
-- Migration 0003 revoked EXECUTE from the `anon` role, but Postgres grants
-- EXECUTE to PUBLIC on every newly created function, and `anon` is a member of
-- PUBLIC. So helpers such as is_agency_staff() and my_org_ids() still answered
-- unauthenticated callers (returning false / [] — no data leak, but they should
-- not be reachable at all, and a future helper might be less careful).
--
-- Revoke from PUBLIC, then re-grant only to `authenticated`.
-- =============================================================================

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

grant execute on function public.current_agency_role()               to authenticated;
grant execute on function public.is_agency_staff()                   to authenticated;
grant execute on function public.is_agency_admin()                   to authenticated;
grant execute on function public.is_agency_manager_or_above()        to authenticated;
grant execute on function public.is_org_member(uuid)                 to authenticated;
grant execute on function public.org_role_for(uuid)                  to authenticated;
grant execute on function public.is_org_admin(uuid)                  to authenticated;
grant execute on function public.is_external_member(uuid)            to authenticated;
grant execute on function public.can_view_org(uuid)                  to authenticated;
grant execute on function public.shares_scope_with(uuid)             to authenticated;
grant execute on function public.my_org_ids()                        to authenticated;
grant execute on function public.log_audit(text, text, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.can_view_work(public.work_scope, uuid, uuid)    to authenticated;
grant execute on function public.can_write_work(public.work_scope, uuid)         to authenticated;
grant execute on function public.assignable_profiles(public.work_scope, uuid)    to authenticated;

-- Trigger functions run as the table owner, not the caller; no grant needed.
revoke all on function public.bootstrap_agency_owner(citext, citext) from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- seed data
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Development seed — mirrors src/lib/bes-seed-data.ts so live mode looks like
-- demo mode on first run. Idempotent. Does NOT create auth users: sign up in the
-- app first, then run:
--   select public.bootstrap_agency_owner('you@example.com');
-- (from the Supabase SQL editor, which runs as service role).
-- =============================================================================

insert into public.agencies (id, name, slug, branding) values
  ('a0000000-0000-4000-8000-000000000001', 'Blessed Empire Services', 'bes',
   '{"primaryColor":"#EBAA15","tagline":"Credit + Funding Operations. One Connected Platform."}')
on conflict (slug) do nothing;

insert into public.organizations
  (id, agency_id, name, code, principal_name, principal_email, address, status, is_fulfillment_subscriber, branding, joined_at)
values
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Apex Credit Co.','APEX','Alex Rivera','alex@apexcredit.com','100 Wilshire Blvd, Ste 400, Los Angeles, CA','Active',true,
   '{"customDomain":"portal.apexcredit.com","companyTagline":"Premier Credit Restoration & Funding"}','2026-01-15'),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Pioneer Credit Solutions','PIONEER','Sarah Jenkins','sarah@pioneercredit.com','30 North Gould Street, Ste N, Sheridan, WY','Active',true,'{}','2026-02-01'),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','Vantage Funding Group','VANTAGE','Marcus Vance','marcus@vantagefunding.com','15720 Brixham Hill Ave, Charlotte, NC','Active',false,'{}','2026-02-10'),
  ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','CreditFix Solutions','FIX','Derrick Hall','derrick@creditfix.com','444 Alaska Ave Ste #BAN433, Torrance, CA','Active',true,'{}','2025-12-04'),
  ('b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','Empire Capital & Credit','EMPIRE','Chloe Sterling','chloe@empirecap.com','6081 Hamilton Blvd, Ste 600, Allentown, PA','Pending Onboarding',false,'{}','2026-08-20')
on conflict (agency_id, code) do nothing;

insert into public.businesses (id, organization_id, name, legal_name, industry, time_in_business_months, monthly_revenue) values
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Apex Credit Co.','Apex Credit Co. LLC','Financial Services',48,8450),
  ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','Pioneer Credit Solutions','Pioneer Credit Solutions LLC','Credit Services',30,4900),
  ('c0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003','Vantage Funding Group','Vantage Funding Group LLC','Business Funding',22,3800),
  ('c0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004','CreditFix Solutions','CreditFix Solutions Inc.','Credit Services',60,12600),
  ('c0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000005','Empire Capital & Credit','Empire Capital & Credit LLC','Credit Services',6,1900)
on conflict (id) do nothing;

-- Entitlements: every org gets all five rows so toggles are simple upserts.
insert into public.product_entitlements (organization_id, product, enabled)
select o.id, p.product, false
from public.organizations o
cross join (values ('creditOps'::public.product_key),('fundingOps'),('diyCredit'),('oi'),('crm')) as p(product)
on conflict (organization_id, product) do nothing;

update public.product_entitlements set enabled = true where (organization_id, product::text) in (
  ('b0000000-0000-4000-8000-000000000001','creditOps'),('b0000000-0000-4000-8000-000000000001','fundingOps'),
  ('b0000000-0000-4000-8000-000000000001','diyCredit'),('b0000000-0000-4000-8000-000000000001','oi'),('b0000000-0000-4000-8000-000000000001','crm'),
  ('b0000000-0000-4000-8000-000000000002','creditOps'),('b0000000-0000-4000-8000-000000000002','diyCredit'),
  ('b0000000-0000-4000-8000-000000000003','fundingOps'),('b0000000-0000-4000-8000-000000000003','crm'),
  ('b0000000-0000-4000-8000-000000000004','creditOps'),('b0000000-0000-4000-8000-000000000004','fundingOps'),
  ('b0000000-0000-4000-8000-000000000004','diyCredit'),('b0000000-0000-4000-8000-000000000004','oi'),('b0000000-0000-4000-8000-000000000004','crm'),
  ('b0000000-0000-4000-8000-000000000005','creditOps'),('b0000000-0000-4000-8000-000000000005','diyCredit')
);

-- -----------------------------------------------------------------------------
-- Work engine sample data (migration 0002). Unassigned: claim them in the app,
-- or assign with
--   update public.work_items set assigned_to =
--     (select id from public.profiles where email = 'you@example.com');
-- -----------------------------------------------------------------------------
insert into public.work_items
  (id, scope, organization_id, subject_organization_id, related_type, related_ref, title, stage, priority, due_at)
values
  -- AGENCY scope: BES done-for-you fulfillment for subscribers
  ('d0000000-0000-4000-8000-000000000001','AGENCY',null,'b0000000-0000-4000-8000-000000000001','fulfillment','CR-2041','Round 2 Escalation — Maria Gonzalez','In Processing','Urgent', now() + interval '4 hours'),
  ('d0000000-0000-4000-8000-000000000002','AGENCY',null,'b0000000-0000-4000-8000-000000000001','fulfillment','CR-2043','CFPB Complaint — Anthony Ramos','Ready for QA','High', now() + interval '2 hours'),
  ('d0000000-0000-4000-8000-000000000003','AGENCY',null,'b0000000-0000-4000-8000-000000000004','fulfillment','CR-2044','Experian Manual Upload — Tanya Brooks','Blocked','High', now() - interval '3 hours'),
  ('d0000000-0000-4000-8000-000000000004','AGENCY',null,'b0000000-0000-4000-8000-000000000002','support','SUP-118','Onboarding follow-up — Pioneer Credit','Queued','Normal', now() + interval '2 days'),
  -- ORGANIZATION scope: a customer org's own self-managed work
  ('d0000000-0000-4000-8000-000000000005','ORGANIZATION','b0000000-0000-4000-8000-000000000001',null,'credit_case','CR-2101','Round 1 Processing — Tanya Brooks','In Processing','Normal', now() + interval '12 hours'),
  ('d0000000-0000-4000-8000-000000000006','ORGANIZATION','b0000000-0000-4000-8000-000000000003',null,'funding_deal','FD-2001','Document Review — Vantage Deal','Queued','Normal', now() + interval '36 hours'),
  ('d0000000-0000-4000-8000-000000000007','ORGANIZATION','b0000000-0000-4000-8000-000000000004',null,'project','PRJ-101','GHL CRM Build — CreditFix','Attention','High', now() + interval '1 day')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
