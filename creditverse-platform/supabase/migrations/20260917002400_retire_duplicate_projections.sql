-- Retiring two projections I duplicated.
--
-- `billing_attention` and `payment_matching_review` already existed, as views,
-- with `security_invoker = true` so they answer per person. Building the
-- Finance module I wrote `finance_unmatched_payments()` and re-derived the
-- attention queue in TypeScript, without checking. That is rule 6 — search for
-- an existing implementation, reuse or improve it — and rule 2, one canonical
-- source, both broken in the same afternoon.
--
-- The existing view is also better than what I wrote: it ranks candidate
-- invoices by how close their balance is to the payment, and it names who
-- recorded it.
--
-- So the duplicate function goes, and `finance_overview` stops re-deriving the
-- exception counts — it reads the one view, which means a new exception kind
-- appears on the dashboard the moment the view learns about it, rather than
-- when somebody remembers to add it in two places.

drop function if exists public.finance_unmatched_payments();

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

  p_months := greatest(1, least(coalesce(p_months, 9), 24));
  v_from := date_trunc('month', v_today) - make_interval(months => p_months - 1);

  with
  open_invoices as (
    select i.id, i.group_id, i.invoice_number, i.due_date, i.currency, i.status,
           public.invoice_balance_cents(i.id) as balance_cents
      from public.partner_invoices i
     where i.status in ('sent', 'overdue', 'partially_paid')
       and public.invoice_balance_cents(i.id) > 0
  ),
  cash_in as (
    select to_char(p.paid_on, 'YYYY-MM') as month,
           sum(greatest(p.amount_cents - p.refund_amount_cents, 0))::bigint as cents
      from public.partner_payments p
     where p.status = 'succeeded' and p.paid_on >= v_from
       /* Applying account credit creates a payment so the invoice recomputes,
          but the money arrived when the OVERPAYMENT did. Counting it again
          here would report the same cash twice. */
       and p.source <> 'reconciled'
     group by 1
  ),
  cash_out as (
    select to_char(e.paid_on, 'YYYY-MM') as month, sum(e.amount_cents)::bigint as cents
      from public.agency_expenses e
     where e.paid_on is not null and e.paid_on >= v_from
     group by 1
  ),
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
           coalesce(pp.autopay_enabled, false) as autopay
      from public.outsourcing_groups g
      left join public.partner_payment_profiles pp on pp.group_id = g.id and pp.is_default
  )
  select jsonb_build_object(
    'today', v_today,
    'partner_names', (select coalesce(jsonb_object_agg(x.id, x.name), '{}'::jsonb)
                        from (select distinct g.id, g.name from public.outsourcing_groups g
                               where g.id in (select group_id from open_invoices)
                                  or g.id in (select group_id from public.billing_attention)) x),
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
                 'balance_cents', oi.balance_cents, 'partner_name', gr.name,
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
    /* ONE source. Every exception kind the canonical view knows about, counted
       — including ones added to it later, with no change here. */
    'attention', (select coalesce(jsonb_agg(jsonb_build_object(
                    'kind', a.kind, 'severity', a.severity,
                    'count', a.n, 'amount_cents', a.amount) order by a.kind), '[]'::jsonb)
                   from (select kind, max(severity) as severity, count(*)::int as n,
                                coalesce(sum(amount_cents), 0)::bigint as amount
                           from public.billing_attention group by kind) a),
    'collected_this_month', (select coalesce(sum(greatest(p.amount_cents - p.refund_amount_cents, 0)), 0)::bigint
                               from public.partner_payments p
                              where p.status = 'succeeded' and p.source <> 'reconciled'
                                and p.paid_on >= date_trunc('month', v_today)::date),
    'expenses_this_month', (select coalesce(sum(e.amount_cents), 0)::bigint
                              from public.agency_expenses e
                             where e.paid_on >= date_trunc('month', v_today)::date)
  ) into v_out;

  return v_out;
end $$;

comment on function public.finance_overview(integer) is
  'Everything the Finance overview shows, in one round trip. A projection of canonical records: invoices, payments, expenses, and the billing_attention view — it derives no exception of its own, so the dashboard and the queue cannot disagree.';

revoke all on function public.finance_overview(integer) from public;
grant execute on function public.finance_overview(integer) to authenticated;
