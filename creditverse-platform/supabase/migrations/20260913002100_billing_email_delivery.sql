-- =============================================================================
-- Reminders and receipts actually reach the partner.
--
-- Dee: "Email and portal notification must come from the SAME canonical
-- reminder event. Do not let email have a separate reminder schedule."
--
-- So email is not a second scheduler. The reminder row created by
-- `billing_reminder_sweep` remains the one event and the one idempotency
-- source; this adds an OUTBOX row pointing at it. A cron rerun cannot send
-- twice because it cannot create a second reminder, and a dispatch rerun
-- cannot send twice because `dedupe_key` is unique.
--
-- ── WHEN THERE IS NOWHERE TO SEND IT ────────────────────────────────────────
--
-- Dee: "If no valid billing/primary contact email exists: do NOT pretend the
-- email was delivered." The outbox row is still created, in state
-- `unavailable`, so the gap is a record somebody can act on rather than
-- silence. The portal notification is unaffected — a partner with an account
-- and no email still gets told.
--
-- ── THE QUEUE PATTERN IS THE ONE ALREADY HERE ───────────────────────────────
--
-- Table + `pg_cron` + `net.http_post` to an Edge Function, secrets in the
-- Vault. Exactly how `ghl_outbound_dispatch` works. The mail provider itself
-- is the one FullSuite already uses; nothing here is a second email service.
-- =============================================================================

alter table public.partner_invoice_reminders
  add column if not exists email_state text
    check (email_state in ('pending', 'sent', 'failed', 'unavailable')),
  add column if not exists email_to text,
  add column if not exists email_sent_at timestamptz;

comment on column public.partner_invoice_reminders.email_state is
  'What happened to the EMAIL for this reminder. `unavailable` means the partner has no billing address on file — recorded rather than reported as delivered (Dee, 2026-09-13).';

create table if not exists public.billing_email_outbox (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  group_id uuid not null references public.outsourcing_groups(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'receipt', 'reactivated')),

  reminder_id uuid references public.partner_invoice_reminders(id) on delete cascade,
  payment_id uuid references public.partner_payments(id) on delete cascade,
  invoice_id uuid references public.partner_invoices(id) on delete cascade,

  to_email text,
  to_name text,
  subject text not null,
  /** Everything the template needs, resolved when the event happened. */
  payload jsonb not null default '{}'::jsonb,

  state text not null default 'pending'
    check (state in ('pending', 'sent', 'failed', 'unavailable')),
  /** One email per event, forever. */
  dedupe_key text not null,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_email_outbox is
  'One row per billing email that should exist. `dedupe_key` is unique, so a dispatch rerun cannot send a second copy — the same discipline the reminder schedule uses (2026-09-13).';

create unique index if not exists billing_email_outbox_once on public.billing_email_outbox (dedupe_key);
create index if not exists billing_email_outbox_pending on public.billing_email_outbox (state, created_at)
  where state in ('pending', 'failed');

alter table public.billing_email_outbox enable row level security;
grant select on public.billing_email_outbox to authenticated;

drop policy if exists billing_email_outbox_select on public.billing_email_outbox;
create policy billing_email_outbox_select on public.billing_email_outbox
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.view'));

/* No write policy: rows are created by the sweep and by the payment trigger,
   and updated by the dispatcher under the service role. A hand-written row
   would be an email nobody asked for. */

/**
 * Where a partner's billing email goes.
 *
 * The primary contact first, because that is the person BES deals with; the
 * partner record's own address second, for partners imported before contacts
 * existed. An address that is blank or has no `@` is not an address.
 */
create or replace function public.partner_billing_email(p_group uuid)
returns table(email text, name text)
language sql stable security definer set search_path = public as $function$
  select coalesce(c.email::text, nullif(btrim(g.contact_email), '')),
         coalesce(c.full_name, g.partner_name, g.name)
    from public.outsourcing_groups g
    left join lateral (
      select pc.email, pc.full_name from public.partner_contacts pc
       where pc.group_id = g.id and pc.status = 'active'
         and pc.email is not null and position('@' in pc.email::text) > 0
       order by pc.is_primary desc, pc.created_at
       limit 1
    ) c on true
   where g.id = p_group
     and coalesce(c.email::text, nullif(btrim(g.contact_email), '')) is not null
     and position('@' in coalesce(c.email::text, g.contact_email)) > 0
$function$;
revoke execute on function public.partner_billing_email(uuid) from public, anon;
grant execute on function public.partner_billing_email(uuid) to authenticated;

/**
 * Queue the email for a reminder that has just been created.
 *
 * Called from the sweep, inside the same transaction as the reminder, so the
 * two cannot diverge: either both exist or neither does.
 */
create or replace function public.queue_reminder_email(p_reminder uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  r record;
  v_to record;
  v_state text;
  v_subject text;
begin
  select pr.*, i.invoice_number, i.total_cents, i.amount_paid_cents, i.due_date, i.currency,
         g.name as partner_name, s.label as stage_label
    into r
    from public.partner_invoice_reminders pr
    join public.partner_invoices i on i.id = pr.invoice_id
    join public.outsourcing_groups g on g.id = pr.group_id
    join public.billing_reminder_schedule s on s.stage = pr.stage
   where pr.id = p_reminder;
  if r.id is null then return; end if;

  select * into v_to from public.partner_billing_email(r.group_id);
  v_state := case when v_to.email is null then 'unavailable' else 'pending' end;

  v_subject := case r.stage
    when 'day_5_warning' then 'Payment warning · ' || r.invoice_number
    when 'day_7_final'   then 'Final payment reminder · ' || r.invoice_number
    else 'Payment reminder · ' || r.invoice_number
  end;

  insert into public.billing_email_outbox
    (agency_id, group_id, kind, reminder_id, invoice_id, to_email, to_name, subject, payload, state, dedupe_key)
  values (r.agency_id, r.group_id, 'reminder', r.id, r.invoice_id, v_to.email, v_to.name, v_subject,
          jsonb_build_object(
            'stage', r.stage, 'stage_label', r.stage_label,
            'partner_name', r.partner_name, 'invoice_number', r.invoice_number,
            'currency', coalesce(r.currency, 'USD'),
            'total_cents', r.total_cents, 'paid_cents', r.amount_paid_cents,
            'balance_cents', public.invoice_balance_cents(r.invoice_id),
            'due_date', r.due_date, 'days_overdue', r.days_overdue,
            'is_final', (r.stage = 'day_7_final'), 'is_warning', (r.stage = 'day_5_warning')),
          v_state, 'reminder:' || r.id::text)
  on conflict (dedupe_key) do nothing;

  update public.partner_invoice_reminders
     set email_state = v_state, email_to = v_to.email
   where id = p_reminder;
end $function$;
revoke execute on function public.queue_reminder_email(uuid) from public, anon, authenticated;

/**
 * A receipt when money posts, and a reactivation note when it unlocks the
 * account.
 *
 * On the payment, so a payment recorded by hand, by an import or (later) by a
 * provider webhook all produce exactly one receipt — the payment id is the
 * dedupe key, which is what makes a duplicate webhook harmless.
 */
create or replace function public.queue_payment_receipt()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_to record;
  v_state text;
  v_balance bigint;
  v_invoice text;
  v_name text;
  v_reactivated boolean;
begin
  if new.status <> 'succeeded' then return null; end if;

  select * into v_to from public.partner_billing_email(new.group_id);
  v_state := case when v_to.email is null then 'unavailable' else 'pending' end;

  select invoice_number into v_invoice from public.partner_invoices where id = new.invoice_id;
  select name into v_name from public.outsourcing_groups where id = new.group_id;
  v_balance := case when new.invoice_id is null then null
                    else public.invoice_balance_cents(new.invoice_id) end;

  /* Whether this payment is what released the account. Read AFTER the invoice
     recompute trigger, so it reflects the settled state. */
  v_reactivated := not public.partner_is_suspended(new.group_id)
    and exists (select 1 from public.partner_suspensions s
                 where s.group_id = new.group_id
                   and s.lifted_at is not null
                   and s.lifted_at >= new.created_at - interval '1 minute');

  insert into public.billing_email_outbox
    (agency_id, group_id, kind, payment_id, invoice_id, to_email, to_name, subject, payload, state, dedupe_key)
  values (new.agency_id, new.group_id, 'receipt', new.id, new.invoice_id, v_to.email, v_to.name,
          'Payment received' || coalesce(' · ' || v_invoice, ''),
          jsonb_build_object(
            'partner_name', v_name, 'amount_cents', new.amount_cents,
            'currency', coalesce(new.currency, 'USD'),
            'method', coalesce(new.method, initcap(replace(new.provider::text, '_', ' '))),
            'reference', new.provider_transaction_id, 'paid_on', new.paid_on,
            'invoice_number', v_invoice, 'balance_cents', v_balance,
            'reactivated', v_reactivated),
          v_state, 'receipt:' || new.id::text)
  on conflict (dedupe_key) do nothing;
  return null;
end $function$;
revoke execute on function public.queue_payment_receipt() from public, anon, authenticated;

/* AFTER the invoice recompute trigger, so the receipt quotes the balance the
   partner will see rather than the one from before their payment. */
drop trigger if exists partner_payments_receipt on public.partner_payments;
create trigger partner_payments_receipt
  after insert on public.partner_payments
  for each row execute function public.queue_payment_receipt();

/**
 * Hand the outbox to the mailer.
 *
 * Identical in shape to `ghl_outbound_dispatch`: nothing to do means nothing
 * happens, and a missing secret STOPS rather than failing open — the outbox
 * keeps the queue and the Attention Center says why.
 */
create or replace function public.billing_email_dispatch()
returns void
language plpgsql security definer set search_path = public, extensions, vault as $function$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.billing_email_outbox where state in ('pending', 'failed') and attempts < 5) then
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

select cron.unschedule('billing-email-dispatch') where exists (
  select 1 from cron.job where jobname = 'billing-email-dispatch');
select cron.schedule('billing-email-dispatch', '*/5 * * * *',
  $cron$ select public.billing_email_dispatch() $cron$);
