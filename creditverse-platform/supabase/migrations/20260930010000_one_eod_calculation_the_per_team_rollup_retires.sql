-- One EOD calculation: the per-team rollup retires.
--
-- Dee, 2026-09-30: "Do not maintain two independent calculations."
--
-- `eod_org_rollup(date)` summed production, completed work and time per
-- team for management's "By team" panel — a second path to numbers that
-- `eod_report()` now produces as the organization document, with the same
-- teams as its children. Two functions summing production_logs are two
-- chances to disagree, and the panel that read this one is gone with it.
-- Nothing else depends on the function (pg_depend: none).
--
-- Cost impact: less — one fewer query on the End of Day page.

begin;
drop function if exists public.eod_org_rollup(date);
commit;
