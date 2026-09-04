-- =============================================================================
-- Customer businesses follow the caller's reach into the organization
--
-- After 0023 a business was readable by any BES staffer once the organization
-- had a live engagement — engagement-gated, but not person-scoped. The matrix
-- showed `bes.restricted` (assigned nothing) still reading 3 businesses.
--
-- A business is organization-level, so "which person" is answered the same way
-- as for every other satellite: a child follows its parent. Here the parent is
-- the organization's operational record set — a staffer reaches an org's
-- businesses only if they can already reach at least one of that org's clients
-- or work items. The EXISTS runs under the caller's own RLS, so `in_scope` on
-- those tables is what decides. Organization members keep their own.
-- =============================================================================
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select to authenticated
  using (
    public.is_org_member(organization_id)
    or (
      public.bes_engaged_with(organization_id)
      and public.is_staff_of(public.org_agency(organization_id))
      and (
        exists (select 1 from public.fulfillment_clients c where c.organization_id = businesses.organization_id)
        or exists (select 1 from public.funding_clients c where c.organization_id = businesses.organization_id)
        or exists (select 1 from public.work_items w where w.organization_id = businesses.organization_id)
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Creation must land inside the creator's own reach
--
-- Found by the matrix, explained by Postgres: an INSERT … RETURNING evaluates
-- the SELECT policy on the new row. An assigned-only agent could pass the
-- INSERT check for an unassigned agency work item and then be refused the row
-- they had just created — a confusing 42501 and, worse, work nobody but a
-- manager could see. The rule is now stated where it belongs: a scope-limited
-- creator assigns the work to themselves; ceiling holders (managers, leads,
-- agency/division/team scope, non-assigned-only organization members) may queue
-- unassigned work. Nothing is created that its creator cannot then see.
-- -----------------------------------------------------------------------------
drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert on public.work_items for insert to authenticated
  with check (
    (
      assigned_to = auth.uid()
      or public.is_manager_of(agency_id)
      or public.is_team_lead_of(team_id)
      or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id))
      or (assigned_to is null and public.is_staff_of(agency_id)
          and public.in_scope(agency_id, division, team_id, null, null))
      or (assigned_to is null and scope = 'ORGANIZATION'
          and public.org_scope_allows(organization_id, null))
    )
    and (
      (scope = 'AGENCY' and public.is_staff_of(agency_id))
      or (scope = 'ORGANIZATION' and organization_id is not null
          and public.is_org_member(organization_id)
          and agency_id = public.org_agency(organization_id))
      or (scope = 'ORGANIZATION' and organization_id is not null and division is not null
          and public.is_staff_of(agency_id)
          and public.bes_may_fulfil(organization_id, null, division))
    )
  );
