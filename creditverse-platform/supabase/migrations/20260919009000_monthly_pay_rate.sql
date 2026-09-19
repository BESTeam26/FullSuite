-- Monthly pay packages, with daily and hourly rates DERIVED.
--
-- Dee, 2026-09-19: "I have agents with monthly package and I only calculate
-- their hourly rate manually, I need a way to enter their monthly package
-- then the system will auto calculate that."
--
-- A rate may now be 'monthly'. The stored fact is the package; the daily and
-- hourly figures are derived by ONE function, pay_rate_breakdown, from the
-- package and the person's work schedule:
--
--   days per year   = 365 - 52 × (7 - work days per week)   5-day → 261, 6-day → 313
--   daily           = monthly × 12 ÷ days per year
--   hourly          = daily ÷ paid hours per shift           (shift minus lunch)
--
-- The factor comes from the schedule, not a constant, so a Mon–Sat person and
-- a Mon–Fri person are priced by the week they actually work — and a person
-- with no schedule gets no derived rate rather than a guessed one.
--
-- Per cutoff, a monthly package pays its share of the month
-- (monthly_share_cents): the first semi-monthly half floors, the second
-- carries the odd cent, so two halves always sum to exactly one package; a
-- cutoff spanning a whole month pays the whole package. Payslips freeze the
-- breakdown they were priced with (rate_basis).
--
-- set_member_pay_rate and payroll_generate_internal are GENERATED from their
-- live definitions by supabase/scripts/gen-monthly-pay-rate.mjs.

alter table public.member_pay_rates drop constraint member_pay_rates_rate_type_check;
alter table public.member_pay_rates add constraint member_pay_rates_rate_type_check
  check (rate_type in ('hourly', 'per_cutoff', 'monthly'));

alter table public.payslips add column if not exists rate_basis jsonb;
comment on column public.payslips.rate_basis is
  'pay_rate_breakdown at period end, frozen: days_per_year, paid_minutes_per_day, daily_cents, hourly_cents. Evidence for how this payslip was priced; never recomputed.';

create or replace function public.monthly_share_cents(p_monthly bigint, p_start date, p_end date)
returns bigint
language sql immutable as $function$
  select case
    /* A whole calendar month pays the package. */
    when extract(day from p_start) = 1
     and p_end = (date_trunc('month', p_start::timestamp) + interval '1 month - 1 day')::date
      then p_monthly
    /* Semi-monthly: first half floors, second half carries the odd cent. */
    when extract(day from p_start) = 1 then p_monthly / 2
    else p_monthly - p_monthly / 2
  end
$function$;
comment on function public.monthly_share_cents(bigint, date, date) is
  'What a monthly package pays for one payroll period. Two semi-monthly halves sum to exactly the package; a whole month pays it once.';

create or replace function public.pay_rate_breakdown(p_user uuid, p_on date default (now() at time zone 'utc')::date)
returns table (
  rate_type text, rate_cents bigint, currency text,
  days_per_year integer, paid_minutes_per_day integer,
  daily_cents bigint, hourly_cents bigint
)
language sql stable set search_path = public as $function$
  with r as (
    select rate_type, rate_cents, currency from public.member_pay_rates
     where user_id = p_user and effective_from <= p_on
     order by effective_from desc limit 1
  ), s as (
    select work_days, shift_start, shift_end, lunch_minutes from public.work_schedules
     where user_id = p_user and effective_from <= p_on
     order by effective_from desc limit 1
  ), f as (
    select (365 - 52 * (7 - array_length(s.work_days, 1)))::integer as days_per_year,
           greatest(0, (extract(epoch from (s.shift_end - s.shift_start)) / 60)::integer - s.lunch_minutes)::integer
             as paid_minutes_per_day
      from s
  )
  select r.rate_type, r.rate_cents, r.currency, f.days_per_year, f.paid_minutes_per_day,
         case r.rate_type
           when 'monthly' then round(r.rate_cents * 12.0 / f.days_per_year)::bigint
           when 'hourly'  then round(r.rate_cents * f.paid_minutes_per_day / 60.0)::bigint
         end as daily_cents,
         case r.rate_type
           when 'monthly' then case when f.paid_minutes_per_day > 0
                                 then round(r.rate_cents * 12.0 / f.days_per_year * 60 / f.paid_minutes_per_day)::bigint end
           when 'hourly'  then r.rate_cents
         end as hourly_cents
    from r left join f on true
$function$;
comment on function public.pay_rate_breakdown(uuid, date) is
  'The one derivation of daily and hourly pay from the rate and schedule in force on a date. SECURITY INVOKER: the caller sees a breakdown only where they may see the rate (payroll.view / payroll.manage). Inside payroll generation it runs as the definer.';

revoke all on function public.monthly_share_cents(bigint, date, date) from public, anon;
grant execute on function public.monthly_share_cents(bigint, date, date) to authenticated;
revoke all on function public.pay_rate_breakdown(uuid, date) from public, anon;
grant execute on function public.pay_rate_breakdown(uuid, date) to authenticated;

CREATE OR REPLACE FUNCTION public.set_member_pay_rate(p_user uuid, p_rate_type text, p_rate_cents bigint, p_currency text DEFAULT 'USD'::text, p_effective_from date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency uuid; v_actor text; v_id uuid; v_before text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = p_user and status = 'active' limit 1;
  if v_agency is null then raise exception 'That person is not an active member of the agency'; end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('payroll.manage') then
    raise exception 'Setting a rate needs the payroll permission' using errcode = '42501';
  end if;
  if p_rate_type not in ('hourly', 'per_cutoff', 'monthly') then
    raise exception 'rate_type is hourly, per_cutoff or monthly';
  end if;

  select rate_type || ' ' || rate_cents || ' ' || currency into v_before
    from public.member_pay_rates
   where user_id = p_user and effective_from <= p_effective_from
   order by effective_from desc limit 1;

  insert into public.member_pay_rates (agency_id, user_id, rate_type, rate_cents, currency, effective_from, created_by)
  values (v_agency, p_user, p_rate_type, p_rate_cents, upper(p_currency), p_effective_from, auth.uid())
  on conflict (user_id, effective_from) do update
    set rate_type = excluded.rate_type, rate_cents = excluded.rate_cents,
        currency = excluded.currency, created_by = excluded.created_by
  returning id into v_id;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (v_agency, 'pay_rate', p_user::text, auth.uid(), v_actor,
          'Pay rate set', 'rate', v_before,
          p_rate_type || ' ' || p_rate_cents || ' ' || upper(p_currency) || ' from ' || p_effective_from,
          'bes_internal');
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.payroll_generate_internal(p_cutoff uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record;
  v_payout text;
  n integer;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if c.status <> 'draft' then
    raise exception 'This cutoff is released. Released payroll is history.';
  end if;

  select coalesce(payout_currency, 'USD') into v_payout
    from public.payroll_settings where agency_id = c.agency_id;
  v_payout := coalesce(v_payout, 'USD');

  delete from public.payslips where cutoff_id = p_cutoff;

  insert into public.payslips
        (cutoff_id, agency_id, user_id, rate_type, rate_cents, currency,
         work_minutes, paid_leave_minutes, paid_break_minutes, base_cents,
         payout_currency, fx_rate, rate_basis)
  select p_cutoff, c.agency_id, m.user_id, r.rate_type, r.rate_cents, r.currency,
         coalesce(t.work_min, 0),
         coalesce(pl.paid_leave_min, 0),
         coalesce(pb.paid_break_min, 0),
         case r.rate_type
           when 'per_cutoff' then r.rate_cents
           /* A monthly package pays its share of the month — see
              monthly_share_cents. Deductions for unpaid absence are the
              manager's adjustment for now, priced by the frozen basis. */
           when 'monthly'    then public.monthly_share_cents(r.rate_cents, c.period_start, c.period_end)
           else ((coalesce(t.work_min, 0) + coalesce(pl.paid_leave_min, 0)
                  + coalesce(pb.paid_break_min, 0))::numeric
                 * r.rate_cents / 60)::bigint
         end,
         v_payout,
         /* The rate in force at PERIOD END — the period being paid, not the
            day somebody happens to press the button. */
         public.fx_rate_for(c.agency_id, r.currency, v_payout, c.period_end),
         /* What an hour and a day were worth in this period, frozen with
            the payslip so a later schedule or rate change cannot restate it. */
         (select to_jsonb(b) from public.pay_rate_breakdown(m.user_id, c.period_end) b)
    from public.agency_memberships m
    join lateral (
      select rate_type, rate_cents, currency
        from public.member_pay_rates r
       where r.user_id = m.user_id and r.effective_from <= c.period_end
       order by r.effective_from desc limit 1
    ) r on true
    left join lateral (
      select sum(te.duration_minutes)::int as work_min
        from public.time_entries te
       where te.employee_id = m.user_id and te.kind = 'work'
         and te.ended_at is not null
         and te.work_date between c.period_start and c.period_end
    ) t on true
    left join lateral (
      select sum(least(day_break.mins, coalesce(s.break_minutes, 0)))::int as paid_break_min
        from (
          select te.work_date, sum(te.duration_minutes)::int as mins
            from public.time_entries te
           where te.employee_id = m.user_id and te.kind = 'break'
             and te.ended_at is not null
             and te.work_date between c.period_start and c.period_end
           group by te.work_date
        ) day_break
        left join lateral (
          select break_minutes from public.work_schedules ws
           where ws.user_id = m.user_id and ws.effective_from <= day_break.work_date
           order by ws.effective_from desc limit 1
        ) s on true
    ) pb on true
    left join lateral (
      select sum(
               greatest(0, (extract(epoch from (s.shift_end - s.shift_start)) / 60)::int - s.lunch_minutes)
             )::int as paid_leave_min
        from public.leave_requests lr
        join public.leave_types lt on lt.id = lr.type_id and lt.paid
        cross join lateral generate_series(
          greatest(lr.starts_on, c.period_start),
          least(lr.ends_on, c.period_end), interval '1 day') as d(day)
        join lateral (
          select * from public.work_schedules ws
           where ws.user_id = m.user_id and ws.effective_from <= d.day::date
           order by ws.effective_from desc limit 1
        ) s on extract(isodow from d.day)::smallint = any (s.work_days)
       where lr.user_id = m.user_id and lr.status = 'approved'
    ) pl on true
   where m.agency_id = c.agency_id and m.status = 'active';

  get diagnostics n = row_count;
  return n;
end $function$
;
