-- The released expense is BES's cost.
--
-- A cutoff used to book the sum of the payslips, which was the same thing
-- while BES paid every worker directly. Under a managing partner it is not:
-- BES pays the partner, and the partner pays the worker less. Booking the
-- workers' total would understate the money that actually left BES.
--
-- Regenerated from the live definition — see
-- supabase/scripts/gen-release-books-bes-cost.mjs.

CREATE OR REPLACE FUNCTION public.release_payroll(p_cutoff uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  /* The expense is BES's COST, which is the workers' pay plus any managing
     partner's margin. Booking the workers' side would understate what left
     the bank by exactly the margin. */
  select sum(bes_payout_cents) into v_total
    from public.payslips where cutoff_id = p_cutoff;

  insert into public.agency_expenses
        (agency_id, vendor, description, category, due_date, amount_cents, currency, status, notes)
  values (c.agency_id, 'Payroll',
          'Payroll ' || to_char(c.period_start, 'FMMon DD') || '–' || to_char(c.period_end, 'FMMon DD, YYYY'),
          'payroll', coalesce(c.payday, c.period_end), v_total, v_currency, 'due',
          v_people || ' payslips, released from the payroll cutoff. Source: canonical time and leave records; '
            || 'amounts converted at the rate each payslip recorded. This is what BES pays out, '
            || 'including any managing partner margin.')
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
end $function$
;
