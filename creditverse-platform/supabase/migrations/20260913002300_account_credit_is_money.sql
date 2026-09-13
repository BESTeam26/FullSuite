-- =============================================================================
-- Account Credit is MONEY. Processing Credits are UNITS. They are two ledgers.
--
-- Dee, 2026-09-13, and this is the distinction to get right before anything
-- else is built on it:
--
--   "Do NOT confuse monetary account credit with CreditOps processing credits.
--    These are TWO DIFFERENT LEDGERS. Account Credit = money. Processing
--    Credits = units/rounds. Keep them completely separate in schema and UI…
--    You will eventually have Partners with, for example, $100 account credit
--    and 7 processing credits at the same time. If both are called 'credits'
--    internally, that will become a billing mess very quickly."
--
-- So: different table, different column type, different word. `cents` here;
-- `quantity` in `partner_credit_ledger`. Nothing joins them, nothing sums
-- across them, and no view returns a column called `credits` that could mean
-- either.
--
-- ── WHERE IT COMES FROM ─────────────────────────────────────────────────────
--
-- Mostly overpayment. Dee: "Do not lose an overpayment. Invoice balance =
-- $400, Payment = $425, then $400 → invoice, $25 → Partner monetary account
-- credit." Also refunds BES chooses to hold rather than return, and goodwill.
--
-- ── WHERE IT GOES ───────────────────────────────────────────────────────────
--
-- Applying it to an invoice writes a payment of provider `other`, source
-- `reconciled`, so the invoice is settled through the SAME ledger as every
-- other payment. Account credit is a source of money, never a second way for
-- an invoice to become paid (the canonical model stays: Invoice → Payment
-- Ledger → Balance).
-- =============================================================================

create table if not exists public.partner_account_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  group_id uuid not null references public.outsourcing_groups(id) on delete cascade,

  kind text not null check (kind in (
    'overpayment',   -- money received beyond an invoice's balance
    'goodwill',      -- BES chose to credit them
    'refund_held',   -- a refund kept on account rather than returned
    'applied',       -- spent against an invoice
    'refunded_out',  -- paid back to them
    'adjustment'
  )),
  /** Positive adds money to the account, negative spends it. Never zero. */
  amount_cents bigint not null check (amount_cents <> 0),
  currency text not null default 'USD',

  description text,
  /** The payment that produced it, or the invoice it was applied to. */
  source_payment_id uuid references public.partner_payments(id) on delete set null,
  applied_invoice_id uuid references public.partner_invoices(id) on delete set null,
  applied_payment_id uuid references public.partner_payments(id) on delete set null,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.partner_account_credit_ledger is
  'MONEY held on a partner''s account, in cents. Deliberately NOT `partner_credit_ledger`, which counts CreditOps rounds. A partner may hold $100 here and 7 rounds there at the same time, and calling both "credits" is how that becomes a billing mess (Dee, 2026-09-13).';

create index if not exists partner_account_credit_by_partner
  on public.partner_account_credit_ledger (group_id, created_at desc);

alter table public.partner_account_credit_ledger enable row level security;
grant select on public.partner_account_credit_ledger to authenticated;

drop policy if exists partner_account_credit_select on public.partner_account_credit_ledger;
create policy partner_account_credit_select on public.partner_account_credit_ledger
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.view'));

/* No insert, update or delete policy. Money on account moves through the
   audited functions below — an overpayment is produced by a payment, and
   applying it produces a payment. A hand-written row would be money from
   nowhere. */

create or replace view public.partner_account_credit_balance as
  select group_id,
         currency,
         sum(amount_cents) filter (where amount_cents > 0)::bigint       as added_cents,
         abs(sum(amount_cents) filter (where amount_cents < 0))::bigint  as used_cents,
         sum(amount_cents)::bigint                                       as available_cents,
         max(created_at)                                                 as last_movement
    from public.partner_account_credit_ledger
   group by group_id, currency;

alter view public.partner_account_credit_balance set (security_invoker = true);
grant select on public.partner_account_credit_balance to authenticated;

/**
 * Record a payment, and keep whatever it did not need.
 *
 * Replaces the earlier `record_partner_payment`. Everything about it is the
 * same except the last step: when the amount exceeds what the invoice still
 * owed, the excess is written to the partner's ACCOUNT CREDIT rather than
 * silently inflating `amount_paid_cents` past the total.
 *
 * The payment itself is recorded at its FULL amount — the money that arrived
 * is the money that arrived — and `partner_invoice_recompute` already caps the
 * invoice at its total. The difference is the credit.
 */
create or replace function public.record_partner_payment(
  p_group uuid,
  p_amount_cents bigint,
  p_provider public.partner_payment_provider,
  p_invoice uuid default null,
  p_paid_on date default current_date,
  p_reference text default null,
  p_note text default null,
  p_currency text default 'USD'
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  g public.outsourcing_groups%rowtype;
  i public.partner_invoices%rowtype;
  v_id uuid;
  v_state text;
  v_owed bigint;
  v_excess bigint;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;

  if not (public.is_staff_of(g.agency_id) and public.agency_can('partners.payments.record')) then
    raise exception 'Recording a payment is owner-granted' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A payment needs an amount' using errcode = '22023';
  end if;

  if p_invoice is not null then
    /* Locked, so the balance this reads is the balance it acts on. */
    select * into i from public.partner_invoices where id = p_invoice for update;
    if i.id is null then
      raise exception 'That invoice does not exist' using errcode = '22023';
    end if;
    if i.group_id <> p_group then
      raise exception 'That invoice belongs to a different partner' using errcode = '22023';
    end if;
    v_owed := public.invoice_balance_cents(p_invoice);
  end if;

  v_state := case when p_invoice is null then 'review_required' else 'matched' end;

  insert into public.partner_payments
    (agency_id, group_id, invoice_id, provider, provider_transaction_id, amount_cents,
     currency, paid_on, status, method, source, reconciliation_state,
     reconciled_at, notes, recorded_by)
  values (g.agency_id, p_group, p_invoice, p_provider, nullif(btrim(coalesce(p_reference, '')), ''),
          p_amount_cents, coalesce(p_currency, 'USD'), coalesce(p_paid_on, current_date),
          'succeeded', initcap(replace(p_provider::text, '_', ' ')), 'manual', v_state,
          case when p_invoice is null then null else now() end,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  /* Whatever the invoice did not need is the partner's money, not a rounding
     error. Kept as ACCOUNT CREDIT — cents, its own ledger, its own word. */
  if p_invoice is not null and v_owed is not null and p_amount_cents > v_owed then
    v_excess := p_amount_cents - v_owed;
    insert into public.partner_account_credit_ledger
      (agency_id, group_id, kind, amount_cents, currency, description,
       source_payment_id, created_by)
    values (g.agency_id, p_group, 'overpayment', v_excess, coalesce(p_currency, 'USD'),
            'Overpayment on ' || coalesce(i.invoice_number, 'an invoice'), v_id, auth.uid());
  end if;

  if p_invoice is not null then
    perform public.billing_reactivation_sweep();
  end if;

  perform public.log_audit('partner.payment_recorded', 'partner_payment', v_id::text, null, null,
    jsonb_build_object('partner', p_group, 'invoice', p_invoice, 'amount_cents', p_amount_cents,
                       'provider', p_provider, 'reference', p_reference, 'state', v_state,
                       'account_credit_cents', coalesce(v_excess, 0)));
  return v_id;
end $function$;
revoke execute on function public.record_partner_payment(uuid, bigint, public.partner_payment_provider, uuid, date, text, text, text) from public, anon;
grant execute on function public.record_partner_payment(uuid, bigint, public.partner_payment_provider, uuid, date, text, text, text) to authenticated;

/**
 * Spend account credit on an invoice.
 *
 * Produces a real payment, so the invoice is settled the same way every other
 * invoice is settled and the ledger tells the whole story. Refuses to spend
 * more than is held, and more than the invoice owes.
 */
create or replace function public.apply_account_credit(
  p_group uuid, p_invoice uuid, p_amount_cents bigint default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  g public.outsourcing_groups%rowtype;
  i public.partner_invoices%rowtype;
  v_available bigint;
  v_owed bigint;
  v_amount bigint;
  v_payment uuid;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;
  if not (public.is_staff_of(g.agency_id) and public.agency_can('partners.payments.record')) then
    raise exception 'Applying account credit is owner-granted' using errcode = '42501';
  end if;

  select * into i from public.partner_invoices where id = p_invoice for update;
  if i.id is null then raise exception 'That invoice does not exist' using errcode = '22023'; end if;
  if i.group_id <> p_group then
    raise exception 'That invoice belongs to a different partner' using errcode = '22023';
  end if;

  select coalesce(sum(amount_cents), 0) into v_available
    from public.partner_account_credit_ledger where group_id = p_group;
  v_owed := public.invoice_balance_cents(p_invoice);
  v_amount := least(coalesce(p_amount_cents, v_owed), v_available, v_owed);

  if v_amount <= 0 then
    raise exception 'There is nothing to apply — % on account, % owed', v_available, v_owed
      using errcode = '22023';
  end if;

  insert into public.partner_payments
    (agency_id, group_id, invoice_id, provider, amount_cents, currency, paid_on, status,
     method, source, reconciliation_state, reconciled_at, notes, recorded_by)
  values (g.agency_id, p_group, p_invoice, 'other', v_amount, coalesce(i.currency, 'USD'),
          current_date, 'succeeded', 'Account credit', 'reconciled', 'matched', now(),
          'Applied from account credit', auth.uid())
  returning id into v_payment;

  insert into public.partner_account_credit_ledger
    (agency_id, group_id, kind, amount_cents, currency, description,
     applied_invoice_id, applied_payment_id, created_by)
  values (g.agency_id, p_group, 'applied', -v_amount, coalesce(i.currency, 'USD'),
          'Applied to ' || i.invoice_number, p_invoice, v_payment, auth.uid());

  perform public.billing_reactivation_sweep();

  perform public.log_audit('partner.account_credit_applied', 'partner_invoice', p_invoice::text, null,
    jsonb_build_object('available_cents', v_available),
    jsonb_build_object('applied_cents', v_amount, 'payment', v_payment));
  return v_payment;
end $function$;
revoke execute on function public.apply_account_credit(uuid, uuid, bigint) from public, anon;
grant execute on function public.apply_account_credit(uuid, uuid, bigint) to authenticated;
