-- =============================================================================
-- The payroll engine converts — deterministically, and refuses to guess.
--
-- payout_cents becomes GENERATED from the same arithmetic gross_cents uses
-- (base + adjustment) times the frozen rate. Generated, because an adjustment
-- must move the payout with it and a trigger that re-derived it would be a
-- second copy of the rule; and (base + adjustment) rather than gross_cents
-- because Postgres will not let one generated column read another — it is the
-- SAME expression, stated once here and once there, which is the one
-- duplication this shape permits.
--
-- NULL fx_rate means nobody has recorded that currency pair. The payslip is
-- still produced — the unattended sweep must not fail everybody's payroll over
-- one missing rate — but it carries no payout, the panel says so, and RELEASE
-- refuses until every payslip has one. A missing rate never becomes 1.
-- =============================================================================

alter table public.payslips drop column if exists payout_cents;
alter table public.payslips
  add column payout_cents bigint
  generated always as (
    case when fx_rate is null then null
         else round((base_cents + adjustment_cents)::numeric * fx_rate)::bigint
    end
  ) stored;

comment on column public.payslips.payout_cents is
  'The gross expressed in payout_currency at the frozen fx_rate. NULL until a rate exists for the pair — release refuses while any payslip is NULL.';

-- ── Generation records the conversion in force at period end ──────────────
create or replace function public.payroll_generate_internal(p_cutoff uuid)
returns integer
language plpgsql security definer set search_path = public as $function$
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
         payout_currency, fx_rate)
  select p_cutoff, c.agency_id, m.user_id, r.rate_type, r.rate_cents, r.currency,
         coalesce(t.work_min, 0),
         coalesce(pl.paid_leave_min, 0),
         coalesce(pb.paid_break_min, 0),
         case r.rate_type
           when 'per_cutoff' then r.rate_cents
           else ((coalesce(t.work_min, 0) + coalesce(pl.paid_leave_min, 0)
                  + coalesce(pb.paid_break_min, 0))::numeric
                 * r.rate_cents / 60)::bigint
         end,
         v_payout,
         /* The rate in force at PERIOD END — the period being paid, not the
            day somebody happens to press the button. */
         public.fx_rate_for(c.agency_id, r.currency, v_payout, c.period_end)
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
end $function$;

-- ── Release totals the PAYOUT, and says which rate is missing ─────────────
create or replace function public.release_payroll(p_cutoff uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c record;
  v_total bigint;
  v_currency text;
  v_people int;
  v_missing text;
  v_expense uuid;
  v_actor text;
begin
  select * into c from public.payroll_cutoffs where id = p_cutoff;
  if not found then raise exception 'Cutoff not found'; end if;
  if not public.is_staff_of(c.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Releasing payroll needs the payroll permission' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'Already released'; end if;

  select count(*), min(payout_currency) into v_people, v_currency
    from public.payslips where cutoff_id = p_cutoff;
  if coalesce(v_people, 0) = 0 then
    raise exception 'Generate the payroll first — this cutoff has no payslips';
  end if;

  /* One missing conversion stops the release and NAMES the pair, because the
     alternative is an expense that quietly omits somebody's pay. */
  select string_agg(distinct p.currency || '→' || p.payout_currency, ', ')
    into v_missing
    from public.payslips p
   where p.cutoff_id = p_cutoff and p.fx_rate is null;
  if v_missing is not null then
    raise exception 'No exchange rate recorded for %. Set it under Finance → Payroll, then release.', v_missing
      using errcode = '22023';
  end if;

  select sum(payout_cents) into v_total
    from public.payslips where cutoff_id = p_cutoff;

  insert into public.agency_expenses
        (agency_id, vendor, description, category, due_date, amount_cents, currency, status, notes)
  values (c.agency_id, 'Payroll',
          'Payroll ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD, YYYY'),
          'payroll', coalesce(c.payday, c.period_end), v_total, v_currency, 'due',
          v_people || ' payslips, released from the payroll cutoff. Source: canonical time and leave records; '
            || 'amounts converted at the rate each payslip recorded.')
  returning id into v_expense;

  update public.payroll_cutoffs
     set status = 'released', released_by = auth.uid(), released_at = now(), expense_id = v_expense
   where id = p_cutoff;

  /* No agent notification here, deliberately: a release notice carried the
     gross, and money never reaches an agent surface (Dee's rule). */

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (c.agency_id, 'payroll_cutoff', c.id::text, auth.uid(), v_actor,
          'Payroll released', 'status', 'draft',
          'released · ' || v_people || ' payslips · total ' || v_total || ' ' || v_currency, 'bes_internal');
  return v_expense;
end $function$;
