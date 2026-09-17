-- Finance → Payments: the canonical payment ledger, read in one query.
--
-- Dee: "Money received across all Partners." Today the only way to see a
-- payment is to open the partner who made it, which answers the wrong
-- question. This is the same rows, read across every partner — not a copy, not
-- a report table, and nothing here writes anything.
--
-- ── A REFUND DOES NOT DELETE A PAYMENT ────────────────────────────────────
--
-- "Never delete financial history to make a refund disappear." So a refunded
-- payment is still a row, with what came in and what went back out beside each
-- other. The status says refunded; the history stays.

create or replace function public.finance_payments(
  p_limit integer default 200,
  p_from  date default null,
  p_to    date default null)
returns table (
  id                   uuid,
  paid_on              date,
  group_id             uuid,
  partner_name         text,
  invoice_id           uuid,
  invoice_number       text,
  amount_cents         bigint,
  refund_amount_cents  bigint,
  currency             text,
  method               text,
  provider             text,
  reference            text,
  status               text,
  reconciliation_state text,
  environment          text,
  source               text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_agency uuid;
begin
  select a.id into v_agency from public.agencies a order by a.created_at limit 1;
  if not (public.is_staff_of(v_agency)
          and (public.agency_can('billing.view') or public.agency_can('partners.payments.record'))) then
    raise exception 'Payments are not part of your access' using errcode = '42501';
  end if;

  return query
  select p.id, p.paid_on, p.group_id, g.name, p.invoice_id, i.invoice_number,
         p.amount_cents, p.refund_amount_cents, p.currency,
         coalesce(p.method, initcap(replace(p.provider::text, '_', ' '))),
         p.provider::text, p.provider_transaction_id, p.status::text,
         p.reconciliation_state,
         /* A sandbox card payment is a test, and the ledger says so rather
            than leaving somebody to work it out from the note. */
         (select c.environment from public.partner_card_charges c where c.payment_id = p.id),
         p.source
    from public.partner_payments p
    join public.outsourcing_groups g on g.id = p.group_id
    left join public.partner_invoices i on i.id = p.invoice_id
   where (p_from is null or p.paid_on >= p_from)
     and (p_to   is null or p.paid_on <= p_to)
   order by p.paid_on desc, p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
end $$;

comment on function public.finance_payments(integer, date, date) is
  'Every payment across every partner, newest first. The same canonical rows the partner profile and the portal show — one payment, three views.';

revoke all on function public.finance_payments(integer, date, date) from public;
grant execute on function public.finance_payments(integer, date, date) to authenticated;

-- ── Payment matching ───────────────────────────────────────────────────────

/* A payment that arrived without an invoice to sit against, and the invoices
   it might belong to. The suggestion is arithmetic — same partner, open, and
   the amount matches — and it is a SUGGESTION: the match itself is somebody's
   deliberate act, and audited. */
create or replace function public.finance_unmatched_payments()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_agency uuid;
  v_out jsonb;
begin
  select a.id into v_agency from public.agencies a order by a.created_at limit 1;
  if not (public.is_staff_of(v_agency) and public.agency_can('partners.payments.record')) then
    raise exception 'Payment matching is owner-granted' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'id', p.id, 'paid_on', p.paid_on, 'group_id', p.group_id,
      'partner_name', g.name, 'amount_cents', p.amount_cents, 'currency', p.currency,
      'method', coalesce(p.method, initcap(replace(p.provider::text, '_', ' '))),
      'reference', p.provider_transaction_id, 'notes', p.notes,
      'candidates', (
        select coalesce(jsonb_agg(c order by c->>'confidence' desc), '[]'::jsonb) from (
          select jsonb_build_object(
            'invoice_id', i.id, 'invoice_number', i.invoice_number,
            'due_date', i.due_date, 'balance_cents', public.invoice_balance_cents(i.id),
            /* Exact amount on the same partner is as good as an automatic
               guess gets. Anything else is "have a look". */
            'confidence', case
              when public.invoice_balance_cents(i.id) = p.amount_cents then 'high'
              when p.provider_transaction_id is not null
                   and i.invoice_number ilike '%' || right(p.provider_transaction_id, 4) then 'medium'
              else 'low' end) as c
            from public.partner_invoices i
           where i.group_id = p.group_id
             and i.status in ('sent', 'overdue', 'partially_paid')
             and public.invoice_balance_cents(i.id) > 0
           limit 8) x)
    ) as row
      from public.partner_payments p
      join public.outsourcing_groups g on g.id = p.group_id
     where p.status = 'succeeded'
       and p.reconciliation_state = 'review_required'
     order by p.paid_on desc
     limit 100) y;

  return v_out;
end $$;

comment on function public.finance_unmatched_payments() is
  'Payments with no invoice behind them, each with the invoices it might belong to. Suggestions only — the match is a deliberate, audited act.';

revoke all on function public.finance_unmatched_payments() from public;
grant execute on function public.finance_unmatched_payments() to authenticated;

/* Attaching a payment to an invoice. Owner-granted, audited, and it moves the
   invoice by the same recompute every other payment uses. */
create or replace function public.match_partner_payment(p_payment uuid, p_invoice uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.partner_payments%rowtype;
  i public.partner_invoices%rowtype;
begin
  select * into p from public.partner_payments where id = p_payment for update;
  if p.id is null then raise exception 'That payment does not exist' using errcode = '22023'; end if;
  if not (public.is_staff_of(p.agency_id) and public.agency_can('partners.payments.record')) then
    raise exception 'Matching a payment is owner-granted' using errcode = '42501';
  end if;
  if p.invoice_id is not null then
    raise exception 'That payment is already matched' using errcode = '22023';
  end if;

  select * into i from public.partner_invoices where id = p_invoice for update;
  if i.id is null then raise exception 'That invoice does not exist' using errcode = '22023'; end if;
  /* The money belongs to whoever sent it. Moving it onto another partner's
     invoice would settle the wrong debt with the wrong person's money. */
  if i.group_id <> p.group_id then
    raise exception 'That invoice belongs to a different partner' using errcode = '22023';
  end if;

  update public.partner_payments
     set invoice_id = p_invoice, reconciliation_state = 'matched',
         reconciled_at = now(), updated_at = now()
   where id = p_payment;

  perform public.log_audit('partner.payment_matched', 'partner_payment', p_payment::text,
    jsonb_build_object('invoice', null, 'state', p.reconciliation_state),
    jsonb_build_object('invoice', p_invoice, 'state', 'matched'),
    jsonb_build_object('partner', p.group_id, 'amount_cents', p.amount_cents,
                       'invoice_number', i.invoice_number));
end $$;

comment on function public.match_partner_payment(uuid, uuid) is
  'Attach an unmatched payment to one of that partner''s open invoices. Owner-granted and audited; the invoice moves by the same recompute trigger as every other payment.';

revoke all on function public.match_partner_payment(uuid, uuid) from public;
grant execute on function public.match_partner_payment(uuid, uuid) to authenticated;
