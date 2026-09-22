/*
 * Delete the invoices created prior — and nothing else
 * =====================================================
 * Dee, 2026-09-22: "Delete all invoices in the platform. Not the capability,
 * but just the invoices created prior."
 *
 * Seventeen invoices, $3,819 nominal, ZERO payments recorded against any of
 * them (partner_payments, partner_payment_events and payment_transactions are
 * all empty), so no payment history is destroyed by this. Five were [TEST]
 * fixtures. The full contents — every invoice, its lines, its reminders and
 * every email that went out — were exported first and handed to Dee, because
 * eight overdue reminders did reach a real external partner address and BES
 * should still be able to say what a partner received if they ask. That export
 * is deliberately NOT in this repository: it lists partner email addresses and
 * amounts owed, which do not belong in source control (rule 1).
 *
 * One DELETE does the whole job: partner_invoice_lines,
 * partner_invoice_reminders, partner_suspension_invoices and
 * billing_email_outbox all cascade from partner_invoices, and
 * billing_email_outbox holds no row that is not tied to an invoice.
 *
 * KEPT DELIBERATELY:
 *   billing_reminder_schedule  the day 1/2/3/5/7 dunning POLICY. Configuration
 *                              of the capability, not an invoice. Deleting it
 *                              would mean rebuilding the schedule by hand the
 *                              day invoicing comes back in-platform.
 *
 * Every table, function, policy, RPC, route and button is untouched. This
 * migration removes rows.
 *
 * Cost impact: no material increase.
 */

begin;

/* The one payment ATTEMPT on file: an autopay charge that errored against an
   Authorize.Net sandbox placeholder profile, for a [TEST] invoice. It is an
   artefact of the invoice it names and its FK is ON DELETE SET NULL, so left
   alone it would outlive the invoice as an orphan charge for $250 that never
   happened. Real charges are not deleted by this clause — there are none, and
   the WHERE proves it rather than assuming it. */
delete from public.partner_card_charges
where status = 'error'
  and provider_txn_id is null
  and payment_id is null
  and invoice_id in (select id from public.partner_invoices);

delete from public.partner_invoices;

do $$
declare
  n_inv int; n_line int; n_rem int; n_out int; n_susp int; n_sched int;
begin
  select count(*) into n_inv  from public.partner_invoices;
  select count(*) into n_line from public.partner_invoice_lines;
  select count(*) into n_rem  from public.partner_invoice_reminders;
  select count(*) into n_out  from public.billing_email_outbox;
  select count(*) into n_susp from public.partner_suspension_invoices;
  select count(*) into n_sched from public.billing_reminder_schedule;

  if n_inv + n_line + n_rem + n_out + n_susp <> 0 then
    raise exception 'invoices not fully removed: % invoices, % lines, % reminders, % outbox, % suspension',
      n_inv, n_line, n_rem, n_out, n_susp;
  end if;

  /* The capability's configuration must SURVIVE. If the cascade ever reached
     it, this migration is wrong and must not commit. */
  if n_sched = 0 then
    raise exception 'the reminder schedule was deleted; it is policy, not an invoice';
  end if;

  raise notice 'invoices cleared; reminder policy intact (% stages)', n_sched;
end $$;

commit;
