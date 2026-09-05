-- =============================================================================
-- team_memberships: remove the self-referencing SELECT policy
--
-- `team_memberships_select` (0027 §H) let a member see the rest of their team
-- through `exists (select 1 from public.team_memberships me …)`. A policy that
-- reads its own table re-enters that same policy, and Postgres refuses with
-- 42P17 "infinite recursion detected in policy for relation team_memberships".
-- PostgREST reports that as HTTP 500, so every sign-in's membership batch
-- (auth-context reads team_memberships for the signer) failed for every user.
--
-- The lead check already avoids this through `is_team_lead_of`, which is
-- SECURITY DEFINER and therefore not subject to the policy. The teammate check
-- gets the same treatment. Access does not widen: the helper answers exactly
-- the question the subquery asked.
-- =============================================================================

create or replace function public.is_member_of_team(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_team is not null and exists (
    select 1 from public.team_memberships tm
     where tm.team_id = p_team and tm.user_id = auth.uid()
  )
$$;
revoke all on function public.is_member_of_team(uuid) from public, anon;
grant execute on function public.is_member_of_team(uuid) to authenticated;

drop policy if exists team_memberships_select on public.team_memberships;
create policy team_memberships_select on public.team_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_team_lead_of(team_id)
    -- a member may see who else is on their team
    or public.is_member_of_team(team_id)
    or exists (select 1 from public.teams t where t.id = team_id and (
         (t.agency_id is not null and public.is_manager_of(t.agency_id))
         or (t.organization_id is not null and public.is_org_admin(t.organization_id))))
  );
