/*
 * Invoicing moves to GoHighLevel — stop generating, keep the machinery
 * =====================================================================
 * Dee, 2026-09-22: "I will have all my invoicing automated in GHL for now.
 * Stop all invoice generation for now. Delete all invoices in the platform.
 * Not the capability, but just the invoices created prior."
 *
 * So this migration turns the ENGINE OFF and leaves it installed. Nothing is
 * dropped: every table, function, policy, page and button survives, and the
 * reminder policy rows (day 1 / 2 / 3 / 5 / 7) stay because they are the
 * capability's configuration, not an invoice.
 *
 * Five scheduled jobs generate invoices or chase them. Deactivating is
 * reversible in one statement per job; unscheduling would throw the schedule
 * away and make "turn it back on" a guess at five cron expressions.
 *
 *   billing-recurring-sweep     10 5 * * *   creates the next period's invoice
 *   billing-reminder-sweep      25 * * * *   queues dunning email for overdue
 *   billing-email-dispatch      every 5 min  sends what the outbox holds
 *   billing-reactivation-sweep  40 * * * *   lifts suspension after payment
 *   partner-autopay-sweep       20 6 * * *   charges a card on file
 *
 * Why all five and not only the first: leaving the reminder sweep running
 * would keep emailing partners about invoices that no longer exist, and
 * leaving autopay running would keep attempting card charges for them. The
 * dispatcher reads billing_email_outbox alone, so no other email — invitation,
 * notification — travels this path and none is affected.
 *
 * Cost impact: no material increase. This removes 5 scheduled jobs, one of
 * them running every 5 minutes, so recurring function invocations go DOWN.
 */

do $$
declare
  j text;
  n int := 0;
begin
  foreach j in array array[
    'billing-recurring-sweep',
    'billing-reminder-sweep',
    'billing-email-dispatch',
    'billing-reactivation-sweep',
    'partner-autopay-sweep'
  ] loop
    /* Idempotent: a job already off, or already removed, is not an error. */
    if exists (select 1 from cron.job where jobname = j and active) then
      perform cron.alter_job((select jobid from cron.job where jobname = j), active := false);
      n := n + 1;
    end if;
  end loop;
  raise notice 'billing jobs deactivated: %', n;
end $$;

comment on table public.partner_invoices is
  'Partner invoices. PAUSED 2026-09-22 — Dee runs invoicing in GoHighLevel for now; '
  'the five billing cron jobs are deactivated and this table was emptied. The engine '
  'is intact: reactivate the jobs (cron.alter_job(..., active := true)) to resume.';
