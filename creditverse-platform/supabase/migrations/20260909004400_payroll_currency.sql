-- =============================================================================
-- Salary in USD or PHP, with a recorded conversion (Dee, 2026-09-09).
--
-- ── WHY THE RATE IS DATA, NOT A LIVE LOOKUP ────────────────────────────────
--
-- Dee asked for automatic conversion "based on PayPal exchange rate". PayPal
-- publishes no public rate API: its currency conversion exists only inside a
-- merchant transaction, and the rate it gives is a market rate plus PayPal's
-- own spread. So an honest implementation cannot claim to read PayPal.
--
-- What IS honest, and deterministic (rule 9 — money is never inferred):
--
--   * `paypal_actual`      the rate PayPal really gave, entered from a payout.
--                          The truest number, and the default source.
--   * `market_reference`   a public market rate plus a stated spread in basis
--                          points, so the figure is close and LABELLED as an
--                          estimate rather than passed off as PayPal's.
--
-- ── AND WHY IT FREEZES ─────────────────────────────────────────────────────
--
-- A payslip records the rate used. When the peso moves next week, a released
-- payslip must still say what was paid — the same doctrine as a signed
-- agreement (rule 11, and the D-004 snapshot rule). So `payslips` carries the
-- rate and the converted amount, written once at generation, never re-derived
-- from today's rate.
-- =============================================================================

create type public.fx_rate_source as enum ('paypal_actual', 'market_reference');

create table public.fx_rates (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id),
  base_currency  text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  /* 1 base = `rate` quote. Numeric, not float: money arithmetic does not
     round the way binary floating point does. */
  rate           numeric(18,8) not null check (rate > 0),
  source         public.fx_rate_source not null default 'paypal_actual',
  /* Only meaningful for market_reference: the spread already applied, in
     basis points, so the figure can be explained rather than trusted. */
  spread_bps     integer not null default 0 check (spread_bps >= 0 and spread_bps <= 2000),
  effective_from date not null,
  note           text,
  set_by         uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  constraint fx_rates_pair_differs check (base_currency <> quote_currency),
  unique (agency_id, base_currency, quote_currency, effective_from)
);

comment on table public.fx_rates is
  'Effective-dated currency conversion, entered or fetched — never guessed. A payslip freezes the rate it used; this table is what future payslips read.';

create index fx_rates_lookup on public.fx_rates (agency_id, base_currency, quote_currency, effective_from desc);

alter table public.fx_rates enable row level security;

/* Reading a rate is not reading anybody's pay: any staff member may see it
   (a rate is a public market fact), but only payroll may set one. */
create policy fx_rates_select on public.fx_rates
  for select to authenticated using (public.is_staff_of(agency_id));

create policy fx_rates_write on public.fx_rates
  for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('payroll.manage') and set_by = auth.uid());

revoke all on public.fx_rates from public, anon;
grant select, insert on public.fx_rates to authenticated;

-- ── The one resolver every conversion uses ────────────────────────────────
/**
 * The rate in force for a pair on a date: the latest effective row at or
 * before it. Same currency is 1. NULL means "nobody has recorded this pair" —
 * and a NULL must stop a conversion rather than default to 1, which would
 * silently pay a peso salary as if it were dollars.
 */
create or replace function public.fx_rate_for(
  p_agency uuid, p_base text, p_quote text, p_on date
) returns numeric
language sql stable security definer set search_path = public as $function$
  select case
    when p_base = p_quote then 1::numeric
    else (
      select r.rate from public.fx_rates r
       where r.agency_id = p_agency
         and r.base_currency = p_base
         and r.quote_currency = p_quote
         and r.effective_from <= p_on
       order by r.effective_from desc
       limit 1
    )
  end
$function$;

revoke execute on function public.fx_rate_for(uuid, text, text, date) from public, anon;
grant execute on function public.fx_rate_for(uuid, text, text, date) to authenticated;

-- ── What the agency pays and reports in ───────────────────────────────────
alter table public.payroll_settings
  add column if not exists payout_currency text not null default 'USD'
    check (payout_currency ~ '^[A-Z]{3}$');

comment on column public.payroll_settings.payout_currency is
  'The currency payroll totals and the released expense are stated in. A person''s rate may be in another currency; the payslip records the conversion it used.';

-- ── The payslip freezes the conversion it used ────────────────────────────
alter table public.payslips
  add column if not exists payout_currency text,
  add column if not exists fx_rate numeric(18,8),
  add column if not exists payout_cents bigint;

comment on column public.payslips.fx_rate is
  'The rate used when this payslip was computed, frozen. A later rate change never rewrites a payslip (rule 11).';

/* payout_cents is derived at generation, but stated as a stored column rather
   than a generated one: `gross_cents` may be adjusted after generation, and
   the recompute path below keeps the payout in step deliberately. */
