-- The charge path, corrected.
--
-- 20260917000200 wrote `settle_partner_card_charge` so that it moved
-- `amount_paid_cents` itself. That was wrong, and wrong in exactly the way Dee
-- warned about: `partner_payments` already carries a trigger
-- (`partner_payments_sync_invoice` → `partner_invoice_recompute`) which re-adds
-- the invoice's paid total from the payments themselves. Inserting the payment
-- AND adding the amount by hand credits the same money twice — an invoice paid
-- once would read as paid twice, and a partial payment would close an invoice
-- that still had a balance.
--
-- Nothing had called it: `partner_card_charges` is empty and no card profile
-- exists. The function is replaced here rather than edited in place so the
-- history says what happened.
--
-- The rule to keep: insert the payment and let the existing engine recompute.
-- A card payment must settle through exactly the same path a manual payment
-- does — recompute, receipt, reactivation, account credit, audit — or the two
-- kinds of payment drift apart.

-- ── Who a service-role caller is acting for ────────────────────────────────

/* `is_partner_contact_of` reads auth.uid(), which is null when the payments
   function calls with the service role. The same question has to be askable
   about a named person. */
create or replace function public.partner_group_of_profile(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.group_id from public.partner_contacts c
   where c.user_id = p_user and c.status = 'active'
   limit 1
$$;

comment on function public.partner_group_of_profile(uuid) is
  'The partner a named person is an active portal contact of. The service-role equivalent of partner_group_of_user().';

-- ── Keeping a card ─────────────────────────────────────────────────────────

create or replace function public.save_partner_card_profile(
  p_group             uuid,
  p_customer_profile  text,
  p_payment_profile   text,
  p_brand             text,
  p_last4             text,
  p_exp_month         smallint,
  p_exp_year          smallint,
  p_actor             uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.outsourcing_groups%rowtype;
  v_id uuid;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;

  /* The person keeping a card must be that partner's own contact, or BES staff
     acting for them. Checked here, not only in the function that called us. */
  if not (public.partner_group_of_profile(p_actor) = p_group
          or (public.is_staff_of(g.agency_id) and public.agency_can('partners.billing.manage'))) then
    raise exception 'You cannot save a card for this partner' using errcode = '42501';
  end if;

  /* One default card. Replacing it retires the old row's default flag first,
     because the unique index allows exactly one. */
  update public.partner_payment_profiles set is_default = false, updated_at = now()
   where group_id = p_group and is_default;

  insert into public.partner_payment_profiles
    (agency_id, group_id, provider, customer_profile_id, payment_profile_id,
     card_brand, last4, exp_month, exp_year, is_default, added_by)
  values (g.agency_id, p_group, 'authorize_net', p_customer_profile, p_payment_profile,
          nullif(btrim(coalesce(p_brand, '')), ''), nullif(btrim(coalesce(p_last4, '')), ''),
          p_exp_month, p_exp_year, true, p_actor)
  returning id into v_id;

  perform public.log_audit('partner.card_saved', 'partner_payment_profile', v_id::text, null, null,
    jsonb_build_object('partner', p_group, 'last4', p_last4, 'brand', p_brand));
  return v_id;
end $$;

revoke all on function public.save_partner_card_profile(uuid, text, text, text, text, smallint, smallint, uuid) from public, authenticated, anon;

-- ── Autopay is the partner's own switch ────────────────────────────────────

create or replace function public.set_partner_autopay(p_group uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.outsourcing_groups%rowtype;
  v_has_card boolean;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;

  if not (public.is_partner_contact_of(p_group)
          or (public.is_staff_of(g.agency_id) and public.agency_can('partners.billing.manage'))) then
    raise exception 'You cannot change autopay for this partner' using errcode = '42501';
  end if;

  select exists (select 1 from public.partner_payment_profiles
                  where group_id = p_group and is_default) into v_has_card;
  /* Autopay without a card is a switch that does nothing — and a partner who
     believes their invoices are paid. Refuse it rather than accept it. */
  if p_enabled and not v_has_card then
    raise exception 'Save a card first: autopay needs a card on file' using errcode = '22023';
  end if;

  update public.partner_payment_profiles
     set autopay_enabled = p_enabled, updated_at = now()
   where group_id = p_group and is_default;

  perform public.log_audit('partner.autopay_changed', 'outsourcing_group', p_group::text, null, null,
    jsonb_build_object('enabled', p_enabled));
  return p_enabled;
end $$;

grant execute on function public.set_partner_autopay(uuid, boolean) to authenticated;

-- ── Starting a charge ──────────────────────────────────────────────────────

/* Returns the attempt to run, or the attempt that already exists under this
   key. The caller only speaks to Authorize.Net when `already` is false. */
create or replace function public.begin_partner_card_charge(
  p_group           uuid,
  p_invoice         uuid,
  p_amount_cents    bigint,
  p_kind            text,
  p_idempotency_key text,
  p_actor           uuid
)
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
  /* Idempotency first. A retry must never re-run the checks and re-charge —
     it must get the first attempt back, whatever state it reached. */
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

  /* Autopay is started by the sweep, with no person behind it. The other two
     are started by somebody, and that somebody must belong to this partner. */
  if p_kind <> 'autopay' then
    if not (public.partner_group_of_profile(p_actor) = p_group
            or (public.is_staff_of(g.agency_id) and public.agency_can('partners.billing.manage'))) then
      raise exception 'You cannot pay for this partner' using errcode = '42501';
    end if;
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
    select * into prof from public.partner_payment_profiles
     where group_id = p_group and is_default;
    if prof.id is null then raise exception 'No card on file for this partner' using errcode = '22023'; end if;
    if p_kind = 'autopay' and not prof.autopay_enabled then
      raise exception 'Autopay is not switched on for this partner' using errcode = '42501';
    end if;
  end if;

  insert into public.partner_card_charges
    (agency_id, group_id, invoice_id, profile_id, kind, idempotency_key,
     amount_cents, currency, status, started_by)
  values (g.agency_id, p_group, p_invoice, prof.id, p_kind, p_idempotency_key,
          p_amount_cents, coalesce(i.currency, 'USD'), 'pending',
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

revoke all on function public.begin_partner_card_charge(uuid, uuid, bigint, text, text, uuid) from public, authenticated, anon;

-- ── Settling it ────────────────────────────────────────────────────────────

create or replace function public.settle_partner_card_charge(
  p_idempotency_key text,
  p_status          text,
  p_provider_txn    text,
  p_response_code   text,
  p_response_text   text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c       public.partner_card_charges%rowtype;
  i       public.partner_invoices%rowtype;
  v_owed  bigint;
  v_pay   uuid;
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
          'Card payment via Authorize.Net (' || replace(c.kind, '_', ' ') || ')',
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
      'amount_cents', c.amount_cents, 'kind', c.kind, 'provider_txn', p_provider_txn));

  return jsonb_build_object('status', 'approved', 'payment_id', v_pay,
    'provider_txn_id', p_provider_txn, 'already_settled', false);
end $$;

comment on function public.settle_partner_card_charge(text, text, text, text, text) is
  'Turns a verified Authorize.Net charge into a partner payment. Inserts the payment and lets partner_invoice_recompute move the invoice — it never writes amount_paid_cents itself. Idempotent on the attempt key.';

revoke all on function public.settle_partner_card_charge(text, text, text, text, text) from public, authenticated, anon;

-- ── What autopay owes today ────────────────────────────────────────────────

/* Read by the autopay sweep. A row here is an invoice that is due, unpaid, and
   belongs to a partner who switched autopay on and has a card. The key is
   derived from the invoice and the balance, so the same sweep run twice — or
   run twice in a day — produces one charge. */
create or replace function public.partner_autopay_due()
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
         'autopay:' || i.id::text || ':' || public.invoice_balance_cents(i.id)::text
    from public.partner_invoices i
    join public.partner_payment_profiles p
      on p.group_id = i.group_id and p.is_default and p.autopay_enabled
   where i.status in ('sent', 'overdue', 'partially_paid')
     and i.due_date <= current_date
     and public.invoice_balance_cents(i.id) > 0
   order by i.due_date, i.invoice_number
$$;

comment on function public.partner_autopay_due() is
  'Invoices autopay should charge today. The idempotency key is derived from the invoice and its balance, so a sweep that runs twice charges once.';

revoke all on function public.partner_autopay_due() from public, authenticated, anon;
