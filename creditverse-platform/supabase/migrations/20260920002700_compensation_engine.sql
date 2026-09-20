-- What a period is worth, on each side of the arrangement.
--
-- Dee's rules, 2026-09-20:
--   • prorate a monthly package by PAID SCHEDULED WORKDAYS, never calendar
--     days — a Mon–Fri contractor should not earn less because a month has
--     more weekends;
--   • when the arrangement changes mid-period, price each segment with the
--     rate that was true then;
--   • approved paid leave and reward days count as payable; approved unpaid
--     leave does not;
--   • BES's cost is the whole cost. The partner's margin is the difference
--     between the two finals, never a second expense.

/** Scheduled, payable days in a range — the divisor a monthly package needs. */
create or replace function public.paid_scheduled_days(p_user uuid, p_from date, p_to date) returns integer
language sql stable security definer set search_path = public as $function$
  select count(*)::integer
    from generate_series(p_from, p_to, interval '1 day') as d(day)
    join lateral (
      select work_days from public.work_schedules ws
       where ws.user_id = p_user and ws.effective_from <= d.day::date
       order by ws.effective_from desc limit 1) s on true
   where extract(isodow from d.day)::smallint = any (s.work_days)
     /* Approved UNPAID leave is not a payable day; paid leave still is. */
     and not exists (
       select 1 from public.leave_requests lr
         join public.leave_types lt on lt.id = lr.type_id and not lt.paid
        where lr.user_id = p_user and lr.status = 'approved'
          and d.day::date between lr.starts_on and lr.ends_on)
$function$;
revoke all on function public.paid_scheduled_days(uuid, date, date) from public, anon;
grant execute on function public.paid_scheduled_days(uuid, date, date) to authenticated;

/**
 * The period, split by arrangement, priced on both sides.
 *
 * One row per segment: which arrangement ruled it, how long it lasted in
 * payable days and worked minutes, and what each side owes for it. The
 * caller sums. Returning the segments rather than a total is deliberate —
 * a payslip that cannot show its working is not explicable.
 */
create or replace function public.compensation_segments(p_user uuid, p_from date, p_to date)
returns table(
  arrangement_id uuid, arrangement_type text, compensation_basis text, managing_partner_id uuid,
  currency text, segment_from date, segment_to date, paid_days integer, period_paid_days integer,
  work_minutes integer, agent_cents bigint, bes_cents bigint)
language sql stable security definer set search_path = public as $function$
  with arrangements as (
    select a.*, greatest(a.effective_from, p_from) as seg_from,
           least(coalesce(a.effective_to, p_to), p_to) as seg_to
      from public.compensation_arrangements a
     where a.user_id = p_user
       and a.effective_from <= p_to
       and (a.effective_to is null or a.effective_to >= p_from)
  ), measured as (
    select a.*,
           public.paid_scheduled_days(p_user, a.seg_from, a.seg_to) as seg_days,
           public.paid_scheduled_days(p_user, p_from, p_to) as whole_days,
           coalesce((select sum(te.duration_minutes)::int from public.time_entries te
                      where te.employee_id = p_user and te.kind = 'work' and te.ended_at is not null
                        and te.work_date between a.seg_from and a.seg_to), 0) as minutes
      from arrangements a
  )
  select m.id, m.arrangement_type, m.compensation_basis, m.managing_partner_id, m.currency,
         m.seg_from, m.seg_to, m.seg_days, m.whole_days, m.minutes,
         case m.compensation_basis
           when 'hourly'     then round(m.minutes * m.agent_rate_cents / 60.0)::bigint
           when 'daily'      then (m.seg_days * m.agent_rate_cents)::bigint
           when 'per_cutoff' then case when m.whole_days = 0 then m.agent_rate_cents
                                       else round(m.agent_rate_cents * m.seg_days::numeric / m.whole_days)::bigint end
           /* A month's package, shared by PAID SCHEDULED DAYS (Dee). */
           when 'monthly'    then case when m.whole_days = 0 then 0
                                       else round(public.monthly_share_cents(m.agent_rate_cents, p_from, p_to)
                                                  * m.seg_days::numeric / m.whole_days)::bigint end
         end as agent_cents,
         case m.compensation_basis
           when 'hourly'     then round(m.minutes * m.bes_cost_cents / 60.0)::bigint
           when 'daily'      then (m.seg_days * m.bes_cost_cents)::bigint
           when 'per_cutoff' then case when m.whole_days = 0 then m.bes_cost_cents
                                       else round(m.bes_cost_cents * m.seg_days::numeric / m.whole_days)::bigint end
           when 'monthly'    then case when m.whole_days = 0 then 0
                                       else round(public.monthly_share_cents(m.bes_cost_cents, p_from, p_to)
                                                  * m.seg_days::numeric / m.whole_days)::bigint end
         end as bes_cents
    from measured m
   order by m.seg_from
$function$;
revoke all on function public.compensation_segments(uuid, date, date) from public, anon;
grant execute on function public.compensation_segments(uuid, date, date) to authenticated;

/**
 * The two payables for a period, adjustments included, margin derived.
 *
 *   agent payable = base agent + agent_only + both
 *   BES payable   = base cost  + bes_only   + both
 *   margin        = BES payable − agent payable          (derived, never stored)
 */
create or replace function public.compensation_for_period(p_user uuid, p_from date, p_to date, p_cutoff uuid default null)
returns table(
  arrangement_type text, managing_partner_id uuid, currency text, work_minutes integer, paid_days integer,
  agent_base_cents bigint, bes_base_cents bigint,
  agent_adjustment_cents bigint, bes_adjustment_cents bigint,
  agent_payable_cents bigint, bes_payable_cents bigint, margin_cents bigint)
language sql stable security definer set search_path = public as $function$
  with seg as (select * from public.compensation_segments(p_user, p_from, p_to)),
  base as (
    select (array_agg(s.arrangement_type order by s.segment_from desc))[1] as arrangement_type,
           (array_agg(s.managing_partner_id order by s.segment_from desc))[1] as managing_partner_id,
           (array_agg(s.currency order by s.segment_from desc))[1] as currency,
           coalesce(sum(s.work_minutes), 0)::int as work_minutes,
           coalesce(max(s.period_paid_days), 0)::int as paid_days,
           coalesce(sum(s.agent_cents), 0)::bigint as agent_base,
           coalesce(sum(s.bes_cents), 0)::bigint as bes_base
      from seg s
  ), adj as (
    select coalesce(sum(a.amount_cents) filter (where a.financial_scope in ('agent_only', 'both')), 0)::bigint as agent_adj,
           coalesce(sum(a.amount_cents) filter (where a.financial_scope in ('bes_only', 'both')), 0)::bigint as bes_adj
      from public.compensation_adjustments a
     where a.user_id = p_user
       and (p_cutoff is null or a.cutoff_id = p_cutoff)
       and (a.cutoff_id is not null or a.effective_on between p_from and p_to)
  )
  select b.arrangement_type, b.managing_partner_id, coalesce(b.currency, 'PHP'), b.work_minutes, b.paid_days,
         b.agent_base, b.bes_base, j.agent_adj, j.bes_adj,
         b.agent_base + j.agent_adj, b.bes_base + j.bes_adj,
         (b.bes_base + j.bes_adj) - (b.agent_base + j.agent_adj)
    from base b, adj j
$function$;
revoke all on function public.compensation_for_period(uuid, date, date, uuid) from public, anon;
grant execute on function public.compensation_for_period(uuid, date, date, uuid) to authenticated;

/**
 * A person's OWN payment statement: what they earn, and nothing about what
 * BES pays for them (Dee: "they will only see exactly what they're really
 * earning, not what BES is paying the managing partner").
 */
create or replace function public.my_payment_statement(p_from date, p_to date)
returns table(work_minutes integer, paid_days integer, agent_base_cents bigint, agent_adjustment_cents bigint,
              agent_payable_cents bigint, currency text)
language sql stable security definer set search_path = public as $function$
  select c.work_minutes, c.paid_days, c.agent_base_cents, c.agent_adjustment_cents, c.agent_payable_cents, c.currency
    from public.compensation_for_period(auth.uid(), p_from, p_to) c
$function$;
revoke all on function public.my_payment_statement(date, date) from public, anon;
grant execute on function public.my_payment_statement(date, date) to authenticated;
