-- The time_entries read rule is answered once per request, not once per row
-- (Go-Live NEEDS FIX: Reporting for leads at or over the 2 s guard).
--
-- Measured 2026-10-03, per role, source by source: Reporting's facts view
-- costs ~0.8 s for the executive and division lead but 1.7–1.8 s for
-- department and team leads (1.3 s for an agent). All of the difference is
-- the 'time' source — 335 ms for the executive, 1,129–1,163 ms for leads —
-- because time_entries_select called is_manager_of(agency_id) on EVERY row.
-- For an admin is_admin_of() answers at once; for everyone else it falls
-- through to resolve_agency_capability('ops.manage'), ~1.3 ms, × 841 rows.
-- The answer cannot differ between rows of one agency, so it is now taken
-- once per statement:
--
--   my_staff_agency_ids()    the agencies where is_staff_of(id)
--   my_managed_agency_ids()  the agencies where is_manager_of(id)
--
-- Both DEFINER, so the agencies table's own rule cannot narrow the set — the
-- same functions answer the same question they answered per row. The rule's
-- meaning is unchanged: a staff member reads their own entries; somebody
-- who manages the agency reads its entries. Every time entry belongs to an
-- agency row (0 orphans), so set membership equals the per-row call.
--
-- Not changed here, recorded separately: whether ops.manage should reach
-- EVERY entry in the agency (CLAUDE.md §20b — ops.manage is not
-- company-wide). That is a visibility decision, not a speed fix.
--
-- Proven per account, old rule against new, in one rolled-back transaction:
-- the same visible time entries, and the same Reporting pivot and scope
-- options, for every sign-in account.
--
-- Cost impact: less database time on Reporting and every time screen.

begin;

create or replace function public.my_staff_agency_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.id from public.agencies a where public.is_staff_of(a.id)
$$;

create or replace function public.my_managed_agency_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.id from public.agencies a where public.is_manager_of(a.id)
$$;

revoke execute on function public.my_staff_agency_ids() from anon, public;
revoke execute on function public.my_managed_agency_ids() from anon, public;
grant execute on function public.my_staff_agency_ids() to authenticated;
grant execute on function public.my_managed_agency_ids() to authenticated;

drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
for select to authenticated
using (
  agency_id in (select public.my_staff_agency_ids())
  and (employee_id = auth.uid() or agency_id in (select public.my_managed_agency_ids()))
);

commit;
