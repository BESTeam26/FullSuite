-- How many days of each kind somebody actually has.
--
-- Dee's Time Off mockup, 2026-09-19, shows balances: "Vacation 12 / 20 days,
-- 8 days available". Nothing in the schema could answer that — `leave_types`
-- knew what leave was CALLED and whether it was paid, never how much of it
-- anybody gets.
--
-- ── DERIVED, NOT A LEDGER ─────────────────────────────────────────────────
--
-- The entitlement is stored; what has been USED is not. Used days are the
-- approved requests in the calendar year, counted the same way the request
-- form counts them — in WORKING days, weekends and federal holidays excluded.
-- A second running total would be a second truth, and the first time somebody
-- withdrew an approved request the two would part company (rule 2).
--
-- ── NULL MEANS NOT TRACKED, NOT ZERO ──────────────────────────────────────
--
-- Bereavement, maternity, paternity and emergency leave are left null rather
-- than guessed at. Zero would read as "you have none", which is both wrong and
-- the kind of wrong somebody only discovers on the worst day of their year.
-- Null says the allowance is not fixed, and Dee can set one with an UPDATE.

alter table public.leave_types
  add column if not exists annual_days integer
    constraint leave_types_annual_days_ck check (annual_days is null or annual_days >= 0);

comment on column public.leave_types.annual_days is
  'Working days of this leave allowed per calendar year. NULL means no fixed allowance — never zero, which would read as "you have none" (Dee, 2026-09-19).';

/* The four Dee's mockup names. The rest stay null until Dee says otherwise. */
update public.leave_types set annual_days = 20 where code = 'vacation' and annual_days is null;
update public.leave_types set annual_days = 5  where code = 'sick'     and annual_days is null;
update public.leave_types set annual_days = 5  where code = 'personal' and annual_days is null;
update public.leave_types set annual_days = 10 where code = 'unpaid'   and annual_days is null;
