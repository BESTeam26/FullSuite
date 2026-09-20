-- Row permission is not column permission.
--
-- A worker may read their own payslip row — that is the point of a payslip.
-- But the row now also carries what BES paid for them and the partner's
-- margin, and PostgREST hands back whatever columns the role may select. So
-- the internal columns are revoked from `authenticated` outright: nobody
-- reads them off the table, whatever their row permission says.
--
-- They are served instead through one gated view. The gate is
-- compensation.bes_cost.view, the same capability the arrangement itself
-- needs — so payroll permission alone shows the worker's money and not
-- BES's cost, which is exactly the separation Dee asked for.

revoke select (bes_cost_cents, bes_adjustment_cents, bes_total_cents, margin_cents,
               bes_payout_cents, managing_partner_id, arrangement_type, segments)
  on public.payslips from authenticated;

/**
 * The internal side of a payslip: BES's cost, the partner, the margin, and
 * how the period was priced.
 *
 * Runs as the view owner ON PURPOSE — the row policy on payslips would admit
 * a worker's own row, and that is the row this view must never return to
 * them. The whole gate is therefore in the WHERE clause, and it is the
 * capability, not the row.
 */
create or replace view public.payslips_internal as
  select p.id, p.cutoff_id, p.user_id, p.agency_id,
         p.arrangement_type, p.managing_partner_id,
         p.bes_cost_cents, p.bes_adjustment_cents, p.bes_total_cents,
         p.margin_cents, p.bes_payout_cents, p.paid_days, p.segments
    from public.payslips p
   where public.reads_bes_cost(p.agency_id);
comment on view public.payslips_internal is
  'BES cost, partner and margin per payslip. Gated on compensation.bes_cost.view — payroll permission alone does not open it, and a worker never sees their own row here.';
revoke all on public.payslips_internal from public, anon;
grant select on public.payslips_internal to authenticated;

/**
 * What BES owes each managing partner for a cutoff — the settlement.
 *
 * The partner's own row is theirs to read without the internal capability:
 * they are being invoiced, so they must see the invoice. Everyone else needs
 * compensation.bes_cost.view.
 */
create or replace view public.managing_partner_settlements as
  select p.cutoff_id, c.period_start, c.period_end, c.status, p.agency_id,
         p.managing_partner_id,
         count(*)::int                        as people,
         sum(p.bes_total_cents)::bigint       as bes_pays_partner_cents,
         sum(p.gross_cents)::bigint           as partner_pays_workers_cents,
         sum(p.margin_cents)::bigint          as partner_margin_cents,
         min(p.currency)                      as currency
    from public.payslips p
    join public.payroll_cutoffs c on c.id = p.cutoff_id
   where p.managing_partner_id is not null
     and (public.reads_bes_cost(p.agency_id) or p.managing_partner_id = auth.uid())
   group by p.cutoff_id, c.period_start, c.period_end, c.status, p.agency_id, p.managing_partner_id;
comment on view public.managing_partner_settlements is
  'Per cutoff, what BES owes a managing partner and what that partner owes their workers. A partner may read their own settlement; anyone else needs compensation.bes_cost.view.';
revoke all on public.managing_partner_settlements from public, anon;
grant select on public.managing_partner_settlements to authenticated;
