-- D-021 part 3 — two readers that still answered "who is a manager" by
-- capability alone.
--
-- 1. workspace_reach let any ops.manage holder read every agency workspace of
--    every module; a CreditOps division manager saw three Marketing
--    workspaces (phase 6/7). Placement decides now.
-- 2. client_department_statuses_select had no arm for management placement
--    and none for the organization's own staff. Because
--    set_client_department_status upserts with ON CONFLICT DO UPDATE, a
--    caller who may WRITE the row but cannot SELECT the existing one is
--    refused with "new row violates row-level security" (phase 19, 26, 28):
--    an in-scope division manager and the organization owner both were.

CREATE OR REPLACE FUNCTION public.workspace_reach(p_ws uuid, p_board uuid, p_need_work boolean DEFAULT false, p_assignee uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and w.organization_id is not null
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
  or exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and w.agency_id is not null
         and public.is_staff_of(w.agency_id)
         /* D-021: a manager reaches an agency workspace through PLACEMENT —
            chief operations, or a seat in the workspace's own division. A
            CreditOps division manager does not reach Marketing. */
         and public.management_reach(w.agency_id, case when w.module in ('sales_marketing','talentops','creditops','fundingops','bes_crm') then w.module::public.fulfillment_service end, null)
         and (w.module is distinct from 'talentops'
              or w.partner_group_id is null
              or public.can_see_partner(w.partner_group_id)))
  -- The module's own people, who are not managers and are not meant to be.
  or public.may_reach_marketing(p_ws, p_need_work)
  or public.may_reach_talentops(p_ws, p_need_work)
$function$
;

drop policy if exists client_department_statuses_select on public.client_department_statuses;
create policy client_department_statuses_select on public.client_department_statuses
  for select to authenticated
  using (
    public.client_department_writable(client_id)
    and (
      exists (select 1 from public.fulfillment_clients c where c.id = client_department_statuses.client_id and public.is_admin_of(c.agency_id))
      or department in (select public.my_creditops_departments())
      or assignee_id = auth.uid()
      or exists (select 1 from public.fulfillment_clients c where c.id = client_department_statuses.client_id and c.team_id is not null and public.is_team_lead_of(c.team_id))
      /* D-021: management placement over the client's team or division. */
      or exists (select 1 from public.fulfillment_clients c where c.id = client_department_statuses.client_id
                   and public.management_reach(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id))
      /* The organization's own staff read their own client's department rows. */
      or exists (select 1 from public.fulfillment_clients c where c.id = client_department_statuses.client_id
                   and c.organization_id is not null and public.org_scope_allows(c.organization_id, c.assigned_agent_id))
    )
  );
