-- Phase 7 follow-up from the RLS matrix: "assignment always counts".
--
-- workspace_reach() required TalentOps division scope even for the item's own
-- assignee, so a BES agent assigned to a shared workspace item could not see
-- it. That contradicts the rule every other work_items policy follows and
-- would break My Work, time and EOD for the very agents TalentOps places.
--
-- The share must still be live and cover the board — authorization comes
-- from the relationship, never from the assignment alone — so the assignee is
-- passed into in_scope(), which already treats assignment as reach.
-- The container follows a visible item: an assigned agent may read the
-- workspace (statuses, name) of an item they can see.

drop policy if exists workspaces_select on public.workspaces;
drop policy if exists workspace_boards_select on public.workspace_boards;
drop policy if exists work_items_select on public.work_items;
drop policy if exists work_items_update on public.work_items;
drop policy if exists work_items_insert on public.work_items;
drop function public.workspace_reach(uuid, uuid, boolean);

create function public.workspace_reach(p_ws uuid, p_board uuid, p_need_work boolean default false, p_assignee uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and public.is_org_member(w.organization_id)
         and public.org_entitled(w.organization_id, 'workspaces'))
  or exists (
      select 1
        from public.workspace_shares s
        join public.workspaces w on w.id = s.workspace_id
        join public.fulfillment_engagements e on e.id = s.engagement_id
       where s.workspace_id = p_ws
         and s.revoked_at is null
         and (p_board is null or s.board_id is null or s.board_id = p_board)
         and (not p_need_work or s.access = 'work')
         and e.service = 'talentops'
         and e.organization_id = w.organization_id
         and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
         and public.is_staff_of(e.agency_id)
         and public.in_scope(e.agency_id, 'talentops', null, p_assignee, null))
$$;
revoke execute on function public.workspace_reach(uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.workspace_reach(uuid, uuid, boolean, uuid) to authenticated;

create policy workspaces_select on public.workspaces for select to authenticated
  using (
    public.workspace_reach(id, null)
    -- the container follows an item the caller can already see (work_items RLS applies)
    or exists (select 1 from public.work_items wi where wi.workspace_id = workspaces.id and wi.assigned_to = auth.uid())
  );

create policy workspace_boards_select on public.workspace_boards for select to authenticated
  using (public.workspace_reach(workspace_id, id));

create policy work_items_select on public.work_items for select to authenticated
  using (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, false, assigned_to))
    and (
      (public.is_staff_of(agency_id) and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
      or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
      or (scope = 'AGENCY' and subject_organization_id is not null and public.is_org_admin(subject_organization_id))
    )
  );

create policy work_items_update on public.work_items for update to authenticated
  using (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, true, assigned_to))
    and (
      (public.is_staff_of(agency_id) and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
      or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
    )
  )
  with check (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, true, assigned_to))
    and (team_id is null or exists (select 1 from public.teams t where t.id = work_items.team_id and t.archived_at is null
                                      and (t.agency_id = work_items.agency_id or t.organization_id = work_items.organization_id)))
    and (assigned_to is null or assigned_to = auth.uid() or public.is_manager_of(agency_id) or public.is_team_lead_of(team_id)
         or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id)))
  );

create policy work_items_insert on public.work_items for insert to authenticated
  with check (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, true, assigned_to))
    and (
      assigned_to = auth.uid()
      or public.is_manager_of(agency_id) or public.is_team_lead_of(team_id)
      or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id))
      or (assigned_to is null and public.is_staff_of(agency_id) and public.in_scope(agency_id, division, team_id, null, null))
      or (assigned_to is null and scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, null))
    )
    and (
      (scope = 'AGENCY' and public.is_staff_of(agency_id))
      or (scope = 'ORGANIZATION' and organization_id is not null and public.is_org_member(organization_id) and agency_id = public.org_agency(organization_id))
      or (scope = 'ORGANIZATION' and organization_id is not null and division is not null and public.is_staff_of(agency_id) and public.bes_may_fulfil(organization_id, null, division))
      or (scope = 'ORGANIZATION' and workspace_id is not null and public.is_staff_of(agency_id) and agency_id = public.org_agency(organization_id))
    )
  );
