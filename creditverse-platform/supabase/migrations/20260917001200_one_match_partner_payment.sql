-- One `match_partner_payment`, not two.
--
-- 20260917001100 added `match_partner_payment(uuid, uuid)` without checking
-- whether one already existed. It did: `match_partner_payment(uuid, uuid, text)`
-- with the note defaulting to null — so both were callable with two arguments
-- and Postgres refused every call as ambiguous (42725). Payment matching was
-- broken for everybody, including the owner, from the moment that migration
-- applied. The Finance probe caught it on its first run.
--
-- Rule 6, exactly: search for an existing implementation, reuse or improve it,
-- do not create a parallel one. So the new function is dropped and the
-- existing one keeps the two things the new one had that it lacked:
--
--   - the rows are LOCKED before they are read. Without `for update`, two
--     people matching the same payment at the same moment both read it as
--     unmatched and both attach it, and the second silently overwrites the
--     first's invoice.
--   - an already-matched payment is refused rather than moved. Re-matching is
--     not a correction; it is one payment settling two different invoices in
--     the audit trail.

drop function if exists public.match_partner_payment(uuid, uuid);

create or replace function public.match_partner_payment(
  p_payment uuid, p_invoice uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.partner_payments%rowtype;
  i public.partner_invoices%rowtype;
begin
  /* Locked: the state this reads is the state it acts on. */
  select * into p from public.partner_payments where id = p_payment for update;
  if p.id is null then raise exception 'That payment does not exist' using errcode = '22023'; end if;
  if not (public.is_staff_of(p.agency_id) and public.agency_can('partners.payments.record')) then
    raise exception 'Matching a payment is owner-granted' using errcode = '42501';
  end if;
  /* Moving a matched payment is not a correction — it settles two invoices in
     the history with one payment. Unmatch deliberately, then match again. */
  if p.invoice_id is not null then
    raise exception 'That payment is already matched to an invoice' using errcode = '22023';
  end if;

  select * into i from public.partner_invoices where id = p_invoice for update;
  if i.id is null then raise exception 'That invoice does not exist' using errcode = '22023'; end if;
  /* The money belongs to whoever sent it. Putting it on another partner's
     invoice settles the wrong debt with the wrong person's money. */
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

  /* The invoice recompute runs on the trigger; this is the other consequence:
     a partner suspended for non-payment may now be clear. */
  perform public.billing_reactivation_sweep();

  perform public.log_audit('partner.payment_matched', 'partner_payment', p_payment::text, null,
    jsonb_build_object('invoice', p.invoice_id, 'state', p.reconciliation_state),
    jsonb_build_object('invoice', p_invoice, 'state', 'matched', 'note', p_note));
end $$;

comment on function public.match_partner_payment(uuid, uuid, text) is
  'Attach an unmatched payment to one of that partner''s invoices. Owner-granted, row-locked, audited, and refuses a payment that is already matched.';

revoke all on function public.match_partner_payment(uuid, uuid, text) from public;
grant execute on function public.match_partner_payment(uuid, uuid, text) to authenticated;
