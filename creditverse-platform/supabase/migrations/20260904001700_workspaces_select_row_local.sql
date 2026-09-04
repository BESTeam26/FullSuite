-- Found in the browser: an organization admin could not create a workspace —
-- 42501 "new row violates row-level security policy" — although every helper
-- the insert policy uses returned true. The refusal came from the SELECT
-- policy that INSERT … RETURNING evaluates: workspace_reach(id, null) reads
-- the workspaces row through a subquery, and a row being inserted is not
-- visible to a separate query in the same statement. Latent since 0028 (the
-- phase-6 probes inserted as postgres).
--
-- Same truth, evaluated on the row itself: membership + entitlement come from
-- the row's own organization_id; the share branch still goes through
-- workspace_reach (its row exists by the time BES reads it).
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated
  using (
    (public.is_org_member(organization_id) and public.org_entitled(organization_id, 'workspaces'))
    or public.workspace_reach(id, null)
    or exists (select 1 from public.work_items wi where wi.workspace_id = workspaces.id and wi.assigned_to = auth.uid())
  );
