-- Revoking a column does nothing while the table itself is granted.
--
-- The previous migration revoked SELECT on the internal money columns. It had
-- no effect: `grant select on payslips` covers every column, present and
-- future, and a column-level revoke cannot carve a hole in it. The probe
-- caught this — the eight columns were still readable by `authenticated`.
--
-- So the table grant goes, and SELECT is granted column by column instead.
-- The internal columns are simply not on the list, which also means a column
-- added to this table later is NOT readable until somebody says it is —
-- default to deny (rule 1).

revoke select on public.payslips from authenticated;
grant select (
  id, cutoff_id, agency_id, user_id, rate_type, rate_cents, currency,
  work_minutes, paid_leave_minutes, paid_break_minutes, paid_days,
  base_cents, adjustment_cents, adjustment_note, gross_cents,
  payout_currency, fx_rate, payout_cents, rate_basis, created_at
) on public.payslips to authenticated;

comment on table public.payslips is
  'One payslip per person per cutoff. The agent-side columns are granted to authenticated; BES cost, partner and margin are NOT, and are served only through payslips_internal. A column added here is unreadable until it is granted deliberately.';
