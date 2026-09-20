-- BES pays its people in pesos, so payroll settles in pesos.
--
-- Dee, 2026-09-20: "Set all payouts and agent pay in PHP as again I pay them
-- in peso." BES's income is in dollars, but that is the income side; what
-- leaves the bank for the team leaves in PHP.
--
-- The payout currency was USD, so every payslip needed a PHP→USD conversion
-- and none was recorded — the first release would have refused by name. With
-- the payout in PHP the conversion is the identity, `fx_rate_for` answers 1
-- without a row, and there is no rate to record, go stale, or quietly restate
-- somebody's pay six months from now.
--
-- Nothing about the dollar income changes. Partner invoices, billing and the
-- company's revenue are untouched; this is the payroll payout only.

update public.payroll_settings set payout_currency = 'PHP' where payout_currency <> 'PHP';

/* New money defaults to the currency it is actually paid in, so nobody has to
   remember to change it. Every existing arrangement is already PHP. */
alter table public.member_pay_rates alter column currency set default 'PHP';
alter table public.compensation_arrangements alter column currency set default 'PHP';

do $$
declare v_payout text; v_nonphp int;
begin
  select payout_currency into v_payout from public.payroll_settings limit 1;
  select count(*) into v_nonphp from public.compensation_arrangements
   where effective_to is null and currency <> 'PHP';
  raise notice 'Payroll pays out in %; live arrangements not in PHP: %', v_payout, v_nonphp;
end $$;
