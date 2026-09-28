-- The partner lookup becomes a key lookup.
--
-- After the previous four migrations the CreditOps department queue is 1.75s,
-- down from a 226-second timeout. What is left is one node:
--
--   Seq Scan on outsourcing_groups — 8ms × 115 loops ≈ 920ms
--
-- The policy is `is_staff_of(agency_id) AND id IN (SELECT
-- my_visible_partner_ids())`. The set is hoisted and costs 76ms once, but
-- `is_staff_of(agency_id)` is still a per-ROW predicate, so every one of the
-- 115 lookups has to scan all 33 partner rows to evaluate it — the primary key
-- cannot be used while a function has to run on each candidate row.
--
-- Moving that condition INTO the set leaves the policy as a bare membership
-- test on `id`, which the planner can satisfy from the key.
--
-- Identical by construction: the set becomes
--   { id : is_staff_of(agency_id) AND can_see_partner(id) }
-- and the policy becomes `id IN set`. That is the same conjunction, evaluated
-- in one place instead of two.
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
   where public.is_staff_of(g.agency_id)
     and public.can_see_partner(g.id)
$$;

comment on function public.my_visible_partner_ids() is
  'Partner ids where is_staff_of(agency) AND can_see_partner(id) for the '
  'caller — the whole of the old policy, computed once, so the policy itself '
  'is a key lookup. SECURITY DEFINER because it reads the table whose policy '
  'calls it; an INVOKER helper would recurse.';

drop policy if exists outsourcing_groups_select on public.outsourcing_groups;

create policy outsourcing_groups_select on public.outsourcing_groups
for select
using (id in (select public.my_visible_partner_ids()));

commit;
