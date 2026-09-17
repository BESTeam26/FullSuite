-- Autopay: the sweep, and the two switches in front of it.
--
-- Autopay is the only one of Dee's three options that charges a card with
-- nobody watching. Everything else here exists because of that.
--
-- ── WHY A SANDBOX CHARGE MUST NOT RUN THE SWEEP ───────────────────────────
--
-- The invoices in this database are real. A sandbox charge is approved by
-- Authorize.Net without any money moving — so a sweep running in sandbox would
-- mark real invoices PAID, queue real receipts to real partners, and lift real
-- suspensions, for money nobody sent. Attended payments are different: a person
-- chose the invoice and can see what happened. The sweep cannot be watched, so
-- it does not run outside production.
--
-- ── AND WHY THAT IS STILL NOT ENOUGH ──────────────────────────────────────
--
-- Dee's standing instruction: "Do not enable live production card charging
-- until I explicitly approve it." So production is necessary and not
-- sufficient. The sweep also needs `partner_autopay_enabled` in the vault, set
-- to 'true', which does not exist until somebody puts it there. Both switches,
-- or nothing happens and nothing is hidden about it.
--
-- ── WHICH ENVIRONMENT A CHARGE CAME FROM ──────────────────────────────────
--
-- Recorded on every attempt. Without it, a payment created by a sandbox test
-- is indistinguishable from one where money actually moved, and the only way
-- to tell would be to remember.

alter table public.partner_card_charges
  add column if not exists environment text not null default 'sandbox';

alter table public.partner_card_charges
  drop constraint if exists partner_card_charges_environment_ck;
alter table public.partner_card_charges
  add constraint partner_card_charges_environment_ck
  check (environment in ('sandbox', 'production'));

comment on column public.partner_card_charges.environment is
  'Which Authorize.Net a charge went to. A sandbox approval moves no money, and a payment that came from one must be identifiable without anybody having to remember.';

-- ── Starting a charge now records where it went ────────────────────────────

drop function if exists public.begin_partner_card_charge(uuid, uuid, bigint, text, text, uuid);

create function public.begin_partner_card_charge(
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
  /* Idempotency first. A retry must never re-run the checks and charge again —
     it gets the first attempt back, in whatever state it reached. */
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

  /* Autopay is started by the sweep, with nobody behind it. The other two are
     started by a person, and that person must belong to this partner. */
  if p_kind <> 'autopay' and not public.may_act_on_partner_billing(p_group, p_actor) then
    raise exception 'You cannot pay for this partner' using errcode = '42501';
  end if;
  /* The sweep charges unattended, so it does not run against a sandbox that
     approves everything and moves nothing. */
  if p_kind = 'autopay' and p_environment <> 'production' then
    raise exception 'Autopay does not run outside production' using errcode = '42501';
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
    /* No overpaying from the portal. An overpayment has to be somebody's
       deliberate act, not a typo in an amount box. */
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
  /* Two callers raced past the first SELECT with the same key. The loser reads
     the winner's row instead of creating a second charge. */
  when unique_violation then
    select * into existing from public.partner_card_charges where idempotency_key = p_idempotency_key;
    return jsonb_build_object('already', true, 'charge_id', existing.id,
      'status', existing.status, 'provider_txn_id', existing.provider_txn_id,
      'payment_id', existing.payment_id);
end $$;

revoke all on function public.begin_partner_card_charge(uuid, uuid, bigint, text, text, uuid, text) from public, authenticated, anon;

/* A sandbox payment says so in its own note, so nobody has to cross-reference
   a ledger to find out whether money moved. */
create or replace function public.settle_partner_card_charge(
  p_idempotency_key text, p_status text, p_provider_txn text,
  p_response_code text, p_response_text text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c        public.partner_card_charges%rowtype;
  i        public.partner_invoices%rowtype;
  v_owed   bigint;
  v_pay    uuid;
  v_excess bigint;
begin
  select * into c from public.partner_card_charges
   where idempotency_key = p_idempotency_key for update;
  if c.id is null then
    raise exception 'No such charge attempt' using errcode = 'P0002';
  end if;

  /* Already settled. The second caller is a retry of a call that succeeded,
     not a new charge: answer with what happened the first time. */
  if c.status <> 'pending' then
    return jsonb_build_object('status', c.status, 'payment_id', c.payment_id,
      'provider_txn_id', c.provider_txn_id, 'already_settled', true);
  end if;

  update public.partner_card_charges
     set status = p_status, provider_txn_id = p_provider_txn,
         response_code = p_response_code, response_text = p_response_text,
         updated_at = now()
   where id = c.id;

  if p_status <> 'approved' then
    return jsonb_build_object('status', p_status, 'payment_id', null,
      'provider_txn_id', p_provider_txn, 'already_settled', false);
  end if;

  if c.invoice_id is not null then
    select * into i from public.partner_invoices where id = c.invoice_id for update;
    if i.id is null then raise exception 'That invoice no longer exists' using errcode = '22023'; end if;
    if i.group_id <> c.group_id then
      raise exception 'That invoice belongs to a different partner' using errcode = '22023';
    end if;
    v_owed := public.invoice_balance_cents(i.id);
  end if;

  /* The ONLY write against the invoice. `partner_payments_sync_invoice` fires
     on this insert and recomputes amount_paid_cents, status and paid_at from
     the payments themselves; `partner_payments_receipt` queues the receipt.
     Touching the invoice here as well would count the money twice. */
  insert into public.partner_payments
    (agency_id, group_id, invoice_id, provider, provider_transaction_id,
     amount_cents, currency, paid_on, status, method, source,
     reconciliation_state, reconciled_at, notes, recorded_by)
  values (c.agency_id, c.group_id, c.invoice_id, 'authorize_net', p_provider_txn,
          c.amount_cents, c.currency, current_date, 'succeeded', 'Card',
          'provider_webhook',
          case when c.invoice_id is null then 'review_required' else 'matched' end,
          case when c.invoice_id is null then null else now() end,
          'Card payment via Authorize.Net (' || replace(c.kind, '_', ' ') || ')'
            || case when c.environment <> 'production'
                    then ' — SANDBOX TEST, no money moved' else '' end,
          c.started_by)
  returning id into v_pay;

  update public.partner_card_charges set payment_id = v_pay, updated_at = now() where id = c.id;

  /* begin_partner_card_charge refuses an amount above the balance, so this
     should never fire. It exists because "should never" is not a guarantee
     when a balance can move between starting a charge and settling it. */
  if c.invoice_id is not null and v_owed is not null and c.amount_cents > v_owed then
    v_excess := c.amount_cents - v_owed;
    insert into public.partner_account_credit_ledger
      (agency_id, group_id, kind, amount_cents, currency, description,
       source_payment_id, created_by)
    values (c.agency_id, c.group_id, 'overpayment', v_excess, c.currency,
            'Overpayment on ' || coalesce(i.invoice_number, 'an invoice'), v_pay, c.started_by);
  end if;

  if c.invoice_id is not null then
    perform public.billing_reactivation_sweep();
  end if;

  perform public.log_audit('partner.card_payment', 'partner_payment', v_pay::text, null, null,
    jsonb_build_object('partner', c.group_id, 'invoice', c.invoice_id,
      'amount_cents', c.amount_cents, 'kind', c.kind, 'environment', c.environment,
      'provider_txn', p_provider_txn));

  return jsonb_build_object('status', 'approved', 'payment_id', v_pay,
    'provider_txn_id', p_provider_txn, 'already_settled', false);
end $$;

revoke all on function public.settle_partner_card_charge(text, text, text, text, text) from public, authenticated, anon;

-- ── The sweep's two switches ───────────────────────────────────────────────

create or replace function public.partner_autopay_is_armed()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'vault'
as $$
declare v_flag text;
begin
  /* Absent until somebody puts it there. Dee's approval, made a thing that
     exists rather than a thing that was said. */
  select decrypted_secret into v_flag from vault.decrypted_secrets
   where name = 'partner_autopay_enabled';
  return coalesce(lower(btrim(v_flag)), 'false') = 'true';
exception when others then
  /* No vault, no read, no autopay. Never fail open. */
  return false;
end $$;

comment on function public.partner_autopay_is_armed() is
  'Whether Dee has approved unattended card charging. Reads partner_autopay_enabled from the vault; absent, unreadable or anything but true means no.';

revoke all on function public.partner_autopay_is_armed() from public, authenticated, anon;

create or replace function public.partner_autopay_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not public.partner_autopay_is_armed() then return; end if;
  if not exists (select 1 from public.partner_autopay_due()) then return; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'partner_autopay_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'partner_autopay_secret';
  if v_url is null or v_secret is null then return; end if;

  /* The sweep itself runs in the Edge Function, because charging a card means
     speaking to Authorize.Net and the database does not hold those keys. */
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $$;

comment on function public.partner_autopay_dispatch() is
  'Cron entry point for autopay. Does nothing at all unless Dee has armed it and there is something due.';

revoke all on function public.partner_autopay_dispatch() from public, authenticated, anon;

/* Scheduled now so it is not something to remember later. It is inert until
   the vault holds the approval, and it says nothing when there is nothing due.
   06:20 UTC — after the recurring sweep at 05:10 has raised the day's
   invoices, so an invoice generated this morning can be paid this morning. */
select cron.unschedule('partner-autopay-sweep')
 where exists (select 1 from cron.job where jobname = 'partner-autopay-sweep');
select cron.schedule('partner-autopay-sweep', '20 6 * * *', $cron$ select public.partner_autopay_dispatch() $cron$);
