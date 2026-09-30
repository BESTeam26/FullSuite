-- Work-item reach is a set of teams, not a call per row.
--
-- `work_items_select` called in_scope(agency, division, team, assignee,
-- creator) per row — 5 ms a call: my departments, my memberships, the
-- teams I lead and management placement, re-derived for every work item.
-- It is the remainder of the notification bell for managers (~1.1 s: the
-- work_item branch reads work_items under this policy) and of the BES CRM
-- board (~1.0 s: every project's health reads its units under it).
--
-- in_scope() is, exactly:
--   is_admin_of(agency)
--   or assignee = me
--   or team in {teams whose department is one of my departments}
--   or team in {teams I am a member of}
--   or team in {teams I lead}
--   or management_reach(agency, division, team), which is
--        has_operations_scope(agency)
--        or team in {teams I manage through placement}
--        or (team is null and division in {services I manage})
-- Every team-shaped clause is now one set, `my_reach_team_ids(agency)`,
-- resolved once per statement; the agency-shaped clauses are hoisted the
-- same way; assignee = me stays per row (it is a column comparison). The
-- other branches of the policy — workspaces, organization scope, the
-- customer's own CRM view, marketing and TalentOps reach — are untouched.
-- Proven per account over EVERY work item, old policy against new, inside
-- one transaction.
--
-- Cost impact: less, on My Work, the bell, the CRM board and every board.

begin;

create or replace function public.my_reach_team_ids(p_agency uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id from public.teams t
   where t.agency_id = p_agency and t.archived_at is null
     and t.department_id in (select public.my_departments())
  union
  select t.id from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
   where tm.user_id = auth.uid() and t.agency_id = p_agency and t.archived_at is null
  union
  select t.id from public.teams t
   where t.agency_id = p_agency and public.is_team_lead_of(t.id)
  union
  select t.id from public.teams t
   where t.agency_id = p_agency and t.archived_at is null
     and t.id in (select public.managed_teams())
$$;
revoke all on function public.my_reach_team_ids(uuid) from public;
grant execute on function public.my_reach_team_ids(uuid) to authenticated;

comment on function public.my_reach_team_ids(uuid) is
  'The teams in_scope() reaches for the caller — department, membership, lead and placement — as one set.';

drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items
for select to authenticated
using (
  (workspace_id is null or public.workspace_reach(workspace_id, board_id, false, assigned_to))
  and (
    (
      agency_id in (select a.id from public.agencies a where public.is_staff_of(a.id))
      and (scope = 'AGENCY'::public.work_scope or public.bes_engaged_with(organization_id))
      and (
        agency_id in (select a.id from public.agencies a where public.is_admin_of(a.id) or public.has_operations_scope(a.id))
        or assigned_to = auth.uid()
        or (team_id is not null and team_id in (select public.my_reach_team_ids(agency_id)))
        or (team_id is null and division is not null and division in (select public.managed_services()))
      )
    )
    or (scope = 'ORGANIZATION'::public.work_scope and public.org_scope_allows(organization_id, assigned_to))
    or (scope = 'AGENCY'::public.work_scope and subject_organization_id is not null
        and division = 'bes_crm'::public.fulfillment_service
        and public.is_org_admin(subject_organization_id) and public.org_entitled(subject_organization_id, 'crm'))
    or public.may_reach_marketing(workspace_id, false)
    or public.may_reach_talentops(workspace_id, false)
  )
);

commit;
