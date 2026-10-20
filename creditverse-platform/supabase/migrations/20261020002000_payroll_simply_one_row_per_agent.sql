-- Payroll, simply: one row per agent — name, running hours, rate, Generate payslip.
--
-- Dee, 2026-10-20: "The payroll creation and payslip is too chaotic. Right
-- now it's all over the place. I want it simple: Agent Name · Running
-- Hours · Rate · Generate Payslip. On the admin view."
--
-- Nothing new is calculated. payroll_period_summary() reads what the
-- engines already compute — payable_minutes() for the hours, the
-- arrangement and pay_rate_breakdown() for the rate, the draft payslip if
-- one exists — for exactly the people payroll_people() says the caller may
-- pay, one request for the whole table. generate_payroll() gains an optional
-- person so one row's button recomputes one payslip; the cutoff-wide form
-- is unchanged. BES-side cost never appears here (payroll doctrine).
--
-- Cost impact: none (one bounded query per screen open).

begin;

drop function if exists public.payroll_generate_internal(uuid);
CREATE OR REPLACE FUNCTION public.payroll_generate_internal(p_cutoff uuid, p_user uuid DEFAULT NULL::uuid)
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

  /* Regenerating a draft replaces it wholesale — a draft is a computation,
     not a record. The adjustments survive, because they live in their own
     table now and are re-read below. */
  /* One person when asked (the simple payroll screen's per-row button), everyone otherwise. */
  delete from public.payslips where cutoff_id = p_cutoff and (p_user is null or user_id = p_user);

  insert into public.payslips
        (cutoff_id, agency_id, user_id, rate_type, rate_cents, currency,
         work_minutes, paid_leave_minutes, paid_break_minutes, paid_days,
         base_cents, adjustment_cents, bes_cost_cents, bes_adjustment_cents,
         arrangement_type, managing_partner_id, segments,
         payout_currency, fx_rate, rate_basis)
  select p_cutoff, c.agency_id, m.user_id,
         a.compensation_basis, a.agent_rate_cents, comp.currency,
         mins.work_minutes, mins.paid_leave_minutes, mins.paid_break_minutes, comp.paid_days,
         comp.agent_base_cents, comp.agent_adjustment_cents,
         comp.bes_base_cents,   comp.bes_adjustment_cents,
         comp.arrangement_type, comp.managing_partner_id,
         (select jsonb_agg(to_jsonb(s)) from public.compensation_segments(m.user_id, c.period_start, c.period_end) s),
         v_payout,
         /* The rate in force at PERIOD END — the period being paid, not the
            day somebody happens to press the button. */
         public.fx_rate_for(c.agency_id, comp.currency, v_payout, c.period_end),
         /* What an hour and a day were worth in this period, frozen with
            the payslip so a later schedule or rate change cannot restate it. */
         (select to_jsonb(b) from public.pay_rate_breakdown(m.user_id, c.period_end) b)
    from public.agency_memberships m
    /* The arrangement in force at period end names the basis and the rate the
       payslip is stamped with. No arrangement, no payslip — an unpriced
       person is surfaced by their absence, not paid zero. */
    join lateral (
      select compensation_basis, agent_rate_cents
        from public.compensation_arrangements x
       where x.user_id = m.user_id and x.effective_from <= c.period_end
         and (x.effective_to is null or x.effective_to >= c.period_end)
       order by x.effective_from desc limit 1
    ) a on true
    join lateral public.compensation_for_period(m.user_id, c.period_start, c.period_end, p_cutoff) comp on true
    join lateral public.payable_minutes(m.user_id, c.period_start, c.period_end) mins on true
   where m.agency_id = c.agency_id and m.status = 'active'
     and (p_user is null or m.user_id = p_user);

  get diagnostics n = row_count;
  return n;
end $function$
;

create or replace function public.generate_payroll(p_cutoff uuid, p_user uuid default null)
returns integer language plpgsql security definer set search_path = public as $function$
declare c record;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.has_payroll_scope(c.agency_id) then
    raise exception 'Generating payroll needs payroll scope' using errcode = '42501';
  end if;
  if p_user is not null and p_user not in (select user_id from public.payroll_people()) then
    raise exception 'That person is outside your payroll scope' using errcode = '42501';
  end if;
  return public.payroll_generate_internal(p_cutoff, p_user);
end;
$function$;
drop function if exists public.generate_payroll(uuid);
revoke all on function public.generate_payroll(uuid, uuid) from public, anon;
grant execute on function public.generate_payroll(uuid, uuid) to authenticated;

create or replace function public.payroll_period_summary(p_from date, p_to date, p_cutoff uuid default null)
returns table(
  user_id uuid, full_name text,
  work_minutes integer,
  basis text, rate_cents bigint, currency text, hourly_cents bigint,
  payslip_id uuid, gross_cents bigint, payslip_status text)
language sql stable security definer set search_path = public as $function$
  select m.user_id, coalesce(p.full_name, p.email) as full_name,
         coalesce((select pm.work_minutes from public.payable_minutes(m.user_id, p_from, p_to) pm), 0)::int as work_minutes,
         a.compensation_basis, a.agent_rate_cents, a.currency,
         (select b.hourly_cents from public.pay_rate_breakdown(m.user_id, p_to) b),
         s.id, s.gross_cents,
         case when s.id is null then null when c.status = 'released' then 'released' else 'draft' end
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id and coalesce(p.is_fixture, false) = false
    left join lateral (
      select x.compensation_basis, x.agent_rate_cents, x.currency
        from public.compensation_arrangements x
       where x.user_id = m.user_id and x.effective_from <= p_to and (x.effective_to is null or x.effective_to >= p_to)
       order by x.effective_from desc limit 1) a on true
    left join public.payslips s on s.user_id = m.user_id and s.cutoff_id = p_cutoff
    left join public.payroll_cutoffs c on c.id = s.cutoff_id
   where m.status = 'active'
     and m.user_id in (select user_id from public.payroll_people())
   order by full_name
$function$;
comment on function public.payroll_period_summary(date, date, uuid) is
  'The simple payroll table: each person the caller may pay, their payable minutes in the period, the rate in force, and their payslip in the cutoff if any. Agent side only.';
revoke all on function public.payroll_period_summary(date, date, uuid) from public, anon;
grant execute on function public.payroll_period_summary(date, date, uuid) to authenticated;

commit;
