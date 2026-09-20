-- Payroll is generated from the arrangement, segment by segment.
--
-- What changes: the generator used to read ONE rate — the one in force at
-- period end — and multiply. It now asks the compensation engine, which
-- prices each stretch of the period with the arrangement that was true then
-- and returns both sides. A rate that changes mid-cutoff is no longer
-- backdated over the whole cutoff.
--
-- What does not change: for a direct arrangement with one rate all period,
-- every number is identical to before. The hourly path multiplies the same
-- payable minutes by the same rate; the monthly path takes the same
-- monthly_share_cents. That equivalence is what the probe checks.
--
-- Adjustments move to compensation_adjustments, where they carry a financial
-- scope (Dee, 2026-09-20). A manager's payslip adjustment stays what it was —
-- one number, one note — but it is now recorded with the scope its
-- arrangement implies: under a managing partner it moves the worker's pay
-- alone, and when BES pays directly it necessarily moves BES's cost too,
-- because BES is the payer.

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

  /* Regenerating a draft replaces it wholesale — a draft is a computation,
     not a record. The adjustments survive, because they live in their own
     table now and are re-read below. */
  delete from public.payslips where cutoff_id = p_cutoff;

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
   where m.agency_id = c.agency_id and m.status = 'active';

  get diagnostics n = row_count;
  return n;
end $function$;

-- ── A manager's adjustment, recorded with its scope ───────────────────────
/**
 * Record or replace the manual adjustment on somebody's cutoff.
 *
 * The scope is not a question the manager is asked, because the arrangement
 * already answers it: when BES pays the worker directly, moving the worker's
 * pay moves BES's cost by definition; under a managing partner it does not,
 * and BES's invoice is unchanged unless somebody says otherwise.
 */
create or replace function public.adjust_payslip(p_payslip uuid, p_cents bigint, p_note text)
returns void
language plpgsql security definer set search_path = public as $function$
declare s record; v_type text; v_scope text; v_actor text;
begin
  select p.*, c.status as cutoff_status, c.period_end into s
    from public.payslips p join public.payroll_cutoffs c on c.id = p.cutoff_id
   where p.id = p_payslip;
  if not found then raise exception 'Payslip not found'; end if;
  if not public.is_staff_of(s.agency_id) or not public.agency_can('payroll.manage') then
    raise exception 'Adjusting payroll needs the payroll permission' using errcode = '42501';
  end if;
  if s.cutoff_status <> 'draft' then
    raise exception 'This cutoff is released. Released payroll is history.';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'An adjustment needs a reason';
  end if;

  select arrangement_type into v_type from public.compensation_arrangements
   where user_id = s.user_id and effective_from <= s.period_end
     and (effective_to is null or effective_to >= s.period_end)
   order by effective_from desc limit 1;
  v_scope := case when coalesce(v_type, 'direct_bes') = 'direct_bes' then 'both' else 'agent_only' end;

  /* One manual adjustment per person per cutoff: setting it replaces it. */
  delete from public.compensation_adjustments
   where cutoff_id = s.cutoff_id and user_id = s.user_id and adjustment_type = 'manual';
  if p_cents <> 0 then
    insert into public.compensation_adjustments
          (agency_id, user_id, cutoff_id, adjustment_type, financial_scope,
           amount_cents, effective_on, reason, approved_by, created_by)
    values (s.agency_id, s.user_id, s.cutoff_id, 'manual', v_scope,
            p_cents, s.period_end, p_note, auth.uid(), auth.uid());
  end if;

  update public.payslips
     set adjustment_cents     = case when p_cents = 0 then 0 else p_cents end,
         bes_adjustment_cents = case when v_scope = 'both' and p_cents <> 0 then p_cents else 0 end,
         adjustment_note      = nullif(btrim(p_note), '')
   where id = p_payslip;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, new_value, visibility)
  values (s.agency_id, 'payslip', p_payslip::text, auth.uid(), v_actor,
          'Payslip adjusted', 'adjustment', p_cents || ' (' || v_scope || '): ' || btrim(p_note), 'bes_internal');
end $function$;
revoke all on function public.adjust_payslip(uuid, bigint, text) from public, anon;
grant execute on function public.adjust_payslip(uuid, bigint, text) to authenticated;
