-- The Finance overview, in ONE round trip.
--
-- Dee's redesign, 2026-09-17, wants eight things answerable in five seconds:
-- collected, outstanding, overdue, expenses, net cash, the ageing, what needs
-- a person, and what should arrive soon.
--
-- Naively that is eight queries, several of them per-partner — the "user
-- action → auth → permissions → record → per-record enrichment" waterfall that
-- rule 14 names outright. So it is one function returning one JSON document,
-- and the screen arranges what comes back.
--
-- ── IT IS A PROJECTION, NEVER A COPY ──────────────────────────────────────
--
-- "Do NOT create duplicate finance records for prettier dashboards." Nothing
-- here writes anything, nothing is cached in a table, and every figure is read
-- from the canonical invoices, payments, expenses and suspensions. The same
-- invoice appears in Finance, the Partner profile and the Partner Portal
-- because there is one invoice.
--
-- ── AND IT IS GATED ───────────────────────────────────────────────────────
--
-- "Agency Admin alone does NOT grant financial access." SECURITY DEFINER with
-- an explicit capability check, so calling the function directly from a
-- console is refused exactly as the navigation would be.

create or replace function public.finance_overview(p_months integer default 9)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_agency uuid;
  v_today  date := current_date;
  v_from   date;
  v_out    jsonb;
begin
  select id into v_agency from public.agencies order by created_at limit 1;

  if not (public.is_staff_of(v_agency)
          and (public.agency_can('finance.dashboard.view') or public.agency_can('billing.view'))) then
    raise exception 'Finance is not part of your access' using errcode = '42501';
  end if;

  /* Bounded on purpose: the chart window, plus open invoices whatever their
     age. Not "every invoice ever" (rule 14). */
  p_months := greatest(1, least(coalesce(p_months, 9), 24));
  v_from := date_trunc('month', v_today) - make_interval(months => p_months - 1);

  with
  /* Every invoice still asking for money, whatever month it came from. */
  open_invoices as (
    select i.id, i.group_id, i.invoice_number, i.due_date, i.currency, i.status,
           public.invoice_balance_cents(i.id) as balance_cents
      from public.partner_invoices i
     where i.status in ('sent', 'overdue', 'partially_paid')
       and public.invoice_balance_cents(i.id) > 0
  ),
  /* Cash in and cash out, by the month the money MOVED. */
  cash_in as (
    select to_char(p.paid_on, 'YYYY-MM') as month,
           sum(greatest(p.amount_cents - p.refund_amount_cents, 0))::bigint as cents
      from public.partner_payments p
     where p.status = 'succeeded' and p.paid_on >= v_from
     group by 1
  ),
  cash_out as (
    select to_char(e.paid_on, 'YYYY-MM') as month, sum(e.amount_cents)::bigint as cents
      from public.agency_expenses e
     where e.paid_on is not null and e.paid_on >= v_from
     group by 1
  ),
  /* A partner's most recent card attempt. Only a FAILED most-recent attempt is
     a problem; an old decline followed by a payment is history. */
  last_charge as (
    select distinct on (c.group_id) c.group_id, c.status, c.invoice_id, c.amount_cents
      from public.partner_card_charges c
     order by c.group_id, c.created_at desc
  ),
  /* A live service with no rate cannot be invoiced, and nobody finds out until
     the month it silently bills nothing. */
  missing_terms as (
    select distinct s.group_id
      from public.partner_services s
      left join public.partner_service_billing b
        on b.service_id = s.id and b.effective_to is null
     where s.status = 'active'
       and (b.service_id is null or coalesce(b.rate_cents, 0) = 0)
  ),
  suspended as (
    select distinct sp.group_id from public.partner_suspensions sp where sp.lifted_at is null
  ),
  final_reminder as (
    select count(distinct r.invoice_id)::int as n
      from public.partner_invoice_reminders r
      join open_invoices oi on oi.id = r.invoice_id
     where r.stage = 'day_7_final'
  ),
  unmatched as (
    select count(*)::int as n from public.partner_payments p
     where p.reconciliation_state = 'review_required' and p.status = 'succeeded'
  ),
  /* How each partner is set up to pay. A saved card with autopay on is the
     only combination that collects by itself. */
  method_by_partner as (
    select g.id as group_id,
           case
             when pp.autopay_enabled then 'autopay'
             when pp.id is not null then 'card'
             when exists (select 1 from public.partner_payment_methods m
                           where m.group_id = g.id and m.enabled and m.method = 'paypal') then 'paypal'
             when exists (select 1 from public.partner_payment_methods m
                           where m.group_id = g.id and m.enabled and m.method = 'wise') then 'wise'
             else 'manual'
           end as method,
           coalesce(pp.autopay_enabled, false) as autopay,
           pp.card_brand, pp.last4
      from public.outsourcing_groups g
      left join public.partner_payment_profiles pp on pp.group_id = g.id and pp.is_default
  )
  select jsonb_build_object(
    'today', v_today,
    'months', (select coalesce(jsonb_agg(jsonb_build_object(
                 'month', m, 'collected_cents', coalesce(ci.cents, 0),
                 'expenses_cents', coalesce(co.cents, 0)) order by m), '[]'::jsonb)
                from generate_series(v_from, date_trunc('month', v_today)::date, interval '1 month') g(d)
                cross join lateral (select to_char(g.d, 'YYYY-MM')) s(m)
                left join cash_in  ci on ci.month = s.m
                left join cash_out co on co.month = s.m),
    'open_invoices', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', oi.id, 'group_id', oi.group_id, 'invoice_number', oi.invoice_number,
                 'due_date', oi.due_date, 'currency', oi.currency, 'status', oi.status,
                 'balance_cents', oi.balance_cents,
                 'partner_name', gr.name,
                 'method', mp.method, 'autopay', mp.autopay)), '[]'::jsonb)
                from open_invoices oi
                join public.outsourcing_groups gr on gr.id = oi.group_id
                left join method_by_partner mp on mp.group_id = oi.group_id),
    'recent_payments', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                 select jsonb_build_object(
                   'id', p.id, 'paid_on', p.paid_on, 'partner_name', gr.name,
                   'invoice_number', inv.invoice_number,
                   'amount_cents', p.amount_cents, 'currency', p.currency,
                   'method', coalesce(p.method, initcap(replace(p.provider::text, '_', ' '))),
                   'status', p.status::text, 'state', p.reconciliation_state) as x
                   from public.partner_payments p
                   join public.outsourcing_groups gr on gr.id = p.group_id
                   left join public.partner_invoices inv on inv.id = p.invoice_id
                  order by p.paid_on desc, p.created_at desc
                  limit 8) t),
    'attention', jsonb_build_object(
      'autopay_failed', (select coalesce(jsonb_agg(lc.group_id), '[]'::jsonb)
                           from last_charge lc where lc.status in ('declined', 'error')),
      'missing_terms',  (select coalesce(jsonb_agg(group_id), '[]'::jsonb) from missing_terms),
      'suspended',      (select coalesce(jsonb_agg(group_id), '[]'::jsonb) from suspended),
      'unmatched_payments', (select n from unmatched),
      'final_reminder',     (select n from final_reminder)),
    'collected_this_month', (select coalesce(sum(greatest(p.amount_cents - p.refund_amount_cents, 0)), 0)::bigint
                               from public.partner_payments p
                              where p.status = 'succeeded'
                                and p.paid_on >= date_trunc('month', v_today)::date),
    'expenses_this_month', (select coalesce(sum(e.amount_cents), 0)::bigint
                              from public.agency_expenses e
                             where e.paid_on >= date_trunc('month', v_today)::date)
  ) into v_out;

  return v_out;
end $$;

comment on function public.finance_overview(integer) is
  'Everything the Finance overview shows, in one JSON document and one round trip. A projection of canonical invoices, payments, expenses and suspensions — it writes nothing and caches nothing.';

revoke all on function public.finance_overview(integer) from public;
grant execute on function public.finance_overview(integer) to authenticated;
