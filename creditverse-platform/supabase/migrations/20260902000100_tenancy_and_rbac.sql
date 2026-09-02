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
