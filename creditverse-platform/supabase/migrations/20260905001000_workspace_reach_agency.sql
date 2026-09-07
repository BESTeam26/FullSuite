-- 0151 — a BES workspace is reachable by BES.
--
-- `workspace_reach` decides whether somebody may put an item into a workspace,
-- and it knew about exactly two kinds of person: a member of the workspace's
-- ORGANIZATION, and BES staff working a shared workspace under a live
-- TalentOps engagement. Both branches start from `w.organization_id`.
--
-- An agency workspace has no organization, so both branches were false and
-- `work_items_insert` refused every task — the workspace existed, the statuses
-- existed, and nothing could be put in it.
--
-- The new branch is the narrowest one that works: this agency's own staff, on
-- this agency's own workspace. It grants nothing across the tenant boundary,
-- because an agency workspace has no tenant on the other side of it.
create or replace function public.workspace_reach(
  p_ws uuid, p_board uuid, p_need_work boolean default false, p_assignee uuid default null
) returns boolean
language sql stable security definer set search_path = public as $$
  /* The customer's own members. */
  select exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and w.organization_id is not null
         and public.is_org_member(w.organization_id)
         and public.org_entitled(w.organization_id, 'workspaces'))
  /* BES, inside a customer's workspace, only under a live TalentOps
     engagement that shares it. Unchanged. */
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
  /* BES, inside BES's own workspace. No organization is involved, so no
     entitlement and no engagement apply — there is no customer here. */
  or exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and w.agency_id is not null
         and public.is_staff_of(w.agency_id))
$$;
revoke execute on function public.workspace_reach(uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.workspace_reach(uuid, uuid, boolean, uuid) to authenticated;

comment on function public.workspace_reach(uuid, uuid, boolean, uuid) is
  'May the caller work inside this workspace? A customer''s members; BES under a live TalentOps share; or BES inside its own agency workspace.';
