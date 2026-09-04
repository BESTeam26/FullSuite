-- Self-serve sign-up: an organization is created automatically when a new
-- user CONFIRMS their email — never at sign-up — with its BES- ID, the signer as
-- org_admin, the selected plan's products enabled, and a 30-day trial unless the
-- business is already known to BES. See ARCHITECTURE_PROPOSAL_SIGNUP.md.
--
-- Plans, trial rules and known-business identities are DATA (rows), not code.

----------------------------------------------------------------------
-- 1. Plans — what a signer can pick; products come from the existing enum.
----------------------------------------------------------------------
create table public.plans (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label       text not null,
  products    public.product_key[] not null,
  trial_days  integer not null default 30 check (trial_days between 0 and 365),
  is_public   boolean not null default true,
  position    integer not null default 0
);
alter table public.plans enable row level security;
revoke all on public.plans from public;
grant select on public.plans to anon, authenticated;          -- the public form lists them
create policy plans_select on public.plans for select using (is_public);
-- Provisional bundles until Dee confirms names and prices (no prices are stored yet).
insert into public.plans (key, label, products, position) values
  ('creditops',  'CreditOps',                 array['creditOps']::public.product_key[], 0),
  ('fundingops', 'FundingOps',                array['fundingOps']::public.product_key[], 1),
  ('growth',     'CreditOps + FundingOps',    array['creditOps','fundingOps','workspaces']::public.product_key[], 2),
  ('full_suite', 'Full Suite',                array['creditOps','fundingOps','workspaces','diyCredit','crm']::public.product_key[], 3);

----------------------------------------------------------------------
-- 2. Trials and known-business identities.
----------------------------------------------------------------------
create type public.trial_status as enum ('active', 'converted', 'expired', 'blocked');

create table public.organization_trials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_key        text not null references public.plans(key),
  started_at      timestamptz not null default now(),
  ends_at         timestamptz not null,
  status          public.trial_status not null default 'active',
  blocked_reason  text,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger organization_trials_updated_at before update on public.organization_trials
  for each row execute function public.set_updated_at();
alter table public.organization_trials enable row level security;
revoke all on public.organization_trials from public, anon;
grant select on public.organization_trials to authenticated;
grant update (status, review_note) on public.organization_trials to authenticated;
create policy organization_trials_select on public.organization_trials for select to authenticated
  using (public.is_org_member(organization_id) or public.is_agency_staff());
-- Only BES managers release or block a trial; the organization only reads it.
create policy organization_trials_update on public.organization_trials for update to authenticated
  using (public.is_manager_of(public.org_agency(organization_id)))
  with check (public.is_manager_of(public.org_agency(organization_id)));

create type public.identity_kind as enum ('email', 'email_domain', 'phone', 'business_name', 'ein');

-- What a business is known by. Used ONLY to decide trial eligibility; never for authorization.
create table public.organization_identity (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            public.identity_kind not null,
  value           text not null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, kind, value),
  unique (kind, value)
);
alter table public.organization_identity enable row level security;
revoke all on public.organization_identity from public, anon, authenticated;   -- internal to the provisioning function
create policy organization_identity_select on public.organization_identity for select to authenticated
  using (public.is_agency_staff());
grant select on public.organization_identity to authenticated;

-- Public mail providers: a shared domain identifies nobody's business.
create table public.public_email_domains (domain text primary key);
insert into public.public_email_domains values ('gmail.com'),('googlemail.com'),('yahoo.com'),('outlook.com'),('hotmail.com'),('live.com'),('icloud.com'),('me.com'),('aol.com'),('proton.me'),('protonmail.com'),('msn.com'),('ymail.com');
alter table public.public_email_domains enable row level security;
revoke all on public.public_email_domains from public, anon, authenticated;

-- Disposable / throwaway providers refused at sign-up (data; extend as needed).
create table public.blocked_email_domains (domain text primary key, reason text not null default 'disposable');
insert into public.blocked_email_domains values ('mailinator.com','disposable'),('guerrillamail.com','disposable'),('10minutemail.com','disposable'),('tempmail.com','disposable'),('yopmail.com','disposable'),('trashmail.com','disposable'),('sharklasers.com','disposable'),('dispostable.com','disposable'),('getnada.com','disposable'),('temp-mail.org','disposable');
alter table public.blocked_email_domains enable row level security;
revoke all on public.blocked_email_domains from public, anon, authenticated;

----------------------------------------------------------------------
-- 3. Normalisation helpers (deterministic).
----------------------------------------------------------------------
create or replace function public.normalize_business_name(p text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(regexp_replace(lower(coalesce(p, '')),
           '\m(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|corporation|co|co\.|ltd|ltd\.|limited|llp|pllc|pc|the)\M', '', 'g'),
           '[^a-z0-9]+', '', 'g')), '')
$$;
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

----------------------------------------------------------------------
-- 4. Provisioning on email confirmation. Idempotent per user.
----------------------------------------------------------------------
create or replace function public.provision_self_serve_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business   text  := nullif(trim(v_meta ->> 'business_name'), '');
  v_plan       text  := coalesce(nullif(v_meta ->> 'plan', ''), 'creditops');
  v_phone      text  := public.normalize_phone(v_meta ->> 'phone');
  v_domain     text  := lower(split_part(new.email, '@', 2));
  v_name_norm  text  := public.normalize_business_name(v_business);
  v_agency     uuid;
  v_org        uuid;
  v_plan_row   public.plans%rowtype;
  v_reason     text;
  v_matches    text[] := '{}';
begin
  -- Only a genuine self-serve signer, exactly once, on confirmation.
  if v_business is null then return new; end if;                         -- not a self-serve sign-up
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then return new; end if;
  if exists (select 1 from public.org_memberships m where m.user_id = new.id) then return new; end if;
  if exists (select 1 from public.blocked_email_domains b where b.domain = v_domain) then
    raise exception 'Sign-ups from this email provider are not accepted' using errcode = '23514';
  end if;

  select * into v_plan_row from public.plans p where p.key = v_plan and p.is_public;
  if v_plan_row.key is null then
    raise exception 'Unknown plan' using errcode = '23514';
  end if;
  select id into v_agency from public.agencies order by created_at limit 1;   -- one agency (rule 16)

  -- Is this business already known? Exact identifiers block; a name match is reviewed.
  if exists (select 1 from public.organization_identity i where i.kind = 'email' and i.value = lower(new.email)) then v_matches := v_matches || 'email'; end if;
  if v_phone is not null and exists (select 1 from public.organization_identity i where i.kind = 'phone' and i.value = v_phone) then v_matches := v_matches || 'phone'; end if;
  if not exists (select 1 from public.public_email_domains d where d.domain = v_domain)
     and exists (select 1 from public.organization_identity i where i.kind = 'email_domain' and i.value = v_domain) then v_matches := v_matches || 'email_domain'; end if;
  if v_name_norm is not null and exists (select 1 from public.organization_identity i where i.kind = 'business_name' and i.value = v_name_norm) then v_matches := v_matches || 'business_name'; end if;

  insert into public.organizations (agency_id, name, code, principal_name, principal_email, status)
  values (v_agency, v_business, upper(left(regexp_replace(v_business, '[^A-Za-z0-9]', '', 'g'), 6)) || '-' || left(new.id::text, 4),
          coalesce(v_meta ->> 'full_name', new.email), new.email, 'Active')
  returning id into v_org;

  insert into public.org_memberships (organization_id, user_id, role) values (v_org, new.id, 'org_admin');

  insert into public.product_entitlements (organization_id, product, enabled)
  select v_org, p, true from unnest(v_plan_row.products) as p
  on conflict (organization_id, product) do update set enabled = true;

  -- Trial: blocked outright on an exact identifier match; reviewed on a name-only match.
  if array_length(v_matches, 1) is not null and (v_matches && array['email','phone','email_domain']) then
    v_reason := 'known_business:' || array_to_string(v_matches, ',');
    insert into public.organization_trials (organization_id, plan_key, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, now(), 'blocked', v_reason);
    update public.product_entitlements set enabled = false where organization_id = v_org;   -- no free access; paid activation may re-enable
  else
    insert into public.organization_trials (organization_id, plan_key, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, now() + make_interval(days => v_plan_row.trial_days), 'active',
            case when 'business_name' = any (v_matches) then 'name_match_review' end);
  end if;

  -- Record what this business is known by, for the next signer.
  insert into public.organization_identity (organization_id, kind, value)
  select v_org, k, v from (values
    ('email'::public.identity_kind, lower(new.email)),
    ('phone', v_phone),
    ('business_name', v_name_norm),
    ('email_domain', case when exists (select 1 from public.public_email_domains d where d.domain = v_domain) then null else v_domain end)
  ) as t(k, v) where v is not null
  on conflict do nothing;

  perform public.log_audit('organization.self_serve_provisioned', 'organization', v_org::text, v_org, null,
    jsonb_build_object('plan', v_plan_row.key, 'trial', case when v_reason is null then 'active' else 'blocked' end, 'matches', v_matches));
  return new;
end $$;
revoke execute on function public.provision_self_serve_organization() from public, anon, authenticated;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.provision_self_serve_organization();

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
