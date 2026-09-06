-- 0100 — AI safeguards. Reserve first, reconcile after, fail closed.
--
-- The hole this closes, in one sentence: the balance was checked BEFORE the
-- call and the charge computed AFTER it, so an organization with one credit
-- left could spend fifty on a single large request. A positive balance before
-- a request is not permission to overshoot on it (Dee, requirement 10).
--
-- The shape is the one card networks use. Reserve an estimate, which makes the
-- money unavailable immediately; do the work; reconcile against what it
-- actually cost. An abandoned reservation expires rather than stranding the
-- credits forever.
--
-- ── Fail closed, everywhere ────────────────────────────────────────────────
--
-- Every refusal below is a raise, never a default. Usage that cannot be
-- attributed to an organization does not fall back to "charge nobody" — it
-- does not happen. An unpriced model is refused rather than billed at zero.
-- The reason is simple: the failure mode of guessing is a bill Dee pays and
-- cannot recover.

-- ---------------------------------------------------------------------------
-- 1. The markup. 3.0x provider cost (Dee, requirement 1).
--
-- Not margin for its own sake: it covers payment processing, the calls that
-- fail and cannot be billed, provider price changes, and tax. At 1.000 — where
-- this sat — a single provider price rise puts BES underwater on every call.
-- ---------------------------------------------------------------------------
alter table public.ai_pricing_policy alter column markup_multiplier set default 3.000;
update public.ai_pricing_policy set markup_multiplier = 3.000
 where markup_multiplier = 1.000 and (effective_until is null or effective_until > now());

-- ---------------------------------------------------------------------------
-- 2. Limits, as configurable rows. Never constants (requirement 8).
--    organization_id null is the platform default every organization inherits.
-- ---------------------------------------------------------------------------
create table public.ai_limits (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid references public.organizations(id) on delete cascade,
  daily_spend_cap_credits   numeric(12,2) not null default 2000 check (daily_spend_cap_credits >= 0),
  per_request_cap_credits   numeric(12,2) not null default 300  check (per_request_cap_credits > 0),
  requests_per_hour         integer       not null default 60   check (requests_per_hour > 0),
  max_upload_mb             integer       not null default 25   check (max_upload_mb > 0),
  max_pages                 integer       not null default 60   check (max_pages > 0),
  /** Output tokens a single request may produce. */
  max_output_tokens         integer       not null default 4096 check (max_output_tokens between 256 and 32000),
  updated_by                uuid references public.profiles(id) on delete set null,
  updated_at                timestamptz not null default now()
);
create unique index ai_limits_default_idx on public.ai_limits ((organization_id is null)) where organization_id is null;
create unique index ai_limits_org_idx on public.ai_limits (organization_id) where organization_id is not null;
create trigger ai_limits_updated_at before update on public.ai_limits
  for each row execute function public.set_updated_at();
insert into public.ai_limits (organization_id) values (null) on conflict do nothing;

alter table public.ai_limits enable row level security;
/* An organization sees the limits that apply to it. Only BES sets them: a
   customer raising their own spend cap is not a limit. */
create policy ai_limits_select on public.ai_limits for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id)
         or public.is_staff_of(public.org_agency(organization_id)));
create policy ai_limits_write on public.ai_limits for all to authenticated
  using (public.is_agency_manager_or_above()) with check (public.is_agency_manager_or_above());
revoke all on public.ai_limits from anon;
grant select, insert, update on public.ai_limits to authenticated;

create or replace function public.ai_limits_for(p_org uuid)
returns public.ai_limits language sql stable security definer set search_path = public as $$
  select * from public.ai_limits
   where organization_id = p_org
      or organization_id is null
   order by (organization_id is not null) desc
   limit 1
$$;
revoke all on function public.ai_limits_for(uuid) from public, anon;
grant execute on function public.ai_limits_for(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Plan allowances as catalog data (requirement 8). Not locked yet.
-- ---------------------------------------------------------------------------
create table public.plan_ai_allowances (
  plan_key         text primary key references public.plans(key) on delete cascade,
  monthly_credits  numeric(12,2) not null default 0 check (monthly_credits >= 0),
  note             text,
  updated_at       timestamptz not null default now()
);
create trigger plan_ai_allowances_updated_at before update on public.plan_ai_allowances
  for each row execute function public.set_updated_at();
alter table public.plan_ai_allowances enable row level security;
create policy plan_ai_allowances_select on public.plan_ai_allowances for select to authenticated using (true);
create policy plan_ai_allowances_write on public.plan_ai_allowances for all to authenticated
  using (public.is_agency_manager_or_above()) with check (public.is_agency_manager_or_above());
revoke all on public.plan_ai_allowances from anon;
grant select, insert, update, delete on public.plan_ai_allowances to authenticated;

comment on table public.plan_ai_allowances is
  'Monthly included AI credits per plan. Starting values for testing only — Dee has not locked these, and they are rows precisely so locking them later is an edit, not a migration.';

insert into public.plan_ai_allowances (plan_key, monthly_credits, note)
select p.key,
       case p.key when 'empire_build' then 2000 when 'empire_grow' then 5000
                  when 'empire_scale' then 10000 when 'empire_enterprise' then 20000
                  else 0 end,
       'Provisional for testing. Not locked.'
  from public.plans p
on conflict (plan_key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Reservations.
-- ---------------------------------------------------------------------------
create type public.ai_reservation_status as enum ('reserved', 'reconciled', 'released', 'expired');

create table public.ai_reservations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  feature_key       text not null references public.ai_features(key),
  model             text not null,
  estimated_credits numeric(12,2) not null check (estimated_credits > 0),
  status            public.ai_reservation_status not null default 'reserved',
  usage_event_id    uuid references public.ai_usage_events(id) on delete set null,
  /** A reservation nobody reconciles must not strand the credits. */
  expires_at        timestamptz not null default now() + interval '10 minutes',
  created_at        timestamptz not null default now(),
  settled_at        timestamptz
);
create index ai_reservations_open_idx on public.ai_reservations (organization_id) where status = 'reserved';
create index ai_reservations_rate_idx on public.ai_reservations (organization_id, created_at);

alter table public.ai_reservations enable row level security;
create policy ai_reservations_select on public.ai_reservations for select to authenticated
  using (public.is_org_member(organization_id) or public.is_staff_of(public.org_agency(organization_id)));
revoke all on public.ai_reservations from anon;
grant select on public.ai_reservations to authenticated;

/** Reserved credits still outstanding. Expired ones are not held. */
create or replace function public.ai_reserved_credits(p_org uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(estimated_credits), 0) from public.ai_reservations
   where organization_id = p_org and status = 'reserved' and expires_at > now()
$$;
revoke all on function public.ai_reserved_credits(uuid) from public, anon;
grant execute on function public.ai_reserved_credits(uuid) to authenticated;

/**
 * What an organization can actually spend right now: the balance, less what is
 * already reserved. This is the number every check below uses, and the reason
 * two requests in flight cannot both spend the last credit.
 */
create or replace function public.ai_available_credits(p_org uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select public.ai_credit_balance(p_org) - public.ai_reserved_credits(p_org)
$$;
revoke all on function public.ai_available_credits(uuid) from public, anon;
grant execute on function public.ai_available_credits(uuid) to authenticated;

/** Credits actually charged today. Reservations are not spend until settled. */
create or replace function public.ai_spend_today(p_org uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(credits_charged), 0) from public.ai_usage_events
   where organization_id = p_org and created_at >= date_trunc('day', now())
$$;
revoke all on function public.ai_reserved_credits(uuid) from public, anon;
grant execute on function public.ai_spend_today(uuid) to authenticated;

/** What an estimate would cost, at the policy in force. */
create or replace function public.ai_estimate_credits(p_model text, p_input integer, p_output integer)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare pol public.ai_pricing_policy%rowtype; v_usd numeric;
begin
  select * into pol from public.ai_pricing_policy
   where model = p_model and effective_from <= now() and (effective_until is null or effective_until > now())
   order by effective_from desc limit 1;
  /* An unpriced model is refused, never billed at zero. */
  if pol.id is null then
    raise exception 'No pricing policy in force for model %', p_model using errcode = '22023';
  end if;
  v_usd := (p_input * pol.input_cost_per_million + p_output * pol.output_cost_per_million) / 1000000.0;
  return ceil(v_usd * pol.markup_multiplier * pol.credits_per_usd * 100) / 100.0;
end $$;
revoke all on function public.ai_estimate_credits(text, integer, integer) from public, anon;
grant execute on function public.ai_estimate_credits(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reserve. Every gate, in one place, and every one of them a refusal.
-- ---------------------------------------------------------------------------
create or replace function public.ai_reserve(
  p_org uuid, p_feature text, p_model text, p_est_input integer, p_est_output integer
) returns table (reservation_id uuid, estimated_credits numeric, available_after numeric)
language plpgsql security definer set search_path = public as $$
declare
  lim public.ai_limits;
  v_est numeric;
  v_available numeric;
  v_recent integer;
  v_id uuid;
begin
  /* Fail closed on attribution. Not "charge the platform" — refuse. */
  if p_org is null then
    raise exception 'AI usage must be attributed to an organization' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'AI usage must be attributed to a user' using errcode = '42501';
  end if;
  if not public.is_org_member(p_org) then
    raise exception 'Not a member of this organization' using errcode = '42501';
  end if;
  /* Entitlement is a separate question from consumption (requirement 6). */
  if not public.ai_can_use(p_org, p_feature) then
    raise exception 'This feature is not available on the current plan, or there are no credits' using errcode = '42501';
  end if;
  if p_est_input is null or p_est_output is null or p_est_input < 0 or p_est_output <= 0 then
    raise exception 'An estimate is required before a request is sent' using errcode = '22023';
  end if;

  lim := public.ai_limits_for(p_org);

  if p_est_output > lim.max_output_tokens then
    raise exception 'Requested output of % tokens exceeds the ceiling of %', p_est_output, lim.max_output_tokens using errcode = '22023';
  end if;

  v_est := public.ai_estimate_credits(p_model, p_est_input, p_est_output);

  if v_est > lim.per_request_cap_credits then
    raise exception 'This request would cost % credits, above the per-request ceiling of %', v_est, lim.per_request_cap_credits using errcode = '22023';
  end if;

  v_available := public.ai_available_credits(p_org);
  if v_est > v_available then
    raise exception 'This request needs % credits and % are available', v_est, v_available using errcode = '22023';
  end if;

  if public.ai_spend_today(p_org) + v_est > lim.daily_spend_cap_credits then
    raise exception 'This would pass the daily cap of % credits', lim.daily_spend_cap_credits using errcode = '22023';
  end if;

  select count(*) into v_recent from public.ai_reservations
   where organization_id = p_org and created_at > now() - interval '1 hour';
  if v_recent >= lim.requests_per_hour then
    raise exception 'Too many AI requests in the last hour (limit %)', lim.requests_per_hour using errcode = '22023';
  end if;

  insert into public.ai_reservations (organization_id, user_id, feature_key, model, estimated_credits)
  values (p_org, auth.uid(), p_feature, p_model, v_est)
  returning id into v_id;

  return query select v_id, v_est, public.ai_available_credits(p_org);
end $$;
revoke all on function public.ai_reserve(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.ai_reserve(uuid, text, text, integer, integer) to authenticated;

/**
 * Settle a reservation against what the request actually cost.
 *
 * Service role only. A browser that could reconcile its own usage could
 * reconcile it at zero, which is the whole ledger gone.
 */
create or replace function public.ai_reconcile(
  p_reservation uuid, p_input integer, p_output integer, p_cached integer, p_request_id text
) returns table (credits_charged numeric, balance numeric)
language plpgsql security definer set search_path = public as $$
declare r public.ai_reservations; v record;
begin
  select * into r from public.ai_reservations where id = p_reservation for update;
  if r.id is null then raise exception 'Reservation not found' using errcode = 'P0002'; end if;
  if r.status <> 'reserved' then
    raise exception 'Reservation already %', r.status using errcode = '22023';
  end if;

  select * into v from public.ai_record_usage(
    r.organization_id, r.user_id, r.feature_key, r.model, p_input, p_output, coalesce(p_cached, 0), p_request_id, null);

  update public.ai_reservations
     set status = 'reconciled', settled_at = now(),
         usage_event_id = (select id from public.ai_usage_events
                            where request_id = p_request_id order by created_at desc limit 1)
   where id = p_reservation;

  return query select v.credits_charged, v.balance;
end $$;
revoke all on function public.ai_reconcile(uuid, integer, integer, integer, text) from public, anon, authenticated;

/** The provider call failed. Give the credits back rather than holding them. */
create or replace function public.ai_release(p_reservation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ai_reservations set status = 'released', settled_at = now()
   where id = p_reservation and status = 'reserved';
end $$;
revoke all on function public.ai_release(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Internal AI economics (requirement 9). BES only — a customer must never
--    see provider cost or the markup that produced their charge.
-- ---------------------------------------------------------------------------
create or replace function public.ai_economics(p_from date default null, p_to date default null)
returns table (
  organization_id uuid, organization_name text, plan_key text,
  feature_key text, model text,
  requests bigint, input_tokens bigint, output_tokens bigint,
  provider_cost_cents numeric, credits_charged numeric,
  gross_margin_cents numeric
)
language sql stable security definer set search_path = public as $$
  select
    e.organization_id, o.name, t.plan_key, e.feature_key, e.model,
    count(*), sum(e.input_tokens)::bigint, sum(e.output_tokens)::bigint,
    sum(e.provider_cost_cents), sum(e.credits_charged),
    /* A credit is a cent, so charge and cost are comparable directly. */
    sum(e.credits_charged) - sum(e.provider_cost_cents)
  from public.ai_usage_events e
  join public.organizations o on o.id = e.organization_id
  left join public.organization_trials t on t.organization_id = e.organization_id
  where public.is_agency_manager_or_above()
    and (p_from is null or e.created_at >= p_from)
    and (p_to is null or e.created_at < (p_to + 1))
  group by e.organization_id, o.name, t.plan_key, e.feature_key, e.model
$$;
revoke all on function public.ai_economics(date, date) from public, anon;
grant execute on function public.ai_economics(date, date) to authenticated;

/** What a CUSTOMER may see: their own credits. No provider cost, no markup. */
create or replace function public.ai_my_usage(p_org uuid, p_from date default null)
returns table (feature_key text, requests bigint, credits_charged numeric)
language sql stable security definer set search_path = public as $$
  select e.feature_key, count(*), sum(e.credits_charged)
    from public.ai_usage_events e
   where e.organization_id = p_org
     and public.is_org_member(p_org)
     and (p_from is null or e.created_at >= p_from)
   group by e.feature_key
$$;
revoke all on function public.ai_my_usage(uuid, date) from public, anon;
grant execute on function public.ai_my_usage(uuid, date) to authenticated;
