-- 0117 — Subscriptions and payments, through Authorize.Net.
--
-- What existed: plans as data (0049), trials (0086), and four Authorize.Net
-- secrets sitting unused. What did not exist: any record of what an
-- organization is actually subscribed to, or that anyone had ever paid.
--
-- ---------------------------------------------------------------------------
-- THE RULE THAT SHAPES EVERYTHING HERE: no card data, ever.
--
-- Accept.js tokenises the card IN THE BROWSER — the number goes from the
-- customer's keyboard to Authorize.Net and never touches this platform, this
-- database, or any log. What comes back is an opaque nonce, exchanged once for
-- a stored profile id. The columns below hold a brand, a last four and two
-- profile ids, and there is deliberately nowhere to put a PAN, a CVV or an
-- expiry-plus-number pair. A schema with no column for a thing cannot leak it.
-- ---------------------------------------------------------------------------

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'cancelled', 'expired'
);
create type public.payment_status as enum (
  'approved', 'declined', 'error', 'held_for_review', 'voided', 'refunded'
);

-- ---------------------------------------------------------------------------
-- 1. What an organization is subscribed to. One live row per organization.
-- ---------------------------------------------------------------------------
create table public.organization_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  plan_key           text not null references public.plans(key),
  status             public.subscription_status not null default 'trialing',
  /** Monthly or annual, and the price AS AGREED — not a lookup into `plans`. */
  interval           text not null default 'monthly' check (interval in ('monthly', 'annual')),
  price_cents        integer not null check (price_cents >= 0),
  seats              integer not null default 1 check (seats >= 1),
  current_period_start date not null default current_date,
  current_period_end   date,
  cancel_at_period_end boolean not null default false,
  cancelled_at       timestamptz,
  /** Authorize.Net's stored customer profile. Never a card. */
  customer_profile_id text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger organization_subscriptions_updated_at before update on public.organization_subscriptions
  for each row execute function public.set_updated_at();

/**
 * One live subscription per organization. Cancelled and expired rows stay —
 * what somebody paid for last year is history, not something to overwrite
 * (rule 11) — so the uniqueness is on the LIVE ones only.
 */
create unique index organization_subscriptions_one_live
  on public.organization_subscriptions (organization_id)
  where status in ('trialing', 'active', 'past_due');
create index organization_subscriptions_org_idx on public.organization_subscriptions (organization_id, created_at desc);

comment on column public.organization_subscriptions.price_cents is
  'The price agreed at the time. Copied from the plan, never read back from it — changing a plan price must not silently restate what an existing customer is paying.';

-- ---------------------------------------------------------------------------
-- 2. Stored payment methods. Profile ids and a last four. Nothing else.
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  provider            text not null default 'authorize_net',
  customer_profile_id text not null,
  payment_profile_id  text not null,
  card_brand          text,
  /** Four digits. Not a card number, and there is no column that is. */
  last4               text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  exp_month           integer check (exp_month is null or exp_month between 1 and 12),
  exp_year            integer check (exp_year is null or exp_year between 2000 and 2100),
  is_default          boolean not null default true,
  added_by            uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create unique index payment_methods_profile_idx
  on public.payment_methods (provider, customer_profile_id, payment_profile_id);
create index payment_methods_org_idx on public.payment_methods (organization_id) where is_default;

comment on table public.payment_methods is
  'Tokenised references only. The card number is entered into Accept.js in the browser and goes straight to Authorize.Net; it never reaches this platform.';

-- ---------------------------------------------------------------------------
-- 3. Every charge, append-only.
-- ---------------------------------------------------------------------------
create table public.payment_transactions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  subscription_id    uuid references public.organization_subscriptions(id) on delete set null,
  provider           text not null default 'authorize_net',
  /** Authorize.Net's transaction id. Unique, so a retry cannot double-charge. */
  provider_txn_id    text,
  amount_cents       integer not null check (amount_cents > 0),
  currency           text not null default 'USD',
  status             public.payment_status not null,
  /** What the processor said, verbatim. Never rewritten into our own words. */
  response_code      text,
  response_text      text,
  /** Last four of the card used, copied at the time. Still not a card number. */
  last4              text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  description        text,
  charged_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);
create unique index payment_transactions_provider_txn_idx
  on public.payment_transactions (provider, provider_txn_id) where provider_txn_id is not null;
create index payment_transactions_org_idx on public.payment_transactions (organization_id, created_at desc);

comment on table public.payment_transactions is
  'Append-only. There is no update policy and no delete policy: a charge that happened cannot be edited into one that did not.';

-- ---------------------------------------------------------------------------
-- 4. Authorization.
--
--    Money is the organization's own business: its admins see and manage it.
--    BES staff see it too, because BES bills for the platform — but BES sees
--    subscription and transaction records, never a payment method, because
--    there is no reason for BES to enumerate a customer's stored cards.
-- ---------------------------------------------------------------------------
alter table public.organization_subscriptions enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payment_transactions enable row level security;

create policy organization_subscriptions_select on public.organization_subscriptions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_agency_staff());

create policy payment_transactions_select on public.payment_transactions for select to authenticated
  using (public.is_org_admin(organization_id) or public.is_agency_staff());

create policy payment_methods_select on public.payment_methods for select to authenticated
  using (public.is_org_admin(organization_id));

/*
 * No insert, update or delete policy on ANY of the three.
 *
 * Every write goes through a function below, running as the service role after
 * Authorize.Net has actually answered. A browser cannot record a payment,
 * cannot mark itself subscribed, and cannot edit a charge — which is the whole
 * point: these rows are claims about money, and a claim a browser can write is
 * not evidence.
 */
revoke all on public.organization_subscriptions, public.payment_methods, public.payment_transactions
  from anon;

-- ---------------------------------------------------------------------------
-- 5. The writers. Service role only — the Edge Function is the only caller,
--    because it is the only thing that has spoken to the processor.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_method(
  p_org uuid, p_customer_profile text, p_payment_profile text,
  p_brand text, p_last4 text, p_exp_month integer, p_exp_year integer, p_actor uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- Any new card becomes the default; the previous one stays on file.
  update public.payment_methods set is_default = false where organization_id = p_org;
  insert into public.payment_methods
    (organization_id, customer_profile_id, payment_profile_id, card_brand, last4, exp_month, exp_year, added_by)
  values (p_org, p_customer_profile, p_payment_profile, p_brand, p_last4, p_exp_month, p_exp_year, p_actor)
  on conflict (provider, customer_profile_id, payment_profile_id)
    do update set is_default = true, card_brand = excluded.card_brand, last4 = excluded.last4,
                  exp_month = excluded.exp_month, exp_year = excluded.exp_year
  returning id into v_id;

  update public.organization_subscriptions
     set customer_profile_id = p_customer_profile
   where organization_id = p_org and status in ('trialing', 'active', 'past_due');

  perform public.log_audit('payment.method_added', 'payment_method', v_id::text, p_org, null,
                           jsonb_build_object('brand', p_brand, 'last4', p_last4));
  return v_id;
end $$;
revoke all on function public.record_payment_method(uuid, text, text, text, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.record_payment_method(uuid, text, text, text, text, integer, integer, uuid) to service_role;

create or replace function public.record_payment_transaction(
  p_org uuid, p_subscription uuid, p_provider_txn text, p_amount_cents integer,
  p_status public.payment_status, p_code text, p_text text, p_last4 text,
  p_description text, p_actor uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.payment_transactions
    (organization_id, subscription_id, provider_txn_id, amount_cents, status, response_code, response_text, last4, description, charged_by)
  values (p_org, p_subscription, p_provider_txn, p_amount_cents, p_status, p_code, p_text, p_last4, p_description, p_actor)
  returning id into v_id;

  /*
   * A successful charge moves the subscription forward; a decline moves it to
   * past_due. Neither is inferred later from the transaction list — the state
   * changes here, once, in the same statement that records the money.
   */
  if p_subscription is not null then
    if p_status = 'approved' then
      update public.organization_subscriptions
         set status = 'active',
             current_period_start = current_date,
             current_period_end = case when interval = 'annual'
                                       then current_date + interval '1 year'
                                       else current_date + interval '1 month' end
       where id = p_subscription;
    elsif p_status in ('declined', 'error') then
      update public.organization_subscriptions set status = 'past_due'
       where id = p_subscription and status in ('trialing', 'active');
    end if;
  end if;

  perform public.log_audit('payment.charged', 'payment_transaction', v_id::text, p_org, null,
                           jsonb_build_object('amount_cents', p_amount_cents, 'status', p_status, 'provider_txn', p_provider_txn));
  return v_id;
end $$;
revoke all on function public.record_payment_transaction(uuid, uuid, text, integer, public.payment_status, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_payment_transaction(uuid, uuid, text, integer, public.payment_status, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Choosing a plan. This one IS callable by a person, because choosing a
--    plan is not a payment — it decides what will be charged, and the charge
--    is a separate deliberate act.
--
--    SECURITY INVOKER so the organization check runs as the caller.
-- ---------------------------------------------------------------------------
create or replace function public.choose_subscription_plan(
  p_org uuid, p_plan_key text, p_interval text default 'monthly', p_seats integer default 1
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  pl public.plans%rowtype;
  v_price integer;
  v_id uuid;
begin
  if not public.is_org_admin(p_org) and not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_interval not in ('monthly', 'annual') then
    raise exception 'unknown interval' using errcode = '22023';
  end if;
  select * into pl from public.plans where key = p_plan_key;
  if pl.key is null then raise exception 'unknown plan' using errcode = 'P0002'; end if;

  v_price := case when p_interval = 'annual' then pl.annual_cents else pl.monthly_cents end;
  if v_price is null then
    raise exception 'this plan has no % price', p_interval using errcode = '22023';
  end if;

  /* Close the previous live subscription rather than editing it: what they
     were on before is a fact about the past. */
  update public.organization_subscriptions
     set status = 'cancelled', cancelled_at = now()
   where organization_id = p_org and status in ('trialing', 'active', 'past_due');

  insert into public.organization_subscriptions
    (organization_id, plan_key, status, interval, price_cents, seats, created_by)
  values (p_org, p_plan_key, 'trialing', p_interval, v_price, greatest(p_seats, 1), auth.uid())
  returning id into v_id;

  perform public.log_audit('subscription.chosen', 'organization_subscription', v_id::text, p_org, null,
                           jsonb_build_object('plan', p_plan_key, 'interval', p_interval, 'price_cents', v_price));
  return v_id;
end $$;
revoke all on function public.choose_subscription_plan(uuid, text, text, integer) from public, anon;
grant execute on function public.choose_subscription_plan(uuid, text, text, integer) to authenticated;

/** Cancel at the end of the paid period. Not a delete, and not immediate. */
create or replace function public.cancel_subscription(p_org uuid, p_immediately boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_org_admin(p_org) and not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.organization_subscriptions
     set cancel_at_period_end = not p_immediately,
         status = case when p_immediately then 'cancelled' else status end,
         cancelled_at = case when p_immediately then now() else cancelled_at end
   where organization_id = p_org and status in ('trialing', 'active', 'past_due');
  perform public.log_audit('subscription.cancelled', 'organization_subscription', p_org::text, p_org, null,
                           jsonb_build_object('immediately', p_immediately));
end $$;
revoke all on function public.cancel_subscription(uuid, boolean) from public, anon;
grant execute on function public.cancel_subscription(uuid, boolean) to authenticated;
