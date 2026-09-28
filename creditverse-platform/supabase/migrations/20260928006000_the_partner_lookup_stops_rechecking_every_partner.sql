-- Reading a partner's NAME stops re-checking all 27 partners.
--
-- Dee, 2026-09-28: partner switching and queue loading must be fast.
--
-- After the client list and the department policy were fixed, the queue still
-- took 14.6 seconds. The plan says where it went:
--
--   Seq Scan on outsourcing_groups — 71ms, 115 loops   ≈ 8.2s
--   Seq Scan on organizations      — 16ms, 115 loops   ≈ 1.8s
--   Seq Scan on profiles           — 15ms, 115 loops   ≈ 1.7s
--   Index Scan on fulfillment_clients — 184ms, 1 loop  (was 11,600ms)
--
-- Those three are the view's LEFT JOINs for `partner_name` and
-- `assignee_name` — one lookup per result row, each re-running that table's
-- own policy over the whole table.
--
-- `outsourcing_groups_select` is `is_staff_of(agency_id) AND
-- can_see_partner(id)`, and `can_see_partner` measures 2.17ms. Twenty-seven
-- partners is 58ms, and 115 rows of queue is 6.7 seconds — spent answering
-- "may I see Vanquish Ventures?" over and over for the same viewer.
--
-- ── THE SET MUST BE SECURITY DEFINER HERE, AND THAT IS NOT A WIDENING ────
--
-- Everywhere else in this series the hoisted helper is INVOKER so the
-- underlying policy keeps applying. Here it cannot be: the helper reads
-- `outsourcing_groups`, which is the very table this policy protects, so an
-- INVOKER helper would recurse into itself.
--
-- DEFINER is safe because the set is defined by the SAME predicate the policy
-- applies — `can_see_partner(id)` — and the policy still ANDs
-- `is_staff_of(agency_id)` outside it, exactly as before. The helper answers
-- "which partners does can_see_partner admit", which is the question the
-- policy was already asking once per row. `can_see_partner` is itself
-- SECURITY DEFINER and already used in this policy today, so nothing new is
-- being reached.
--
-- Verified by checksum: the exact set of partner ids visible to each of the
-- 25 accounts, before and after.
--
-- Cost impact: strictly less work per read.

begin;

create or replace function public.my_visible_partner_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.id from public.outsourcing_groups g
   where public.can_see_partner(g.id)
$$;

comment on function public.my_visible_partner_ids() is
  'Partner ids admitted by can_see_partner() for the caller, computed once. '
  'SECURITY DEFINER because it reads the table whose policy calls it — an '
  'INVOKER helper here would recurse. The policy still ANDs is_staff_of().';

revoke all on function public.my_visible_partner_ids() from public;
grant execute on function public.my_visible_partner_ids() to authenticated;

drop policy if exists outsourcing_groups_select on public.outsourcing_groups;

create policy outsourcing_groups_select on public.outsourcing_groups
for select
using (
  public.is_staff_of(agency_id)
  and id in (select public.my_visible_partner_ids())
);

commit;
