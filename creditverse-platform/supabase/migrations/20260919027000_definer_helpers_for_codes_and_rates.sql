-- Phase 47 of the RLS gate: "no SECURITY DEFINER function calls a helper
-- whose correctness depends on caller RLS." Two helpers added this week broke
-- the rule — both are derivations whose answer must not change with who asks.
--
-- employee_code_for counts every membership of the agency to number a person;
-- under a caller's RLS a non-admin would count fewer and mint a wrong, possibly
-- colliding, code. It becomes SECURITY DEFINER and is callable only through
-- the triggers and recompute that already own it.
--
-- pay_rate_breakdown derives a day and an hour from the rate and schedule. It
-- becomes SECURITY DEFINER with its own gate — payroll capability, or the
-- payroll generator itself — so it neither leaks a rate to whoever calls it
-- nor depends on the caller being allowed to read member_pay_rates.

create or replace function public.employee_code_for(p_agency uuid, p_membership uuid, p_user uuid, p_joined timestamptz, p_is_owner boolean default false)
returns text language sql stable security definer set search_path = public as $function$
  with person as (
    select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
           coalesce(p.is_fixture, false) as fixture
      from public.profiles p where p.id = p_user
  ), words as (
    select regexp_split_to_array(trim(regexp_replace(regexp_replace(name, '[^[:alpha:] ]', '', 'g'), '\s+', ' ', 'g')), ' ') as w, fixture from person
  ), initials as (
    select case when fixture then 'FX'
                else coalesce(nullif(upper(left(w[1], 1)) || upper(left(w[array_length(w, 1)], 1)), ''), 'XX') end as ini,
           fixture
      from words
  ), seq as (
    select count(*) + 1 as n
      from public.agency_memberships m join public.profiles mp on mp.id = m.user_id
     where m.agency_id = p_agency
       and coalesce(mp.is_fixture, false) = (select fixture from person)
       and (coalesce(m.hired_on::timestamptz, m.created_at), not m.is_owner, m.id)
           < (p_joined, not coalesce(p_is_owner, false), p_membership)
  )
  select initials.ini || to_char(p_joined, 'MMYYYY') || '-' || lpad(seq.n::text, 3, '0') from initials, seq
$function$;
revoke all on function public.employee_code_for(uuid, uuid, uuid, timestamptz, boolean) from public, anon, authenticated;

create or replace function public.pay_rate_breakdown(p_user uuid, p_on date default ((now() at time zone 'utc'))::date)
returns table(rate_type text, rate_cents bigint, currency text, days_per_year integer, paid_minutes_per_day integer, daily_cents bigint, hourly_cents bigint)
language sql stable security definer set search_path = public as $function$
  with r as (
    select rate_type, rate_cents, currency, agency_id from public.member_pay_rates
     where user_id = p_user and effective_from <= p_on
     order by effective_from desc limit 1
  ), allowed as (
    /* Payroll capability in the person's agency, or the payroll generator
       itself (no session). Nobody else derives anybody's pay. */
    select exists (select 1 from r where auth.uid() is null or public.reads_payroll_of(r.agency_id)) as ok
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
    from r left join f on true, allowed
   where allowed.ok
$function$;
revoke all on function public.pay_rate_breakdown(uuid, date) from public, anon;
grant execute on function public.pay_rate_breakdown(uuid, date) to authenticated;
