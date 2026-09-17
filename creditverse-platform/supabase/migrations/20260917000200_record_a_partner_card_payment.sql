-- A verified charge becomes a paid invoice.
--
-- This is the only thing that may credit a partner invoice from a card, and it
-- is deliberately narrow: it is SECURITY DEFINER, it is granted to nobody, and
-- only the payments Edge Function reaches it with the service role.
--
-- ── WHY NOT record_partner_payment ─────────────────────────────────────────
--
-- That function requires `partners.payments.record`, which is owner-gated and
-- means "record any payment against any partner". A partner paying their own
-- invoice does not have it and must never be given it. So this records on the
-- system's behalf and does its own checking — that the invoice exists, that it
-- belongs to the partner being charged, and that it is still owed.
--
-- ── IDEMPOTENT, BECAUSE THE CALLER WILL RETRY ──────────────────────────────
--
-- Networks time out after the money has moved. The Edge Function cannot know
-- whether a timed-out charge succeeded, so it retries — and this must answer
-- the second call with the first call's result rather than crediting twice.
-- Keyed on the attempt, which is unique.

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
  c        public.partner_card_charges%rowtype;
  i        public.partner_invoices%rowtype;
  v_owed   bigint;
  v_apply  bigint;
  v_pay    uuid;
begin
  /* Locked: two callers settling the same attempt must not both credit it. */
  select * into c from public.partner_card_charges
   where idempotency_key = p_idempotency_key for update;

  if c.id is null then
    raise exception 'No such charge attempt' using errcode = 'P0002';
  end if;

  /* Already settled. Answer with what happened the first time — the second
     caller is a retry of a call that already succeeded, not a new charge. */
  if c.status <> 'pending' then
    return jsonb_build_object(
      'status', c.status, 'payment_id', c.payment_id,
      'provider_txn_id', c.provider_txn_id, 'already_settled', true);
  end if;

  update public.partner_card_charges
     set status = p_status, provider_txn_id = p_provider_txn,
         response_code = p_response_code, response_text = p_response_text,
         updated_at = now()
   where id = c.id;

  /* Only an approval moves money. A decline is recorded and nothing else. */
  if p_status <> 'approved' then
    return jsonb_build_object('status', p_status, 'payment_id', null,
                              'provider_txn_id', p_provider_txn, 'already_settled', false);
  end if;

  if c.invoice_id is not null then
    select * into i from public.partner_invoices where id = c.invoice_id for update;
    if i.id is null then
      raise exception 'That invoice no longer exists' using errcode = '22023';
    end if;
    /* The charge said which partner. The invoice must agree, or the money
       lands on somebody else's account. */
    if i.group_id <> c.group_id then
      raise exception 'That invoice belongs to a different partner' using errcode = '22023';
    end if;
    v_owed := public.invoice_balance_cents(i.id);
  end if;

  insert into public.partner_payments (
    agency_id, group_id, invoice_id, provider, provider_transaction_id,
    amount_cents, currency, paid_on, status, method, source,
    reconciliation_state, notes)
  values (
    c.agency_id, c.group_id, c.invoice_id, 'authorize_net', p_provider_txn,
    c.amount_cents, c.currency, current_date, 'succeeded', 'card', 'provider_webhook',
    /* Matched when it lands on an invoice; otherwise somebody has to look. */
    case when c.invoice_id is null then 'review_required' else 'matched' end,
    'Card payment via Authorize.Net (' || c.kind || ')')
  returning id into v_pay;

  update public.partner_card_charges set payment_id = v_pay, updated_at = now() where id = c.id;

  /* An overpayment is kept as account credit rather than silently absorbed —
     the same treatment a manual overpayment already gets. */
  if c.invoice_id is not null then
    v_apply := least(c.amount_cents, greatest(coalesce(v_owed, 0), 0));
    update public.partner_invoices
       set amount_paid_cents = coalesce(amount_paid_cents, 0) + v_apply,
           status = case
             when coalesce(amount_paid_cents, 0) + v_apply >= total_cents then 'paid'
             else 'partially_paid' end,
           paid_at = case
             when coalesce(amount_paid_cents, 0) + v_apply >= total_cents then now()
             else paid_at end,
           updated_at = now()
     where id = c.invoice_id;
  end if;

  return jsonb_build_object('status', 'approved', 'payment_id', v_pay,
                            'provider_txn_id', p_provider_txn, 'already_settled', false);
end $$;

comment on function public.settle_partner_card_charge(text, text, text, text, text) is
  'Turns a verified Authorize.Net charge into a partner payment and moves the invoice. SECURITY DEFINER and granted to NOBODY — only the payments function reaches it, with the service role. Idempotent on the attempt key.';

/* Granted to nobody on purpose. `authenticated` must not be able to declare a
   charge approved; only the function that actually spoke to the provider may. */
revoke all on function public.settle_partner_card_charge(text, text, text, text, text) from public;
revoke all on function public.settle_partner_card_charge(text, text, text, text, text) from authenticated;
revoke all on function public.settle_partner_card_charge(text, text, text, text, text) from anon;
