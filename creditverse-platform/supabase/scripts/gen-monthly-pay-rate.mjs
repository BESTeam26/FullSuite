/**
 * Monthly pay packages: the migration, generated.
 *
 * Two live functions gain one branch each by string replacement over their
 * pg_get_functiondef output — never a retype. New functions are written here
 * in full because they are new.
 *
 * Run: node supabase/scripts/gen-monthly-pay-rate.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const live = (fn) => q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='${fn}' and pronamespace='public'::regnamespace`)[0].d;
const once = (text, marker, replacement, what) => {
  const n = text.split(marker).length - 1;
  if (n !== 1) { console.error(`${what}: expected exactly one marker, found ${n}\n${marker}`); process.exit(1); }
  return text.replace(marker, replacement);
};

/* ── set_member_pay_rate: accept 'monthly' ─────────────────────────────── */
let setRate = live("set_member_pay_rate");
setRate = once(setRate,
  `if p_rate_type not in ('hourly', 'per_cutoff') then
    raise exception 'rate_type is hourly or per_cutoff';`,
  `if p_rate_type not in ('hourly', 'per_cutoff', 'monthly') then
    raise exception 'rate_type is hourly, per_cutoff or monthly';`,
  "set_member_pay_rate");

/* ── payroll_generate_internal: the monthly share, and the frozen basis ── */
let gen = live("payroll_generate_internal");
gen = once(gen,
  `work_minutes, paid_leave_minutes, paid_break_minutes, base_cents,
         payout_currency, fx_rate)`,
  `work_minutes, paid_leave_minutes, paid_break_minutes, base_cents,
         payout_currency, fx_rate, rate_basis)`,
  "payroll insert columns");
gen = once(gen,
  `case r.rate_type
           when 'per_cutoff' then r.rate_cents
           else`,
  `case r.rate_type
           when 'per_cutoff' then r.rate_cents
           /* A monthly package pays its share of the month — see
              monthly_share_cents. Deductions for unpaid absence are the
              manager's adjustment for now, priced by the frozen basis. */
           when 'monthly'    then public.monthly_share_cents(r.rate_cents, c.period_start, c.period_end)
           else`,
  "payroll base case");
gen = once(gen,
  `public.fx_rate_for(c.agency_id, r.currency, v_payout, c.period_end)
    from public.agency_memberships m`,
  `public.fx_rate_for(c.agency_id, r.currency, v_payout, c.period_end),
         /* What an hour and a day were worth in this period, frozen with
            the payslip so a later schedule or rate change cannot restate it. */
         (select to_jsonb(b) from public.pay_rate_breakdown(m.user_id, c.period_end) b)
    from public.agency_memberships m`,
  "payroll basis snapshot");

const sql = `-- Monthly pay packages, with daily and hourly rates DERIVED.
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

${setRate};

${gen};
`;
writeFileSync("supabase/migrations/20260919009000_monthly_pay_rate.sql", sql);
console.log("written");
