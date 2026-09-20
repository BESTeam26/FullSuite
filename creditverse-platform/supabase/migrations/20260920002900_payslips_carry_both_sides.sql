-- A payslip now carries both sides of the arrangement.
--
-- What the worker earns was always here: base_cents + adjustment_cents =
-- gross_cents. What BES PAYS for that worker was not, because until today it
-- was assumed to be the same number. Under a managing partner it is not.
--
--   gross_cents      the worker's money        ← the payslip they see
--   bes_total_cents  what BES pays out         ← the expense BES books
--   margin_cents     the difference, DERIVED   ← the partner's, never an
--                                                extra expense and never
--                                                shown on the worker's slip
--
-- For a direct arrangement the two are equal and the margin is zero, which is
-- exactly what every payslip generated before today meant.

alter table public.payslips
  add column if not exists arrangement_type     text not null default 'direct_bes',
  add column if not exists managing_partner_id  uuid references public.profiles(id) on delete set null,
  add column if not exists bes_cost_cents       bigint not null default 0,
  add column if not exists bes_adjustment_cents bigint not null default 0,
  add column if not exists paid_days            integer not null default 0,
  /* How the period was priced: one entry per arrangement segment, frozen, so
     a payslip can always show its own working even after a rate changes. */
  add column if not exists segments             jsonb;

alter table public.payslips drop column if exists bes_total_cents;
alter table public.payslips drop column if exists margin_cents;
alter table public.payslips drop column if exists bes_payout_cents;
alter table public.payslips
  add column bes_total_cents bigint generated always as (bes_cost_cents + bes_adjustment_cents) stored,
  add column margin_cents    bigint generated always as
    ((bes_cost_cents + bes_adjustment_cents) - (base_cents + adjustment_cents)) stored,
  add column bes_payout_cents bigint generated always as
    (case when fx_rate is null then null
          else round((bes_cost_cents + bes_adjustment_cents)::numeric * fx_rate)::bigint end) stored;

comment on column public.payslips.bes_total_cents is
  'What BES pays for this person this period. Equals the gross for a direct arrangement; the partner''s invoice under a managing partner.';
comment on column public.payslips.margin_cents is
  'BES cost minus worker pay. The managing partner''s margin — derived, never a second expense, never on the worker''s payslip.';

/* Every payslip written before today was a direct arrangement, so its cost
   was its gross. Stating that explicitly keeps history readable. */
update public.payslips set bes_cost_cents = base_cents, bes_adjustment_cents = adjustment_cents
 where bes_cost_cents = 0 and base_cents <> 0;

-- ── The worker's own payslip must not carry the internal numbers ──────────
/**
 * A payslip as its owner may see it: their money, and nothing about what BES
 * paid for them. Dee: "they will only see exactly what they're really
 * earning, not what BES is paying the managing partner."
 */
create or replace view public.my_payslips with (security_invoker = true) as
  select p.id, p.cutoff_id, c.period_start, c.period_end, c.payday, c.status,
         p.rate_type, p.rate_cents, p.currency, p.rate_basis,
         p.work_minutes, p.paid_leave_minutes, p.paid_break_minutes, p.paid_days,
         p.base_cents, p.adjustment_cents, p.adjustment_note, p.gross_cents,
         p.payout_currency, p.fx_rate, p.payout_cents, p.created_at
    from public.payslips p
    join public.payroll_cutoffs c on c.id = p.cutoff_id
   where p.user_id = auth.uid();
comment on view public.my_payslips is
  'Your own payslips, agent side only. BES cost, partner and margin are deliberately absent — this is the shape a worker is shown.';
revoke all on public.my_payslips from public, anon;
grant select on public.my_payslips to authenticated;
