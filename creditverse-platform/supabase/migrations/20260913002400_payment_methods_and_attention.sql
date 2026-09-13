-- =============================================================================
-- Which methods a partner may use, and the billing exceptions that need a
-- person.
--
-- Dee: "Do not automatically expose every method to every Partner."
--
-- So methods are configured per partner, and the portal shows exactly what was
-- turned on. `instructions` is free text BES writes — a Wise link, a PayPal.me
-- address, bank details — because these are Personal accounts with no API to
-- generate anything from, and a pretend Pay Now button would be worse than
-- clear instructions.
-- =============================================================================

create table if not exists public.partner_payment_methods (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  group_id uuid not null references public.outsourcing_groups(id) on delete cascade,
  method text not null check (method in (
    'authorize_net_autopay', 'authorize_net_pay_now',
    'wise', 'paypal', 'bank_transfer', 'other'
  )),
  enabled boolean not null default true,
  /** What the partner is told to do. Rendered as text, never as HTML. */
  instructions text,
  /** A link to pay at, when the method has one. */
  pay_url text,
  /** Shown in the portal in place of the method's default name. */
  display_label text,
  sort integer not null default 10,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.partner_payment_methods is
  'Which payment methods a given partner may use, and what they are told. Per partner, because not every partner is offered every rail (Dee, 2026-09-13).';

create unique index if not exists partner_payment_methods_once
  on public.partner_payment_methods (group_id, method);

alter table public.partner_payment_methods enable row level security;
grant select, insert, update, delete on public.partner_payment_methods to authenticated;

/* Staff read it under the owner-gated invoice key. The PARTNER reads their own
   through a definer function below, never through this policy. */
drop policy if exists partner_payment_methods_select on public.partner_payment_methods;
create policy partner_payment_methods_select on public.partner_payment_methods
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.view'));

drop policy if exists partner_payment_methods_write on public.partner_payment_methods;
create policy partner_payment_methods_write on public.partner_payment_methods
  for all to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'));

/**
 * What THIS partner may pay with, for their own portal.
 *
 * Enabled methods only. AutoPay is reported but is not a thing they can act on
 * yet — there is no live card rail — so the portal describes it rather than
 * offering a button that would do nothing.
 */
create or replace function public.my_partner_payment_methods()
returns table(method text, label text, instructions text, pay_url text, sort integer)
language sql stable security definer set search_path = public as $function$
  select m.method,
         coalesce(m.display_label, case m.method
           when 'authorize_net_autopay' then 'AutoPay (card on file)'
           when 'authorize_net_pay_now' then 'Pay now by card'
           when 'wise' then 'Pay with Wise'
           when 'paypal' then 'Pay with PayPal'
           when 'bank_transfer' then 'Bank transfer'
           else 'Other' end),
         m.instructions, m.pay_url, m.sort
    from public.partner_payment_methods m
   where m.group_id = public.partner_billing_group_of_user()
     and m.enabled
   order by m.sort, m.method
$function$;
revoke execute on function public.my_partner_payment_methods() from public, anon;
grant execute on function public.my_partner_payment_methods() to authenticated;

/** The partner's own account credit — MONEY, and named so. */
create or replace function public.my_partner_account_credit()
returns table(currency text, added_cents bigint, used_cents bigint, available_cents bigint, history jsonb)
language sql stable security definer set search_path = public as $function$
  select b.currency, b.added_cents, b.used_cents, b.available_cents,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'at', l.created_at, 'kind', l.kind,
                     'amount_cents', l.amount_cents, 'description', l.description)
                   order by l.created_at desc)
                     from (select * from public.partner_account_credit_ledger l2
                            where l2.group_id = b.group_id and l2.currency = b.currency
                            order by l2.created_at desc limit 50) l), '[]'::jsonb)
    from public.partner_account_credit_balance b
   where b.group_id = public.partner_billing_group_of_user()
$function$;
revoke execute on function public.my_partner_account_credit() from public, anon;
grant execute on function public.my_partner_account_credit() to authenticated;

-- ── Billing exceptions, for the Attention Center ───────────────────────────
/**
 * Everything in billing that needs a person, in one list.
 *
 * Dee's seven, plus the vocabulary the existing BES pipeline already uses:
 * `Billing Attention Required` for the things somebody must fix, and
 * `Suspended Due To Non-Payment` for the state the operating records already
 * name. This is a VIEW over the canonical records — not a new lifecycle, not a
 * second set of flags.
 */
create or replace view public.billing_attention as
  -- Suspended for nonpayment
  select 'suspended_nonpayment' as kind,
         'Suspended Due To Non-Payment' as label,
         'critical' as severity,
         s.group_id, g.name as partner_name, g.agency_id,
         null::uuid as invoice_id, null::text as invoice_number,
         coalesce((select sum(public.invoice_balance_cents(i.id))
                     from public.partner_suspension_invoices si
                     join public.partner_invoices i on i.id = si.invoice_id
                    where si.suspension_id = s.id), 0) as amount_cents,
         s.suspended_at as since,
         coalesce(s.detail, 'Suspended for nonpayment') as detail
    from public.partner_suspensions s
    join public.outsourcing_groups g on g.id = s.group_id
   where s.lifted_at is null

  union all
  -- Final reminder sent, not yet suspended
  select 'final_reminder_sent', 'Billing Attention Required', 'high',
         r.group_id, g.name, r.agency_id, r.invoice_id, i.invoice_number,
         public.invoice_balance_cents(r.invoice_id), r.sent_at,
         'Final reminder sent ' || r.days_overdue || ' days past due'
    from public.partner_invoice_reminders r
    join public.partner_invoices i on i.id = r.invoice_id
    join public.outsourcing_groups g on g.id = r.group_id
   where r.stage = 'day_7_final'
     and public.invoice_balance_cents(r.invoice_id) > 0
     and not public.partner_is_suspended(r.group_id)

  union all
  -- Past due, before the final reminder
  select 'past_due', 'Billing Attention Required', 'medium',
         i.group_id, g.name, i.agency_id, i.id, i.invoice_number,
         public.invoice_balance_cents(i.id), i.due_date::timestamptz,
         (current_date - i.due_date) || ' days past due'
    from public.partner_invoices i
    join public.outsourcing_groups g on g.id = i.group_id
   where i.status = 'overdue'
     and public.invoice_balance_cents(i.id) > 0
     and not exists (select 1 from public.partner_invoice_reminders r
                      where r.invoice_id = i.id and r.stage = 'day_7_final')

  union all
  -- A reminder that could not be emailed
  select 'missing_billing_email', 'Billing Attention Required', 'high',
         o.group_id, g.name, o.agency_id, o.invoice_id,
         (select invoice_number from public.partner_invoices where id = o.invoice_id),
         0, o.created_at,
         'Delivery unavailable · Missing billing email'
    from public.billing_email_outbox o
    join public.outsourcing_groups g on g.id = o.group_id
   where o.state = 'unavailable'

  union all
  -- Money nobody has placed
  select 'payment_matching_review', 'Billing Attention Required', 'high',
         p.group_id, g.name, p.agency_id, null, null,
         p.amount_cents, p.created_at,
         'Payment of ' || to_char(p.amount_cents / 100.0, 'FM999G999D00') || ' needs matching'
    from public.partner_payments p
    join public.outsourcing_groups g on g.id = p.group_id
   where p.invoice_id is null
     and p.status = 'succeeded'
     and p.reconciliation_state <> 'matched'

  union all
  -- Recurring terms that cannot become an invoice
  select 'billing_terms_missing_rate', 'Billing Attention Required', 'medium',
         g.id, g.name, g.agency_id, null, null, 0, null::timestamptz,
         t.billing_model || ' agreement has no rate, so it generates nothing'
    from public.billing_terms_needing_rate t
    join public.outsourcing_groups g on g.name = t.partner_name

  union all
  -- An email that kept failing
  select 'email_failed', 'Billing Attention Required', 'medium',
         o.group_id, g.name, o.agency_id, o.invoice_id,
         (select invoice_number from public.partner_invoices where id = o.invoice_id),
         0, o.created_at,
         'Reminder email failed: ' || coalesce(o.last_error, 'unknown')
    from public.billing_email_outbox o
    join public.outsourcing_groups g on g.id = o.group_id
   where o.state = 'failed' and o.attempts >= 5;

alter view public.billing_attention set (security_invoker = true);
comment on view public.billing_attention is
  'Every billing exception that needs a person, using the vocabulary the BES pipeline already has — Billing Attention Required, Suspended Due To Non-Payment. A view over canonical records, never a second lifecycle (Dee, 2026-09-13).';
grant select on public.billing_attention to authenticated;
