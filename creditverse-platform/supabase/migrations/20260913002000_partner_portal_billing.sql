-- =============================================================================
-- The partner's own billing page — and the way in when they are suspended.
--
-- ── THE CONFLICT THIS FIXES ─────────────────────────────────────────────────
--
-- `partner_group_of_user()` is the chokepoint for everything a partner can
-- reach, and it refuses a partner whose lifecycle is `suspended`. Suspending
-- for nonpayment sets exactly that — so the suspension built yesterday locked
-- delinquent partners out of the one screen where they could pay.
--
-- Dee, explicitly: "Do NOT completely lock them out of the one place they need
-- to pay… keep Billing, Agreements, Messages/Contact BES, basic account
-- access."
--
-- The service chokepoint stays exactly as strict. A SECOND resolver answers
-- only for billing, and admits a suspended partner because that is the point:
-- suspension stops the WORK, not the ability to settle it. It still refuses an
-- archived partner and still requires the portal switch to be on, so it is
-- narrower than the original in every respect except this one.
-- =============================================================================

create or replace function public.partner_billing_group_of_user()
returns uuid
language sql stable security definer set search_path = public as $function$
  select c.group_id
    from public.partner_contacts c
    join public.outsourcing_groups g on g.id = c.group_id
   where c.user_id = auth.uid()
     and c.status = 'active'
     and g.portal_access_enabled
     /* Suspended is deliberately ALLOWED here and nowhere else. */
     and g.lifecycle <> 'archived'
   limit 1
$function$;
revoke execute on function public.partner_billing_group_of_user() from public, anon;
grant execute on function public.partner_billing_group_of_user() to authenticated;

/**
 * The top of the partner's billing page, in one call.
 *
 * Balance is summed from the invoices, which are summed from the payments —
 * never a stored figure. `next_billing_on` is the earliest due date still
 * outstanding, or the next cycle a recurring agreement will generate.
 */
create or replace function public.my_partner_billing()
returns table(
  group_id uuid,
  partner_name text,
  balance_cents bigint,
  overdue_cents bigint,
  overdue_invoices integer,
  next_billing_on date,
  next_billing_cents bigint,
  payment_methods text,
  suspended boolean,
  suspended_at timestamptz,
  suspension_detail text
)
language sql stable security definer set search_path = public as $function$
  with me as (select public.partner_billing_group_of_user() as gid)
  select g.id,
         g.name,
         coalesce((select sum(public.invoice_balance_cents(i.id)) from public.partner_invoices i
                    where i.group_id = g.id and i.status not in ('void', 'cancelled', 'draft')), 0),
         coalesce((select sum(public.invoice_balance_cents(i.id)) from public.partner_invoices i
                    where i.group_id = g.id and i.status = 'overdue'), 0),
         coalesce((select count(*)::int from public.partner_invoices i
                    where i.group_id = g.id and i.status = 'overdue'), 0),
         (select min(i.due_date) from public.partner_invoices i
           where i.group_id = g.id and public.invoice_balance_cents(i.id) > 0
             and i.status not in ('void', 'cancelled')),
         coalesce((select sum(sb.rate_cents) from public.partner_service_billing sb
                     join public.partner_services ps on ps.id = sb.service_id
                    where ps.group_id = g.id and sb.billing_status = 'active'
                      and sb.superseded_by is null), 0),
         /* What they may pay WITH — the channels BES configured, not a card. */
         coalesce((select string_agg(distinct sb.payment_channel, ', ')
                     from public.partner_service_billing sb
                     join public.partner_services ps on ps.id = sb.service_id
                    where ps.group_id = g.id and sb.billing_status = 'active'
                      and sb.payment_channel is not null), 'Contact BES'),
         public.partner_is_suspended(g.id),
         (select s.suspended_at from public.partner_suspensions s
           where s.group_id = g.id and s.lifted_at is null limit 1),
         (select s.detail from public.partner_suspensions s
           where s.group_id = g.id and s.lifted_at is null limit 1)
    from me join public.outsourcing_groups g on g.id = me.gid
$function$;
revoke execute on function public.my_partner_billing() from public, anon;
grant execute on function public.my_partner_billing() to authenticated;

/** Their invoices, newest first. Amounts only — never BES's margin or costs. */
create or replace function public.my_partner_invoices()
returns table(
  id uuid, invoice_number text, issue_date date, due_date date,
  currency text, total_cents bigint, amount_paid_cents bigint, balance_cents bigint,
  status text, period_key text, notes text
)
language sql stable security definer set search_path = public as $function$
  select i.id, i.invoice_number, i.issue_date, i.due_date, i.currency,
         i.total_cents, i.amount_paid_cents, public.invoice_balance_cents(i.id),
         i.status::text, i.period_key, i.notes
    from public.partner_invoices i
   where i.group_id = public.partner_billing_group_of_user()
     and i.status <> 'draft'
   order by i.issue_date desc, i.invoice_number desc
   limit 200
$function$;
revoke execute on function public.my_partner_invoices() from public, anon;
grant execute on function public.my_partner_invoices() to authenticated;

/** What they have paid, and what it was put against. */
create or replace function public.my_partner_payments()
returns table(
  id uuid, paid_on date, amount_cents bigint, currency text,
  method text, reference text, invoice_number text, status text
)
language sql stable security definer set search_path = public as $function$
  select p.id, p.paid_on, p.amount_cents, p.currency,
         coalesce(p.method, initcap(replace(p.provider::text, '_', ' '))),
         p.provider_transaction_id, i.invoice_number, p.status::text
    from public.partner_payments p
    left join public.partner_invoices i on i.id = p.invoice_id
   where p.group_id = public.partner_billing_group_of_user()
     and p.status in ('succeeded', 'refunded')
   order by p.paid_on desc, p.created_at desc
   limit 200
$function$;
revoke execute on function public.my_partner_payments() from public, anon;
grant execute on function public.my_partner_payments() to authenticated;

/** Credits: bought, used, left — and what used them. */
create or replace function public.my_partner_credits()
returns table(
  unit text, added bigint, used bigint, available bigint,
  history jsonb
)
language sql stable security definer set search_path = public as $function$
  select b.unit, b.added, b.used, b.available,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'at', l.created_at, 'kind', l.kind,
                     'quantity', l.quantity, 'description', l.description)
                   order by l.created_at desc)
                     from (select * from public.partner_credit_ledger l2
                            where l2.group_id = b.group_id and l2.unit = b.unit
                            order by l2.created_at desc limit 50) l), '[]'::jsonb)
    from public.partner_credit_balance b
   where b.group_id = public.partner_billing_group_of_user()
$function$;
revoke execute on function public.my_partner_credits() from public, anon;
grant execute on function public.my_partner_credits() to authenticated;
