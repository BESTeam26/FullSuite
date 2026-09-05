-- =============================================================================
-- 0070 — BES AI Credits (ARCHITECTURE_PROPOSAL_AI_CREDITS.md): access vs consumption
--
--   ai_features            what exists and where (key, product, minimum plan)
--   ai_pricing_policy      provider unit costs × BES markup per model, effective-dated
--   ai_usage_events        the ledger of use — written ONLY by the server-side gateway
--                          (service role); the API role holds no insert grant
--   ai_credit_ledger       purchases · auto-recharges · usage · adjustments · refunds;
--                          balance = sum; usage rows are written by the gateway,
--                          purchases/adjustments by BES managers, never by customers
--   ai_recharge_settings   the organization owner's threshold / pack / enabled
--   ai_credit_balance(org) one deterministic sum; ai_can_use(org, feature) = entitled + balance > 0
-- Credits are BES's unit shown to customers; tokens and provider cost stay internal.
-- =============================================================================

create table public.ai_features (
  key       text primary key,                      -- e.g. letters.assist
  label     text not null,
  product   public.product_key,                   -- null = platform-wide
  min_plan  text,                                  -- plan code required; null = any plan
  active    boolean not null default true,
  sort      integer not null default 0
);
insert into public.ai_features (key, label, product, min_plan, sort) values
  ('credit.analysis',   'Credit analysis',        'creditOps',  null, 10),
  ('letters.assist',    'Letter assistance',      'creditOps',  null, 11),
  ('funding.analysis',  'Funding analysis',       'fundingOps', null, 20),
  ('funding.doc_intel', 'Document intelligence',  'fundingOps', null, 21),
  ('ops.assistant',     'Operational assistant',  null,         null, 30);

create table public.ai_pricing_policy (
  id                     uuid primary key default gen_random_uuid(),
  model                  text not null,                             -- provider model id
  input_cost_per_million numeric(10,4) not null check (input_cost_per_million >= 0),   -- USD per 1M input tokens
  output_cost_per_million numeric(10,4) not null check (output_cost_per_million >= 0),
  cached_cost_per_million numeric(10,4) not null default 0 check (cached_cost_per_million >= 0),
  markup_multiplier      numeric(6,3) not null default 1.000 check (markup_multiplier >= 1),
  credits_per_usd        numeric(10,4) not null default 100 check (credits_per_usd > 0), -- 1 credit = 1 cent by default
  effective_from         timestamptz not null default now(),
  effective_until        timestamptz,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index ai_pricing_policy_model_idx on public.ai_pricing_policy (model, effective_from desc);

create table public.ai_usage_events (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  user_id              uuid references public.profiles(id) on delete set null,
  product              public.product_key,
  feature_key          text not null references public.ai_features(key),
  model                text not null,
  input_tokens         integer not null default 0 check (input_tokens >= 0),
  output_tokens        integer not null default 0 check (output_tokens >= 0),
  cached_tokens        integer not null default 0 check (cached_tokens >= 0),
  provider_cost_cents  numeric(12,4) not null default 0,
  credits_charged      numeric(12,2) not null default 0 check (credits_charged >= 0),
  request_id           text not null unique,
  created_at           timestamptz not null default now()
);
create index ai_usage_events_org_idx on public.ai_usage_events (organization_id, created_at desc);

create table public.ai_credit_ledger (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  delta_credits    numeric(12,2) not null,
  kind             text not null check (kind in ('purchase', 'auto_recharge', 'usage', 'adjustment', 'refund')),
  reference        text,                                     -- payment reference, usage event id, reason
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check ((kind = 'usage' and delta_credits <= 0) or (kind in ('purchase', 'auto_recharge', 'refund') and delta_credits > 0) or kind = 'adjustment')
);
create index ai_credit_ledger_org_idx on public.ai_credit_ledger (organization_id, created_at desc);

create table public.ai_recharge_settings (
  organization_id  uuid primary key references public.organizations(id) on delete cascade,
  enabled          boolean not null default false,
  threshold        numeric(12,2) not null default 500 check (threshold >= 0),
  pack_usd         integer not null default 25 check (pack_usd in (10, 25, 50, 100)),
  updated_by       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

create or replace function public.ai_credit_balance(p_org uuid)
returns numeric language sql stable security invoker set search_path = public as $$
  select coalesce(sum(delta_credits), 0) from public.ai_credit_ledger where organization_id = p_org
$$;
/** Entitled to the feature (organization has the feature's product, or the feature is platform-wide) and holds a positive balance. */
create or replace function public.ai_can_use(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ai_features f where f.key = p_feature and f.active
                   and (f.product is null or public.org_has_product(p_org, f.product)))
     and public.is_org_member(p_org)
     and (select coalesce(sum(delta_credits), 0) from public.ai_credit_ledger where organization_id = p_org) > 0
$$;
/** BES credits an organization (purchase, refund, adjustment); customers never write the ledger; audited. */
create or replace function public.grant_ai_credits(p_org uuid, p_credits numeric, p_kind text, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_manager_of(public.org_agency(p_org)) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if p_kind not in ('purchase', 'refund', 'adjustment') then raise exception 'Unknown ledger kind %', p_kind using errcode = '22023'; end if;
  insert into public.ai_credit_ledger (organization_id, delta_credits, kind, reference, created_by) values (p_org, p_credits, p_kind, p_reference, auth.uid()) returning id into v_id;
  perform public.log_audit('organization.ai_credits_granted', 'ai_credit_ledger', v_id::text, p_org, null, jsonb_build_object('credits', p_credits, 'kind', p_kind, 'reference', p_reference));
  return v_id;
end $$;

/**
 * The ONE place a charge is computed and recorded: the gateway (service role) calls this after a
 * provider response. Price = tokens × policy in force for the model × markup × credits/USD, rounded
 * up to the cent. Writes the usage event and the ledger debit together; returns the charge and the
 * new balance. Not executable by the API role — the browser never meters itself.
 */
create or replace function public.ai_record_usage(p_org uuid, p_user uuid, p_feature text, p_model text, p_input integer, p_output integer, p_cached integer, p_request_id text, p_product public.product_key default null)
returns table (credits_charged numeric, provider_cost_cents numeric, balance numeric) language plpgsql security definer set search_path = public as $$
declare pol public.ai_pricing_policy%rowtype; v_usd numeric; v_cost_cents numeric; v_credits numeric; v_event uuid;
begin
  select * into pol from public.ai_pricing_policy where model = p_model and effective_from <= now() and (effective_until is null or effective_until > now()) order by effective_from desc limit 1;
  if pol.id is null then raise exception 'No pricing policy in force for model %', p_model using errcode = '22023'; end if;
  v_usd := (p_input * pol.input_cost_per_million + p_output * pol.output_cost_per_million + p_cached * pol.cached_cost_per_million) / 1000000.0;
  v_cost_cents := round(v_usd * 100, 4);
  v_credits := ceil(v_usd * pol.markup_multiplier * pol.credits_per_usd * 100) / 100.0;
  insert into public.ai_usage_events (organization_id, user_id, product, feature_key, model, input_tokens, output_tokens, cached_tokens, provider_cost_cents, credits_charged, request_id)
  values (p_org, p_user, p_product, p_feature, p_model, p_input, p_output, p_cached, v_cost_cents, v_credits, p_request_id) returning id into v_event;
  insert into public.ai_credit_ledger (organization_id, delta_credits, kind, reference, created_by) values (p_org, -v_credits, 'usage', v_event::text, p_user);
  return query select v_credits, v_cost_cents, public.ai_credit_balance(p_org);
end $$;
revoke all on function public.ai_record_usage(uuid, uuid, text, text, integer, integer, integer, text, public.product_key) from public, anon, authenticated;
grant execute on function public.ai_record_usage(uuid, uuid, text, text, integer, integer, integer, text, public.product_key) to service_role;

alter table public.ai_features enable row level security;
alter table public.ai_pricing_policy enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_credit_ledger enable row level security;
alter table public.ai_recharge_settings enable row level security;
revoke all on public.ai_features, public.ai_pricing_policy, public.ai_usage_events, public.ai_credit_ledger, public.ai_recharge_settings from public, anon, authenticated;
grant select on public.ai_features, public.ai_usage_events, public.ai_credit_ledger, public.ai_recharge_settings to authenticated;
grant select on public.ai_pricing_policy to authenticated;            -- BES staff only by policy
grant insert, update on public.ai_recharge_settings to authenticated;
grant insert, update on public.ai_pricing_policy to authenticated;    -- BES managers only by policy
create policy ai_features_select on public.ai_features for select to authenticated using (true);
create policy ai_pricing_select on public.ai_pricing_policy for select to authenticated using (public.is_agency_staff());
create policy ai_pricing_write on public.ai_pricing_policy for all to authenticated using (public.is_agency_manager_or_above()) with check (public.is_agency_manager_or_above());
/* Usage and ledger: the organization's admins, and BES managers of its agency. Provider cost is a column the interface hides from customers; the row policy is the same. */
create policy ai_usage_select on public.ai_usage_events for select to authenticated using (public.is_org_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)));
create policy ai_ledger_select on public.ai_credit_ledger for select to authenticated using (public.is_org_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)));
create policy ai_recharge_select on public.ai_recharge_settings for select to authenticated using (public.is_org_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)));
create policy ai_recharge_write on public.ai_recharge_settings for all to authenticated
  using (public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)))
  with check (public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)));
revoke all on function public.ai_credit_balance(uuid), public.ai_can_use(uuid, text), public.grant_ai_credits(uuid, numeric, text, text) from public, anon;
grant execute on function public.ai_credit_balance(uuid), public.ai_can_use(uuid, text), public.grant_ai_credits(uuid, numeric, text, text) to authenticated;
