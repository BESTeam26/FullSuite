-- The partner-portal policy stops asking per row too.
--
-- After the staff policy on `outsourcing_groups` became a key lookup, that
-- table was STILL 911ms of the department queue — 8ms of seq scan, 115 times.
--
-- `outsourcing_groups` has TWO permissive SELECT policies:
--
--   outsourcing_groups_select          staff        (now a set lookup)
--   outsourcing_groups_partner_select  is_partner_contact_of(id)
--
-- Permissive policies are OR'd, so BOTH are evaluated — including for staff
-- who will never match the second one. `is_partner_contact_of` measures
-- 0.40ms, times 33 partners, times a lookup per queue row.
--
-- Same rewrite as its neighbour: the set is computed once. SECURITY DEFINER
-- for the same reason — it reads the table whose policy calls it, so an
-- INVOKER helper would recurse — and not a widening, because the set is
-- defined by the same predicate the policy applied, and that predicate is
-- itself already a SECURITY DEFINER function used in this policy today.
--
-- Cost impact: strictly less work per read.

begin;

create or replace function public.my_partner_contact_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.id from public.outsourcing_groups g
   where public.is_partner_contact_of(g.id)
$$;

comment on function public.my_partner_contact_group_ids() is
  'Partner ids where the caller is a partner contact, computed once instead '
  'of per row. SECURITY DEFINER to avoid recursing into the policy that calls it.';

revoke all on function public.my_partner_contact_group_ids() from public;
grant execute on function public.my_partner_contact_group_ids() to authenticated;

drop policy if exists outsourcing_groups_partner_select on public.outsourcing_groups;

create policy outsourcing_groups_partner_select on public.outsourcing_groups
for select
using (id in (select public.my_partner_contact_group_ids()));

commit;
