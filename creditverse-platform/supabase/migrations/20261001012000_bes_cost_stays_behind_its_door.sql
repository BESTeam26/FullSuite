-- BES cost stays behind its door (Go-Live Stabilization Pass, 2026-10-01).
--
-- Found while re-scoping payroll (GO_LIVE_STABILIZATION_PASS.md, "BRYAN /
-- BES COST MUST REMAIN SEPARATE"):
--
--   1. compensation_segments() and compensation_for_period() are SECURITY
--      DEFINER, executable by `authenticated`, and check nothing. Any signed-in
--      user could call them with any user id and read that person's agent rate,
--      BES cost and margin. They are internal pricing steps of the payroll
--      generator, which runs as the owner; nothing in the client calls them.
--      payable_minutes() and paid_scheduled_days() are the same shape over the
--      hours side. All four lose execute from `authenticated` and `anon`.
--
--   2. adjust_payslip() inserts a compensation_adjustments row with
--      adjustment_type = 'manual', which the check constraint does not allow.
--      Every non-zero adjustment failed with 23514. The constraint learns the
--      type the function has always written; the "one manual adjustment per
--      person per cutoff, setting it replaces it" rule depends on that name.
--
--   3. Two audit texts carried BES-side figures into rows readable by agent
--      payroll eyes: the release event ("total <bes_payout>") and the audit of
--      a bes_only adjustment ("funded by bes_only"). The release event now
--      names the count only (the amount is the agency_expenses row, behind
--      expenses.view); a bes_only adjustment audits under field
--      'compensation', which the activity policy already keeps behind
--      compensation.bes_cost.view.

revoke execute on function public.compensation_segments(uuid, date, date) from authenticated, anon, public;
revoke execute on function public.compensation_for_period(uuid, date, date, uuid) from authenticated, anon, public;
revoke execute on function public.payable_minutes(uuid, date, date) from authenticated, anon, public;
revoke execute on function public.paid_scheduled_days(uuid, date, date) from authenticated, anon, public;

alter table public.compensation_adjustments
  drop constraint if exists compensation_adjustments_adjustment_type_check;
alter table public.compensation_adjustments
  add constraint compensation_adjustments_adjustment_type_check
  check (adjustment_type in ('bonus', 'deduction', 'reimbursement', 'correction', 'fee', 'other', 'manual'));

create or replace function public.compensation_adjustments_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (new.agency_id, 'profile', new.user_id::text, auth.uid(), v_actor, 'Compensation adjustment',
          /* A BES-side adjustment is BES-side history: it reads under the
             same field as the arrangement itself, which the activity policy
             gates on compensation.bes_cost.view. */
          case when new.financial_scope = 'bes_only' then 'compensation' else 'adjustment' end,
          null,
          new.adjustment_type || ' ' || new.amount_cents || ' funded by ' || new.financial_scope || ' · ' || new.reason, 'bes_internal');
  return new;
end $$;

create or replace function public.release_payroll(p_cutoff uuid)
returns uuid language plpgsql security definer set search_path = public as $$
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

  /* The event says WHAT happened, never what it cost: a cutoff is readable
     by everyone with agent-payroll scope, and the BES total is not theirs.
     The amount lives on the expense row, behind expenses.view. */
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (c.agency_id, 'payroll_cutoff', c.id::text, auth.uid(), v_actor,
          'Payroll released', 'status', 'draft',
          'released · ' || v_people || ' payslips', 'bes_internal');
  return v_expense;
end $$;
