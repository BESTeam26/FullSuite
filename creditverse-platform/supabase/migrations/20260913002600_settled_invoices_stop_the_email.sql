-- =============================================================================
-- A reminder that is no longer true does not get sent.
--
-- Dee, 2026-09-13: "payment before dispatch prevents an invalid overdue email
-- if the canonical event is no longer applicable."
--
-- The reminder is queued by the sweep and sent by the dispatcher up to five
-- minutes later. A partner who pays in between would otherwise receive a
-- demand for money they have already sent — which is worse than sending
-- nothing, because it costs their trust and somebody's afternoon.
--
-- The reminder EVENT still stands. It happened, it is history, and the portal
-- notification went. Only the email is stood down, in its own state, so the
-- record says "we decided not to send this" rather than losing it.
--
-- Deliberately NOT a re-check inside the Edge Function: that would put the
-- rule in TypeScript where a second caller could skip it, and the balance is a
-- database question with a database answer.
-- =============================================================================

alter table public.billing_email_outbox drop constraint if exists billing_email_outbox_state_check;
alter table public.billing_email_outbox add constraint billing_email_outbox_state_check
  check (state in ('pending', 'sent', 'failed', 'unavailable', 'superseded'));

comment on column public.billing_email_outbox.state is
  'pending · sent · failed · unavailable (no billing address) · superseded (the invoice was settled before this went out).';

/**
 * Stand down reminder emails whose invoice no longer owes anything.
 *
 * Only reminders. A receipt stays valid however the balance moves — the money
 * arrived, and saying so is still true.
 */
create or replace function public.billing_email_supersede_settled()
returns integer
language plpgsql security definer set search_path = public as $function$
declare v_count int;
begin
  with settled as (
    update public.billing_email_outbox o
       set state = 'superseded',
           last_error = 'Invoice settled before this was sent',
           updated_at = now()
     where o.kind = 'reminder'
       and o.state in ('pending', 'failed')
       and o.invoice_id is not null
       and (public.invoice_balance_cents(o.invoice_id) <= 0
         or exists (select 1 from public.partner_invoices i
                     where i.id = o.invoice_id and i.status in ('void', 'cancelled', 'paid')))
    returning o.reminder_id
  )
  select count(*) into v_count from settled;

  /* The reminder's own delivery state follows, so "was this emailed?" has one
     answer wherever it is asked. */
  update public.partner_invoice_reminders r
     set email_state = 'unavailable'
   where r.email_state = 'pending'
     and exists (select 1 from public.billing_email_outbox o
                  where o.reminder_id = r.id and o.state = 'superseded');

  return v_count;
end $function$;
revoke execute on function public.billing_email_supersede_settled() from public, anon;
grant execute on function public.billing_email_supersede_settled() to authenticated;

create or replace function public.billing_email_dispatch()
returns void
language plpgsql security definer set search_path = public, extensions, vault as $function$
declare
  v_url text;
  v_secret text;
begin
  /* Before anything is handed to the mailer, drop the ones that stopped being
     true. Cheap, and it is the difference between a partner who paid getting
     nothing and getting a demand. */
  perform public.billing_email_supersede_settled();

  if not exists (
    select 1 from public.billing_email_outbox
     where state in ('pending', 'failed') and attempts < 5 and to_email is not null
  ) then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'billing_email_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'billing_email_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform extensions.net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $function$;
revoke execute on function public.billing_email_dispatch() from public, anon;
grant execute on function public.billing_email_dispatch() to authenticated;
