-- Refuse first, then look.
--
-- `match_partner_payment` loaded the payment before it checked the caller's
-- capability, so somebody with no financial access learned whether a payment
-- id existed: a real id answered "that payment is already matched", an invented
-- one answered "that payment does not exist". Two different answers to a
-- person who should get one.
--
-- Small, and worth closing because it is free: the capability does not depend
-- on which payment it is. The tenancy check still happens after the row is
-- read, because THAT one genuinely needs to know which agency owns it.
--
-- Found by the Finance probe, which could not tell an authorised refusal from
-- an unauthorised one — the test was right and the function was wrong.

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
  /* Asked before anything is read, so an unauthorised caller learns nothing
     about which ids are real. */
  if not (public.is_agency_staff() and public.agency_can('partners.payments.record')) then
    raise exception 'Matching a payment is owner-granted' using errcode = '42501';
  end if;

  /* Locked: the state this reads is the state it acts on. */
  select * into p from public.partner_payments where id = p_payment for update;
  if p.id is null then raise exception 'That payment does not exist' using errcode = '22023'; end if;
  /* Which agency owns it genuinely needs the row. */
  if not public.is_staff_of(p.agency_id) then
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

  perform public.billing_reactivation_sweep();

  perform public.log_audit('partner.payment_matched', 'partner_payment', p_payment::text, null,
    jsonb_build_object('invoice', p.invoice_id, 'state', p.reconciliation_state),
    jsonb_build_object('invoice', p_invoice, 'state', 'matched', 'note', p_note));
end $$;

revoke all on function public.match_partner_payment(uuid, uuid, text) from public;
grant execute on function public.match_partner_payment(uuid, uuid, text) to authenticated;
