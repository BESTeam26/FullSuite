-- =============================================================================
-- An invoice cannot stay Paid with no payment behind it.
--
-- Dee: "Never simply change the invoice to Paid. Invoice status and Partner
-- balance derive from canonical payments."
--
-- `partner_invoice_recompute` already derived the status from the ledger for
-- every case it named — and then ended in `else v_current`, which quietly kept
-- whatever was there. So an invoice hand-set to `paid`, or left `paid` after
-- its only payment was deleted or refunded, stayed Paid: no balance, no
-- reminders, no chasing. On an invoice due TODAY it did not even fall through
-- to `overdue`, because that branch needs the due date to have passed.
--
-- The fallback is now explicit. With nothing collected, an invoice can only be
-- draft, scheduled, sent or overdue — never paid, partially paid or refunded.
--
-- Found by the billing probe, not by an invoice nobody chased.
-- =============================================================================

create or replace function public.partner_invoice_recompute(p_invoice uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_paid bigint;
  v_total bigint;
  v_status public.partner_invoice_status;
  v_due date;
  v_current public.partner_invoice_status;
begin
  if p_invoice is null then return; end if;

  select total_cents, due_date, status into v_total, v_due, v_current
    from public.partner_invoices where id = p_invoice;
  if not found then return; end if;

  /* Refunds reduce what was collected against the invoice; a refunded payment
     contributes nothing at all. */
  select coalesce(sum(case when status = 'succeeded'
                           then greatest(amount_cents - refund_amount_cents, 0)
                           else 0 end), 0)
    into v_paid
    from public.partner_payments where invoice_id = p_invoice;

  v_status := case
    /* Void and cancelled are decisions a person made. Money arriving does not
       silently reopen them. */
    when v_current in ('void', 'cancelled') then v_current
    when v_total > 0 and v_paid >= v_total then 'paid'
    when v_paid > 0 then 'partially_paid'
    /* Nothing collected. These are the only states that can be true, and the
       old `else v_current` is what let `paid` survive with an empty ledger. */
    when v_current = 'draft' then 'draft'
    when v_current = 'scheduled' then 'scheduled'
    when v_due < current_date then 'overdue'
    else 'sent'
  end;

  update public.partner_invoices
     set amount_paid_cents = v_paid,
         status = v_status,
         paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
   where id = p_invoice;
end;
$function$;
