-- [TEST] partners never appear in a financial figure.
--
-- The UAT fixtures put five partners and $1,280 of invoices into the database.
-- Left alone, Finance would have reported $1,280 outstanding, five more rows
-- in the ageing, five in Billing Attention, and — once sandbox charging runs —
-- money in "Revenue Collected" that nobody ever sent.
--
-- CLAUDE.md rule 12: "Never describe seed or sample data as if it were real
-- operational data." A number on the Finance overview is the clearest possible
-- claim that it is real.
--
-- `is_fixture` already means "this partner is not real" and is already honoured
-- by `billing_recurring_sweep` and `partner_autopay_due`. This extends it to
-- the reporting layer, which is the last place it was missing. It is a
-- permanent invariant, not a UAT convenience: the flag outlives this test run.
--
-- The payment LEDGER deliberately still shows them. Finance needs to be able
-- to see a test charge to reconcile it, and every one is labelled — the
-- environment column marks sandbox charges and the partner is named [TEST].
-- What must not happen is a test row being SUMMED into a figure.

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
  /* Every figure below is built from this, and it is real partners only. */
  real_partners as (
    select g.id, g.name from public.outsourcing_groups g where not g.is_fixture
  ),
  open_invoices as (
    select i.id, i.group_id, i.invoice_number, i.due_date, i.currency, i.status,
           public.invoice_balance_cents(i.id) as balance_cents
      from public.partner_invoices i
      join real_partners rp on rp.id = i.group_id
     where i.status in ('sent', 'overdue', 'partially_paid')
       and public.invoice_balance_cents(i.id) > 0
  ),
  cash_in as (
    select to_char(p.paid_on, 'YYYY-MM') as month,
           sum(greatest(p.amount_cents - p.refund_amount_cents, 0))::bigint as cents
      from public.partner_payments p
      join real_partners rp on rp.id = p.group_id
     where p.status = 'succeeded' and p.paid_on >= v_from
       /* Applying account credit creates a payment so the invoice recomputes,
          but the money arrived when the OVERPAYMENT did. */
       and p.source <> 'reconciled'
       /* A sandbox charge is approved without money moving. It is a real row
          and it is not revenue. */
       and not exists (select 1 from public.partner_card_charges c
                        where c.payment_id = p.id and c.environment <> 'production')
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
                        from (select distinct rp.id, rp.name from real_partners rp
                               where rp.id in (select group_id from open_invoices)
                                  or rp.id in (select group_id from public.billing_attention)) x),
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
                 'balance_cents', oi.balance_cents, 'partner_name', rp.name,
                 'method', mp.method, 'autopay', mp.autopay)), '[]'::jsonb)
                from open_invoices oi
                join real_partners rp on rp.id = oi.group_id
                left join method_by_partner mp on mp.group_id = oi.group_id),
    'recent_payments', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                 select jsonb_build_object(
                   'id', p.id, 'paid_on', p.paid_on, 'partner_name', rp.name,
                   'invoice_number', inv.invoice_number,
                   'amount_cents', p.amount_cents, 'currency', p.currency,
                   'method', coalesce(p.method, initcap(replace(p.provider::text, '_', ' '))),
                   'status', p.status::text, 'state', p.reconciliation_state) as x
                   from public.partner_payments p
                   join real_partners rp on rp.id = p.group_id
                   left join public.partner_invoices inv on inv.id = p.invoice_id
                  order by p.paid_on desc, p.created_at desc
                  limit 8) t),
    'attention', (select coalesce(jsonb_agg(jsonb_build_object(
                    'kind', a.kind, 'severity', a.severity,
                    'count', a.n, 'amount_cents', a.amount) order by a.kind), '[]'::jsonb)
                   from (select kind, max(severity) as severity, count(*)::int as n,
                                coalesce(sum(amount_cents), 0)::bigint as amount
                           from public.billing_attention group by kind) a),
    'collected_this_month', (select coalesce(sum(greatest(p.amount_cents - p.refund_amount_cents, 0)), 0)::bigint
                               from public.partner_payments p
                               join real_partners rp on rp.id = p.group_id
                              where p.status = 'succeeded' and p.source <> 'reconciled'
                                and p.paid_on >= date_trunc('month', v_today)::date
                                and not exists (select 1 from public.partner_card_charges c
                                                 where c.payment_id = p.id and c.environment <> 'production')),
    'expenses_this_month', (select coalesce(sum(e.amount_cents), 0)::bigint
                              from public.agency_expenses e
                             where e.paid_on >= date_trunc('month', v_today)::date),
    /* Said out loud rather than hidden: a [TEST] world exists and is excluded. */
    'test_partners', (select count(*)::int from public.outsourcing_groups
                       where is_fixture and archived_at is null)
  ) into v_out;

  return v_out;
end $$;

comment on function public.finance_overview(integer) is
  'Everything the Finance overview shows, in one round trip. Excludes [TEST] fixture partners and sandbox card payments from every figure — test data must never be summed into a number that claims to be real — and reports how many test partners exist so their absence is visible rather than silent.';

revoke all on function public.finance_overview(integer) from public;
grant execute on function public.finance_overview(integer) to authenticated;

/* The exception queue too: a [TEST] partner is nobody's problem to chase. */
create or replace view public.billing_attention
with (security_invoker = true) as
  select * from (
    select 'suspended_nonpayment'::text as kind,
           'Suspended Due To Non-Payment'::text as label, 'critical'::text as severity,
           s.group_id, g.name as partner_name, g.agency_id,
           null::uuid as invoice_id, null::text as invoice_number,
           coalesce((select sum(public.invoice_balance_cents(i.id))
                       from public.partner_suspension_invoices si
                       join public.partner_invoices i on i.id = si.invoice_id
                      where si.suspension_id = s.id), 0)::numeric as amount_cents,
           s.suspended_at as since,
           coalesce(s.detail, 'Suspended for nonpayment') as detail
      from public.partner_suspensions s
      join public.outsourcing_groups g on g.id = s.group_id
     where s.lifted_at is null and not g.is_fixture

    union all
    select 'final_reminder_sent', 'Billing Attention Required', 'high',
           r.group_id, g.name, r.agency_id, r.invoice_id, i.invoice_number,
           public.invoice_balance_cents(r.invoice_id)::numeric, r.sent_at,
           'Final reminder sent ' || r.days_overdue || ' days past due'
      from public.partner_invoice_reminders r
      join public.partner_invoices i on i.id = r.invoice_id
      join public.outsourcing_groups g on g.id = r.group_id
     where r.stage = 'day_7_final' and not g.is_fixture
       and public.invoice_balance_cents(r.invoice_id) > 0
       and not public.partner_is_suspended(r.group_id)

    union all
    select 'past_due', 'Billing Attention Required', 'medium',
           i.group_id, g.name, i.agency_id, i.id, i.invoice_number,
           public.invoice_balance_cents(i.id)::numeric, i.due_date::timestamptz,
           (current_date - i.due_date) || ' days past due'
      from public.partner_invoices i
      join public.outsourcing_groups g on g.id = i.group_id
     where i.status in ('sent', 'partially_paid', 'overdue') and not g.is_fixture
       and i.due_date < current_date
       and public.invoice_balance_cents(i.id) > 0
       and not exists (select 1 from public.partner_invoice_reminders r
                        where r.invoice_id = i.id and r.stage = 'day_7_final')

    union all
    select 'missing_billing_email', 'Billing Attention Required', 'high',
           g.id, g.name, g.agency_id, null::uuid, null::text,
           coalesce((select sum(public.invoice_balance_cents(i.id))
                       from public.partner_invoices i
                      where i.group_id = g.id
                        and i.status in ('sent', 'partially_paid', 'overdue')), 0)::numeric,
           g.created_at,
           'No billing email — invoices and reminders cannot be delivered'
      from public.outsourcing_groups g
     where g.archived_at is null and not g.is_fixture
       and not exists (select 1 from public.partner_billing_email(g.id))
       and exists (select 1 from public.partner_invoices i
                    where i.group_id = g.id
                      and i.status in ('sent', 'partially_paid', 'overdue')
                      and public.invoice_balance_cents(i.id) > 0)

    union all
    select 'delivery_failed', 'Billing Attention Required', 'high',
           o.group_id, g.name, o.agency_id, o.invoice_id,
           (select invoice_number from public.partner_invoices where id = o.invoice_id),
           0::numeric, o.created_at,
           'Delivery ' || o.state || coalesce(' · ' || o.last_error, '')
      from public.billing_email_outbox o
      join public.outsourcing_groups g on g.id = o.group_id
     where o.state in ('unavailable', 'failed') and not g.is_fixture

    union all
    select 'payment_matching_review', 'Billing Attention Required', 'high',
           p.group_id, g.name, p.agency_id, null::uuid, null::text,
           p.amount_cents::numeric, p.created_at,
           'Payment of ' || to_char(p.amount_cents / 100.0, 'FM999G999D00') || ' with no invoice'
      from public.partner_payments p
      join public.outsourcing_groups g on g.id = p.group_id
     where p.reconciliation_state = 'review_required' and p.status = 'succeeded'
       and not g.is_fixture

    union all
    select 'billing_terms_missing_rate', 'Billing Configuration Required', 'medium',
           ps.group_id, g.name, sb.agency_id, null::uuid, null::text,
           0::numeric, sb.effective_from::timestamptz,
           'A live service has no billing rate, so it invoices nothing'
      from public.partner_service_billing sb
      join public.partner_services ps on ps.id = sb.service_id
      join public.outsourcing_groups g on g.id = ps.group_id
     where sb.billing_status = 'active' and sb.superseded_by is null
       and ps.status = 'active' and not g.is_fixture
       and coalesce(sb.rate_cents, 0) = 0

    union all
    select 'payment_unknown', 'Billing Attention Required', 'critical',
           c.group_id, g.name, c.agency_id, c.invoice_id,
           (select invoice_number from public.partner_invoices where id = c.invoice_id),
           c.amount_cents::numeric, c.created_at,
           'A card charge got no answer — confirm it at the processor before retrying'
      from public.partner_card_charges c
      join public.outsourcing_groups g on g.id = c.group_id
     where c.status = 'unknown' and not g.is_fixture

    union all
    select 'autopay_failed', 'Billing Attention Required', 'high',
           c.group_id, g.name, c.agency_id, c.invoice_id,
           (select invoice_number from public.partner_invoices where id = c.invoice_id),
           c.amount_cents::numeric, c.created_at,
           coalesce(c.response_text, 'The saved card was not accepted')
      from (select distinct on (group_id) * from public.partner_card_charges
             order by group_id, created_at desc) c
      join public.outsourcing_groups g on g.id = c.group_id
     where c.status in ('declined', 'error') and not g.is_fixture
  ) rows;

comment on view public.billing_attention is
  'Every billing exception that needs a person, derived from canonical records only, for REAL partners only. A row disappears the moment the underlying fact is corrected (Dee §28).';

grant select on public.billing_attention to authenticated;
