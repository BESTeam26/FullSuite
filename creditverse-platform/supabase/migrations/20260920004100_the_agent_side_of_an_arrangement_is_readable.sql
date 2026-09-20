-- An arrangement has two sides, and only one of them is a secret.
--
-- The first cut gated the whole ROW on `compensation.bes_cost.view`, which
-- made the table unreadable to the very people who need the worker's rate:
-- payroll could not see it, and nobody could see their own. The Compensation
-- tab was blank for everybody except the owner.
--
-- The secret is BES's COST, because cost minus pay is the managing partner's
-- margin. Who pays you is not a secret — Archie knows Bryan pays him. So the
-- row opens to the people with a reason to read it, and `bes_cost_cents`
-- alone is revoked at the column level and served through a gated view.
--
-- Same lesson as the payslip: a table grant swallows a column revoke, so the
-- table grant goes and the columns are granted one by one. A column added
-- here later is unreadable until somebody grants it deliberately.

drop policy if exists compensation_arrangements_select on public.compensation_arrangements;
create policy compensation_arrangements_select on public.compensation_arrangements
  for select to authenticated
  using (
    public.reads_bes_cost(agency_id)
    /* Payroll, and the agent-rate capability: the worker's side. */
    or public.reads_agent_rate(agency_id)
    /* Your own pay is yours to read. */
    or user_id = auth.uid()
    /* A managing partner reads the arrangements they are party to. */
    or managing_partner_id = auth.uid()
  );

revoke select on public.compensation_arrangements from authenticated;
grant select (
  id, agency_id, user_id, arrangement_type, compensation_basis, agent_rate_cents,
  managing_partner_id, currency, effective_from, effective_to, reason, created_by, created_at
) on public.compensation_arrangements to authenticated;

/**
 * What BES pays, per arrangement.
 *
 * Runs as the view owner ON PURPOSE: the row policy above admits the worker's
 * own arrangement, and that is the row this view must never answer for them.
 * The gate is entirely in the WHERE clause, and it is the capability.
 */
create or replace view public.compensation_arrangements_internal as
  select a.id, a.user_id, a.agency_id, a.bes_cost_cents,
         (a.bes_cost_cents - a.agent_rate_cents) as margin_cents,
         a.effective_from, a.effective_to
    from public.compensation_arrangements a
   where public.reads_bes_cost(a.agency_id) or a.managing_partner_id = auth.uid();
comment on view public.compensation_arrangements_internal is
  'BES cost and the derived margin per arrangement. Gated on compensation.bes_cost.view, or on being the managing partner being paid. Payroll permission alone does not open it.';
revoke all on public.compensation_arrangements_internal from public, anon;
grant select on public.compensation_arrangements_internal to authenticated;
