-- The coverage strip cannot be cut at a thousand rows.
--
-- creditops_coverage_states() returns one row per actionable file, and the
-- strip derives both its totals and its filter from those rows (Dee,
-- 2026-09-23: the number and the rows are the same answer). Called through
-- the API, a set-returning function is capped at 1,000 rows WITHOUT an error:
-- 908 rows on 2026-10-03, so once the book passes a thousand actionable files
-- the strip would read "Overdue 0" for files that are overdue — the silent
-- truncation that made every attendance score 15 (P-007).
--
-- creditops_coverage_states_all() returns the same rows as one jsonb value,
-- which the cap does not touch. SECURITY INVOKER, a plain aggregate over the
-- existing function: one definition of the rows, the caller's own row rules.
--
-- Cost impact: none — the same rows in the same single request.

begin;

create or replace function public.creditops_coverage_states_all()
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.client_id, r.department), '[]'::jsonb)
    from public.creditops_coverage_states() r
$$;

revoke execute on function public.creditops_coverage_states_all() from anon, public;
grant execute on function public.creditops_coverage_states_all() to authenticated;

commit;
