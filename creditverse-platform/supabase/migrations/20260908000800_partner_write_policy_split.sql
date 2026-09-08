-- 0185 — a FOR ALL policy was still handing every manager every partner.
--
-- 0184 narrowed `outsourcing_groups_select` to `can_see_partner()`. The
-- manager still saw all of them, and the reason is one Postgres detail that
-- has now bitten this codebase twice:
--
--   PERMISSIVE POLICIES ARE OR-ED, AND `FOR ALL` INCLUDES SELECT.
--
-- `outsourcing_groups_write` was `FOR ALL USING is_manager_of(agency_id)`.
-- Adding a narrow SELECT policy beside it narrows nothing — the broad one
-- still says yes. Exactly what happened with `agency_memberships_write` and
-- the owner-only delete in 0172.
--
-- Split into the commands it was actually for. A manager still creates and
-- edits partners; what they may SEE is decided by assignment alone.
--
-- Worth stating as a rule, because it will come up again: when tightening
-- access on a table, LIST ITS POLICIES FIRST. A new policy cannot take away
-- what an existing permissive one already grants.
drop policy if exists outsourcing_groups_write on public.outsourcing_groups;

create policy outsourcing_groups_insert on public.outsourcing_groups
  for insert to authenticated
  with check (public.is_manager_of(agency_id) and public.agency_can('partners.create'));

/* A manager may edit a partner they can SEE — which is now the assigned ones.
   Editing something invisible to you is not a capability anybody wanted. */
create policy outsourcing_groups_update on public.outsourcing_groups
  for update to authenticated
  using (public.is_manager_of(agency_id) and public.can_see_partner(id)
         and public.agency_can('partners.edit'))
  with check (public.is_manager_of(agency_id) and public.agency_can('partners.edit'));
