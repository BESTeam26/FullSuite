-- =============================================================================
-- Pricing as data (Dee's final commercial structure, 2026-09-04)
--
--   BES CRM $99 · Empire Build $149 (choose CreditOps OR FundingOps) ·
--   Empire Grow $249 ★ recommended · Empire Scale $399 (Full Suite + CRM) ·
--   Empire Enterprise $599+ (trial by agreement). Annual = 10 × monthly.
--   Add-ons: CRM +$75 (Build/Grow), +10 seats $50, +1,000 records $75 (Enterprise).
--
-- Rules encoded here, not in prose:
--   * Every eligible trial grants Empire GROW capabilities for 30 days
--     (CreditOps + FundingOps + Workspaces) whatever plan was picked; the pick
--     is kept for conversion. CRM/GHL is never provisioned on a trial.
--   * Seats: the Organization Owner is free; BES personnel, client-portal
--     users and GHL-only users never count; only active organization users do.
--   * Active records: clients/files currently being worked. History,
--     archived, completed, documents, activity, production never count.
--   * Software entitlement ≠ third-party consumption (SMS, email, AI, mail,
--     bureau data): none of that is included in any plan (see AI credits
--     proposal). Nothing here bills anyone: it defines and measures.
-- =============================================================================

alter table public.plans
  add column if not exists monthly_cents            integer not null default 0 check (monthly_cents >= 0),
  add column if not exists annual_cents             integer check (annual_cents is null or annual_cents >= 0),
  add column if not exists seats_included           integer not null default 0 check (seats_included >= 0),   -- additional users; the owner is free
  add column if not exists active_records_included  integer not null default 0 check (active_records_included >= 0),
  add column if not exists choose_one               boolean not null default false,   -- Build: pick CreditOps OR FundingOps
  add column if not exists includes_crm             boolean not null default false,
  add column if not exists is_recommended           boolean not null default false,
  add column if not exists public_trial             boolean not null default true,    -- Enterprise: by agreement
  add column if not exists trial_grant_plan         text references public.plans(key), -- capabilities a trial actually receives
  add column if not exists tagline                  text;

-- Retire the interim keys (kept for FK integrity of existing trials).
update public.plans set is_public = false where key in ('creditops', 'fundingops', 'growth', 'full_suite');

insert into public.plans (key, label, products, trial_days, is_public, position, monthly_cents, annual_cents, seats_included, active_records_included, choose_one, includes_crm, is_recommended, public_trial, tagline)
values
  ('bes_crm',           'BES CRM',            array['crm']::public.product_key[],                                            30, true, 0,  9900, 99000,  0,    0, false, true,  false, true,  'Standalone CRM powered by HighLevel. Unlimited GHL contacts and users; usage-based services billed separately.'),
  ('empire_build',      'Empire Build',       array['creditOps','fundingOps','workspaces']::public.product_key[],            30, true, 1, 14900, 149000, 5,  250, true,  false, false, true,  'One vertical — CreditOps or FundingOps — with the full operating engine.'),
  ('empire_grow',       'Empire Grow',        array['creditOps','fundingOps','workspaces']::public.product_key[],            30, true, 2, 24900, 249000, 10, 750, false, false, true,  true,  'Full Suite begins: CreditOps + FundingOps, connected client journey, custom workspaces.'),
  ('empire_scale',      'Empire Scale',       array['creditOps','fundingOps','workspaces','crm']::public.product_key[],      30, true, 3, 39900, 399000, 25, 2500, false, true, false, true,  'Full Suite + CRM, advanced reporting, organization controls.'),
  ('empire_enterprise', 'Empire Enterprise',  array['creditOps','fundingOps','workspaces','crm']::public.product_key[],      30, true, 4, 59900, null,   50, 5000, false, true, false, false, 'Enterprise capacity and terms on the same platform; trial by agreement.')
on conflict (key) do update set
  label = excluded.label, products = excluded.products, trial_days = excluded.trial_days, is_public = excluded.is_public,
  position = excluded.position, monthly_cents = excluded.monthly_cents, annual_cents = excluded.annual_cents,
  seats_included = excluded.seats_included, active_records_included = excluded.active_records_included,
  choose_one = excluded.choose_one, includes_crm = excluded.includes_crm, is_recommended = excluded.is_recommended,
  public_trial = excluded.public_trial, tagline = excluded.tagline;

-- Every public trial grants Empire Grow capabilities.
update public.plans set trial_grant_plan = 'empire_grow' where key in ('bes_crm', 'empire_build', 'empire_grow', 'empire_scale', 'empire_enterprise');

create table public.plan_addons (
  key            text primary key check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label          text not null,
  monthly_cents  integer not null check (monthly_cents >= 0),
  unit           text not null,                       -- what one purchase adds
  applies_to     text[] not null,                     -- plan keys it may be added to
  position       integer not null default 0
);
insert into public.plan_addons (key, label, monthly_cents, unit, applies_to, position) values
  ('crm_addon',    'BES CRM add-on',                 7500, 'crm',              array['empire_build','empire_grow'], 0),
  ('seats_10',     '+10 BES Platform seats',         5000, '10 seats',         array['empire_build','empire_grow','empire_scale','empire_enterprise'], 1),
  ('records_1000', '+1,000 active operational records', 7500, '1000 records', array['empire_enterprise'], 2);
alter table public.plan_addons enable row level security;
revoke all on public.plan_addons from public;
grant select on public.plan_addons to anon, authenticated;
create policy plan_addons_select on public.plan_addons for select using (true);

-- The designated Organization Owner (free seat). Set by provisioning; backfilled
-- once from the principal email for organizations that already exist.
alter table public.organizations add column if not exists owner_user_id uuid references public.profiles(id) on delete set null;
update public.organizations o set owner_user_id = p.id
  from public.profiles p where o.owner_user_id is null and p.email = o.principal_email;

-- What the signer picked for Build's "choose one"; applied at conversion.
alter table public.organization_trials add column if not exists selected_product public.product_key;

-- ---------------------------------------------------------------------------
-- Provisioning: trial grants the trial plan's capabilities; the pick is kept.
-- ---------------------------------------------------------------------------
create or replace function public.provision_self_serve_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business   text  := nullif(trim(v_meta ->> 'business_name'), '');
  v_plan       text  := coalesce(nullif(v_meta ->> 'plan', ''), 'empire_grow');
  v_selected   text  := nullif(v_meta ->> 'selected_product', '');
  v_phone      text  := public.normalize_phone(v_meta ->> 'phone');
  v_domain     text  := lower(split_part(new.email, '@', 2));
  v_name_norm  text  := public.normalize_business_name(v_business);
  v_agency     uuid;
  v_org        uuid;
  v_plan_row   public.plans%rowtype;
  v_grant_row  public.plans%rowtype;
  v_reason     text;
  v_matches    text[] := '{}';
  v_code       text;
  v_suffix     text;
begin
  if v_business is null then return new; end if;
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then return new; end if;
  if exists (select 1 from public.org_memberships m where m.user_id = new.id) then return new; end if;
  if exists (select 1 from public.blocked_email_domains b where b.domain = v_domain) then
    raise exception 'Sign-ups from this email provider are not accepted' using errcode = '23514';
  end if;

  select * into v_plan_row from public.plans p where p.key = v_plan and p.is_public;
  if v_plan_row.key is null then
    raise exception 'Unknown plan' using errcode = '23514';
  end if;
  if not v_plan_row.public_trial then
    raise exception 'This plan is available by agreement; contact BES' using errcode = '23514';
  end if;
  if v_plan_row.choose_one then
    if v_selected is null or not (v_selected = any (v_plan_row.products::text[])) or v_selected not in ('creditOps', 'fundingOps') then
      raise exception 'Empire Build needs a choice: CreditOps or FundingOps' using errcode = '23514';
    end if;
  end if;
  select * into v_grant_row from public.plans p where p.key = coalesce(v_plan_row.trial_grant_plan, v_plan_row.key);
  select id into v_agency from public.agencies order by created_at limit 1;

  if exists (select 1 from public.organization_identity i where i.kind = 'email' and i.value = lower(new.email)) then v_matches := array_append(v_matches, 'email'); end if;
  if v_phone is not null and exists (select 1 from public.organization_identity i where i.kind = 'phone' and i.value = v_phone) then v_matches := array_append(v_matches, 'phone'); end if;
  if not exists (select 1 from public.public_email_domains d where d.domain = v_domain)
     and exists (select 1 from public.organization_identity i where i.kind = 'email_domain' and i.value = v_domain) then v_matches := array_append(v_matches, 'email_domain'); end if;
  if v_name_norm is not null and exists (select 1 from public.organization_identity i where i.kind = 'business_name' and i.value = v_name_norm) then v_matches := array_append(v_matches, 'business_name'); end if;

  -- Short code: business prefix plus a suffix redrawn until unique within the agency (0043).
  v_code := upper(left(regexp_replace(v_business, '[^A-Za-z0-9]', '', 'g'), 6));
  if v_code = '' then v_code := 'ORG'; end if;
  v_suffix := upper(right(replace(new.id::text, '-', ''), 4));
  while exists (select 1 from public.organizations o where o.agency_id = v_agency and o.code = (v_code || '-' || v_suffix)::citext) loop
    v_suffix := upper(substr(md5(random()::text), 1, 4));
  end loop;
  insert into public.organizations (agency_id, name, code, principal_name, principal_email, status, owner_user_id)
  values (v_agency, v_business, v_code || '-' || v_suffix,
          coalesce(v_meta ->> 'full_name', new.email), new.email, 'Active', new.id)
  returning id into v_org;

  insert into public.org_memberships (organization_id, user_id, role) values (v_org, new.id, 'org_admin');

  -- Trial capabilities = the grant plan (Empire Grow); never CRM on a trial.
  insert into public.product_entitlements (organization_id, product, enabled)
  select v_org, p, true from unnest(v_grant_row.products) as p where p <> 'crm'
  on conflict (organization_id, product) do update set enabled = true;

  if array_length(v_matches, 1) is not null and (v_matches && array['email','phone','email_domain']) then
    v_reason := 'known_business:' || array_to_string(v_matches, ',');
    insert into public.organization_trials (organization_id, plan_key, selected_product, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, v_selected::public.product_key, now(), 'blocked', v_reason);
    update public.product_entitlements set enabled = false where organization_id = v_org;
  else
    insert into public.organization_trials (organization_id, plan_key, selected_product, ends_at, status, blocked_reason)
    values (v_org, v_plan_row.key, v_selected::public.product_key, now() + make_interval(days => v_plan_row.trial_days), 'active',
            case when 'business_name' = any (v_matches) then 'name_match_review' end);
  end if;

  insert into public.organization_identity (organization_id, kind, value)
  select v_org, k, v from (values
    ('email'::public.identity_kind, lower(new.email)),
    ('phone', v_phone),
    ('business_name', v_name_norm),
    ('email_domain', case when exists (select 1 from public.public_email_domains d where d.domain = v_domain) then null else v_domain end)
  ) as t(k, v) where v is not null
  on conflict do nothing;

  perform public.log_audit('organization.self_serve_provisioned', 'organization', v_org::text, v_org, null,
    jsonb_build_object('plan', v_plan_row.key, 'selected_product', v_selected, 'trial_grant', v_grant_row.key,
                       'trial', case when v_reason is null then 'active' else 'blocked' end, 'matches', v_matches));
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Usage, deterministically (measures; bills nothing).
-- ---------------------------------------------------------------------------
/** Active customer platform users, excluding the Organization Owner, BES personnel and client/consumer portal users. */
create or replace function public.organization_seat_usage(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_org_member(p_org) or public.is_manager_of(public.org_agency(p_org)) then (
    select count(*)::int from public.org_memberships m
     where m.organization_id = p_org
       and m.user_id <> coalesce((select owner_user_id from public.organizations where id = p_org), '00000000-0000-0000-0000-000000000000'::uuid)
       and not exists (select 1 from public.agency_memberships am where am.user_id = m.user_id)
  ) else null end
$$;

/** Active operational records: CreditOps clients being worked + FundingOps clients being worked. History never counts. */
create or replace function public.organization_active_records(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_org_member(p_org) or public.is_manager_of(public.org_agency(p_org)) then (
    (select count(*)::int from public.fulfillment_clients c where c.organization_id = p_org
       and c.status::text not in ('Completed', 'Archived', 'Graduated'))
    + (select count(*)::int from public.funding_clients f where f.organization_id = p_org
       and f.status::text not in ('Funded', 'Declined', 'Withdrawn', 'Archived'))
  ) else null end
$$;
revoke execute on function public.organization_seat_usage(uuid) from public, anon;
revoke execute on function public.organization_active_records(uuid) from public, anon;
grant execute on function public.organization_seat_usage(uuid) to authenticated;
grant execute on function public.organization_active_records(uuid) to authenticated;
