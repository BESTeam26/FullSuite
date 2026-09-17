-- AutoPay can be tested in sandbox, against [TEST] partners and only those.
--
-- Dee's UAT order puts AutoPay at step 4. As built it could not be tested at
-- all: `begin_partner_card_charge` refuses kind='autopay' outside production,
-- because a sandbox charge is approved without money moving and an unattended
-- sweep would mark REAL invoices paid, email real receipts and lift real
-- suspensions.
--
-- That reasoning is right and stays. What was wrong was the remedy — refusing
-- everything, which makes the one unattended money path the one path nobody
-- can rehearse. The real requirement is narrower:
--
--   a SANDBOX sweep must never touch a real partner
--   a PRODUCTION sweep must never touch a test partner
--
-- `outsourcing_groups.is_fixture` already marks test partners, and the
-- recurring generator already honours it. So the two environments now see
-- disjoint sets of partners, and neither can reach the other's.

create or replace function public.partner_autopay_due(p_environment text default 'production')
returns table (
  group_id        uuid,
  invoice_id      uuid,
  invoice_number  text,
  amount_cents    bigint,
  currency        text,
  idempotency_key text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.group_id, i.id, i.invoice_number,
         public.invoice_balance_cents(i.id),
         i.currency,
         /* The environment is part of the key, so a sandbox rehearsal can
            never be mistaken for the production charge of the same invoice. */
         'autopay:' || coalesce(p_environment, 'production') || ':'
           || i.id::text || ':' || public.invoice_balance_cents(i.id)::text
    from public.partner_invoices i
    join public.outsourcing_groups g on g.id = i.group_id
    join public.partner_payment_profiles p
      on p.group_id = i.group_id and p.is_default and p.autopay_enabled
   where i.status in ('sent', 'overdue', 'partially_paid')
     and i.due_date <= current_date
     and g.lifecycle not in ('suspended', 'archived')
     /* Disjoint by construction: sandbox sees only test partners, production
        only real ones. Neither can reach the other's invoices. */
     and g.is_fixture = (coalesce(p_environment, 'production') <> 'production')
     and public.invoice_balance_cents(i.id) > 0
     and not exists (
       select 1 from public.partner_card_charges c
        where c.invoice_id = i.id and c.status in ('pending', 'unknown', 'held_for_review'))
   order by i.due_date, i.invoice_number
$$;

comment on function public.partner_autopay_due(text) is
  'Invoices autopay should charge, for one environment. Sandbox returns ONLY fixture partners and production ONLY real ones, so a rehearsal cannot touch real money and a real sweep cannot touch a test partner. The key carries the environment for the same reason.';

revoke all on function public.partner_autopay_due(text) from public, authenticated, anon;

/* The old no-argument form is gone: leaving it would mean two callers could
   ask the same question and get different answers depending on which they
   picked, which is the drift this whole exercise has been about. */
drop function if exists public.partner_autopay_due();

create or replace function public.begin_partner_card_charge(
  p_group uuid, p_invoice uuid, p_amount_cents bigint,
  p_kind text, p_idempotency_key text, p_actor uuid,
  p_environment text default 'sandbox')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g        public.outsourcing_groups%rowtype;
  i        public.partner_invoices%rowtype;
  prof     public.partner_payment_profiles%rowtype;
  existing public.partner_card_charges%rowtype;
  v_owed   bigint;
  v_id     uuid;
begin
  select * into existing from public.partner_card_charges where idempotency_key = p_idempotency_key;
  if existing.id is not null then
    return jsonb_build_object('already', true, 'charge_id', existing.id,
      'status', existing.status, 'provider_txn_id', existing.provider_txn_id,
      'payment_id', existing.payment_id);
  end if;

  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;
  if p_kind not in ('pay_now', 'card_on_file', 'autopay') then
    raise exception 'Unknown kind of charge' using errcode = '22023';
  end if;
  if coalesce(p_environment, '') not in ('sandbox', 'production') then
    raise exception 'A charge must say which Authorize.Net it went to' using errcode = '22023';
  end if;

  if p_kind <> 'autopay' and not public.may_act_on_partner_billing(p_group, p_actor) then
    raise exception 'You cannot pay for this partner' using errcode = '42501';
  end if;

  /* AutoPay is unattended. In sandbox it may rehearse against a [TEST] partner
     and nothing else — a sandbox approval moves no money, so letting it near a
     real invoice would mark it paid and email a real receipt. */
  if p_kind = 'autopay' and p_environment <> 'production' and not g.is_fixture then
    raise exception 'AutoPay can only rehearse against a [TEST] partner outside production'
      using errcode = '42501';
  end if;
  /* And the reverse, which matters just as much once production is on: a real
     sweep must never charge a test partner's card. */
  if p_kind = 'autopay' and p_environment = 'production' and g.is_fixture then
    raise exception 'AutoPay does not charge a [TEST] partner in production' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A payment needs an amount' using errcode = '22023';
  end if;

  if p_invoice is not null then
    select * into i from public.partner_invoices where id = p_invoice for update;
    if i.id is null then raise exception 'That invoice does not exist' using errcode = '22023'; end if;
    if i.group_id <> p_group then
      raise exception 'That invoice belongs to a different partner' using errcode = '22023';
    end if;
    if i.status in ('draft', 'scheduled', 'void', 'cancelled', 'paid', 'refunded') then
      raise exception 'That invoice cannot be paid: it is %', i.status using errcode = '22023';
    end if;
    v_owed := public.invoice_balance_cents(p_invoice);
    if v_owed <= 0 then
      raise exception 'That invoice has nothing left to pay' using errcode = '22023';
    end if;
    if p_amount_cents > v_owed then
      raise exception 'That is more than the % owed on this invoice', v_owed using errcode = '22023';
    end if;
  end if;

  if p_kind <> 'pay_now' then
    select * into prof from public.partner_payment_profiles where group_id = p_group and is_default;
    if prof.id is null then raise exception 'No card on file for this partner' using errcode = '22023'; end if;
    if p_kind = 'autopay' and not prof.autopay_enabled then
      raise exception 'Autopay is not switched on for this partner' using errcode = '42501';
    end if;
  end if;

  insert into public.partner_card_charges
    (agency_id, group_id, invoice_id, profile_id, kind, idempotency_key,
     amount_cents, currency, status, environment, started_by)
  values (g.agency_id, p_group, p_invoice, prof.id, p_kind, p_idempotency_key,
          p_amount_cents, coalesce(i.currency, 'USD'), 'pending', p_environment,
          case when p_kind = 'autopay' then null else p_actor end)
  returning id into v_id;

  return jsonb_build_object('already', false, 'charge_id', v_id,
    'customer_profile_id', prof.customer_profile_id,
    'payment_profile_id', prof.payment_profile_id,
    'invoice_number', i.invoice_number, 'currency', coalesce(i.currency, 'USD'));
exception
  when unique_violation then
    select * into existing from public.partner_card_charges where idempotency_key = p_idempotency_key;
    return jsonb_build_object('already', true, 'charge_id', existing.id,
      'status', existing.status, 'provider_txn_id', existing.provider_txn_id,
      'payment_id', existing.payment_id);
end $$;

revoke all on function public.begin_partner_card_charge(uuid, uuid, bigint, text, text, uuid, text) from public, authenticated, anon;

/* The dispatch reads the environment it is actually running in, so cron in
   sandbox rehearses on fixtures and cron in production collects for real —
   with no switch to remember. Production still needs Dee's vault approval;
   a sandbox rehearsal does not, because it cannot reach a real partner. */
create or replace function public.partner_autopay_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $$
declare
  v_url    text;
  v_secret text;
  v_env    text;
begin
  select decrypted_secret into v_env from vault.decrypted_secrets where name = 'partner_autopay_environment';
  v_env := lower(coalesce(btrim(v_env), 'sandbox'));

  if v_env = 'production' and not public.partner_autopay_is_armed() then return; end if;
  if not exists (select 1 from public.partner_autopay_due(v_env)) then return; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'partner_autopay_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'partner_autopay_secret';
  if v_url is null or v_secret is null then return; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $$;

comment on function public.partner_autopay_dispatch() is
  'Cron entry point for autopay. Sandbox rehearses against [TEST] partners; production needs partner_autopay_enabled in the vault as well. Silent when there is nothing due.';

revoke all on function public.partner_autopay_dispatch() from public, authenticated, anon;
