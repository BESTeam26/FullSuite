-- =============================================================================
-- Recording a payment that arrived somewhere else.
--
-- Dee: "This must create a real payment ledger entry. Never simply change the
-- invoice to Paid. Invoice status and Partner balance derive from canonical
-- payments."
--
-- That is already how it works — `partner_payment_touches_invoice` recomputes
-- the invoice from its payments — so this adds the ACT, not a second path. The
-- function below is the only way a manual payment should be recorded, because
-- it does the four things that must happen together: write the ledger entry,
-- let the invoice recompute, attach the proof, and reconsider a suspension.
--
-- ── DO NOT GUESS ────────────────────────────────────────────────────────────
--
-- Dee §23: "If an automated payment event cannot safely match to an invoice:
-- do NOT guess." A payment with no invoice is recorded all the same — the
-- money did arrive — and lands in `payment_matching_review` with
-- `reconciliation_state = 'review_required'`. Nothing about it touches a
-- partner's balance until a person says which invoice it belongs to.
-- =============================================================================

/**
 * Record a payment BES received outside the platform.
 *
 * Wise, PayPal, a bank transfer, a cheque, or an Authorize.Net charge somebody
 * took over the phone. The provider is recorded because reconciliation later
 * depends on knowing where to look, not because the platform behaves
 * differently for each.
 *
 * Returns the payment id. The invoice and the partner's balance follow from
 * it, never the other way round.
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
    select * into i from public.partner_invoices where id = p_invoice;
    if i.id is null then
      raise exception 'That invoice does not exist' using errcode = '22023';
    end if;
    if i.group_id <> p_group then
      /* The one mismatch worth refusing outright: crediting one partner's
         money to another's invoice is not something to review later. */
      raise exception 'That invoice belongs to a different partner' using errcode = '22023';
    end if;
  end if;

  /* No invoice named means nobody has decided where it goes. It is money that
     arrived, and it waits in review rather than being applied to a guess. */
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

  /* The invoice recomputed itself through the trigger. If that settled every
     invoice behind a suspension, lift it — a partner who has paid should not
     wait for the next hourly sweep to get their team back. */
  if p_invoice is not null then
    perform public.billing_reactivation_sweep();
  end if;

  perform public.log_audit('partner.payment_recorded', 'partner_payment', v_id::text, null, null,
    jsonb_build_object('partner', p_group, 'invoice', p_invoice, 'amount_cents', p_amount_cents,
                       'provider', p_provider, 'reference', p_reference, 'state', v_state));
  return v_id;
end $function$;
revoke execute on function public.record_partner_payment(uuid, bigint, public.partner_payment_provider, uuid, date, text, text, text) from public, anon;
grant execute on function public.record_partner_payment(uuid, bigint, public.partner_payment_provider, uuid, date, text, text, text) to authenticated;

/**
 * Money that arrived and nobody has placed yet.
 *
 * `security_invoker`, so it is exactly the payments the reader may already
 * see. The count is the queue; the rows are the evidence somebody needs to
 * decide — who paid, how much, through what, and when.
 */
create or replace view public.payment_matching_review as
  select p.id, p.agency_id, p.group_id, g.name as partner_name,
         p.provider, p.provider_transaction_id, p.amount_cents, p.currency,
         p.paid_on, p.notes, p.source, p.created_at,
         coalesce(nullif(btrim(pr.full_name), ''), pr.email) as recorded_by_name,
         /* The invoices it COULD be, so a person is choosing rather than
            searching. Same partner, still owing, closest amount first. */
         (select jsonb_agg(x order by x->>'rank')
            from (
              select jsonb_build_object(
                       'invoice_id', i.id, 'invoice_number', i.invoice_number,
                       'balance_cents', public.invoice_balance_cents(i.id),
                       'due_date', i.due_date,
                       'rank', abs(public.invoice_balance_cents(i.id) - p.amount_cents)) as x
                from public.partner_invoices i
               where i.group_id = p.group_id
                 and i.status not in ('void', 'cancelled', 'paid')
                 and public.invoice_balance_cents(i.id) > 0
               limit 5
            ) c) as candidate_invoices
    from public.partner_payments p
    join public.outsourcing_groups g on g.id = p.group_id
    left join public.profiles pr on pr.id = p.recorded_by
   where p.invoice_id is null
     and p.status = 'succeeded'
     and p.reconciliation_state <> 'matched';

alter view public.payment_matching_review set (security_invoker = true);
comment on view public.payment_matching_review is
  'Payments that arrived without an invoice. Candidate invoices are OFFERED, never applied — Dee §23: "do NOT guess" (2026-09-13).';
grant select on public.payment_matching_review to authenticated;

/**
 * Place a payment against an invoice, deliberately.
 *
 * The one act that resolves the review queue. Refuses the cross-partner
 * mismatch for the same reason `record_partner_payment` does.
 */
create or replace function public.match_partner_payment(
  p_payment uuid, p_invoice uuid, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  p public.partner_payments%rowtype;
  i public.partner_invoices%rowtype;
begin
  select * into p from public.partner_payments where id = p_payment;
  if p.id is null then raise exception 'That payment does not exist' using errcode = '22023'; end if;
  if not (public.is_staff_of(p.agency_id) and public.agency_can('partners.payments.record')) then
    raise exception 'Matching a payment is owner-granted' using errcode = '42501';
  end if;

  select * into i from public.partner_invoices where id = p_invoice;
  if i.id is null then raise exception 'That invoice does not exist' using errcode = '22023'; end if;
  if i.group_id <> p.group_id then
    raise exception 'That invoice belongs to a different partner' using errcode = '22023';
  end if;

  update public.partner_payments
     set invoice_id = p_invoice,
         reconciliation_state = 'matched',
         reconciled_at = now(),
         notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), notes),
         updated_at = now()
   where id = p_payment;

  perform public.billing_reactivation_sweep();

  perform public.log_audit('partner.payment_matched', 'partner_payment', p_payment::text, null,
    jsonb_build_object('invoice', p.invoice_id, 'state', p.reconciliation_state),
    jsonb_build_object('invoice', p_invoice, 'state', 'matched', 'note', p_note));
end $function$;
revoke execute on function public.match_partner_payment(uuid, uuid, text) from public, anon;
grant execute on function public.match_partner_payment(uuid, uuid, text) to authenticated;
