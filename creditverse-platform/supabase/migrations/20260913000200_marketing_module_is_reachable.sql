-- =============================================================================
-- The Sales & Marketing module becomes addressable, and reachable by the people
-- hired to work it.
--
-- ── TWO DEFECTS IN THE FOUNDATION, FOUND BEFORE ANY UI WAS BUILT ────────────
--
-- 1. A marketing workspace was identified by `icon = 'megaphone'`. Icons are
--    decoration Dee may change; the day she does, `ensure_marketing_workspace`
--    stops finding the existing workspace and provisions a SECOND one beside
--    it, with its own statuses and its own tasks. Identity now lives in a
--    column that means something: `workspaces.module`.
--
-- 2. An agency-owned workspace was reachable only by `is_agency_manager_or_
--    above()`. Roniel and Kaori are invited as agents holding
--    `marketing.workspace.view` and `marketing.tasks.manage` — so the module
--    they were hired for would have been empty for both of them, and every
--    screen in it would have rendered nothing. Building the UI first would
--    have produced a demo that worked only for Dee.
--
-- The capability is the gate, which is the platform's existing rule: role +
-- permission + scope + assignment. `marketing.workspace.view` reads the
-- module; `marketing.tasks.manage` works it. Nobody else reaches a marketing
-- workspace at all, and an admin passes only because `resolve_agency_
-- capability` already short-circuits for ungated keys.
-- =============================================================================

-- ── 1. Identity ─────────────────────────────────────────────────────────────
alter table public.workspaces
  add column if not exists module public.fulfillment_service;

comment on column public.workspaces.module is
  'The BES module this workspace belongs to, when it belongs to one. Null for an organization''s own Custom Workspace, which is nobody''s module. Identity lives here and not in `icon`, which is decoration (2026-09-13).';

update public.workspaces
   set module = 'sales_marketing'
 where module is null and icon = 'megaphone' and agency_id is not null;

create index if not exists workspaces_by_module on public.workspaces (module, partner_group_id)
  where module is not null and archived_at is null;

-- ── 2. One question, asked in six places ────────────────────────────────────
/**
 * May the caller reach this marketing workspace, and may they change it?
 *
 * Read (`p_need_work = false`) needs either marketing capability — somebody
 * who may work the module can obviously see it, and requiring both keys would
 * make a half-granted person invisible to themselves.
 *
 * This never widens anything outside the module: a workspace with no
 * `module`, or a module that is not marketing, returns false on the first
 * clause and the caller's ordinary authorization decides as before.
 */
create or replace function public.may_reach_marketing(
  p_workspace uuid, p_need_work boolean default false
) returns boolean
language sql stable security definer set search_path = public as $function$
  select p_workspace is not null
     and exists (select 1 from public.workspaces w
                  where w.id = p_workspace
                    and w.module = 'sales_marketing'
                    and w.archived_at is null
                    and public.is_staff_of(w.agency_id))
     and case when p_need_work
              then public.agency_can('marketing.tasks.manage')
              else public.agency_can('marketing.workspace.view')
                or public.agency_can('marketing.tasks.manage')
         end
$function$;
revoke execute on function public.may_reach_marketing(uuid, boolean) from public, anon;
grant execute on function public.may_reach_marketing(uuid, boolean) to authenticated;

-- ── 3. The container ────────────────────────────────────────────────────────
create or replace function public.workspace_reach(
  p_ws uuid, p_board uuid, p_need_work boolean default false, p_assignee uuid default null
) returns boolean
language sql stable security definer set search_path = public as $function$
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
         and public.is_agency_manager_or_above())
  -- The module's own people, who are not managers and are not meant to be.
  or public.may_reach_marketing(p_ws, p_need_work)
$function$;

-- ── 4. The work inside it ───────────────────────────────────────────────────
drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
using (
  ((workspace_id is null) or public.workspace_reach(workspace_id, board_id, false, assigned_to))
  and (
    (public.is_staff_of(agency_id)
      and ((scope = 'AGENCY'::work_scope) or public.bes_engaged_with(organization_id))
      and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
    or ((scope = 'ORGANIZATION'::work_scope) and public.org_scope_allows(organization_id, assigned_to))
    or ((scope = 'AGENCY'::work_scope) and (subject_organization_id is not null)
        and (division = 'bes_crm'::fulfillment_service)
        and public.is_org_admin(subject_organization_id)
        and public.org_entitled(subject_organization_id, 'crm'))
    or public.may_reach_marketing(workspace_id, false)
  )
);

drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert on public.work_items for insert to authenticated
with check (
  ((workspace_id is null) or public.workspace_reach(workspace_id, board_id, true, assigned_to))
  and (
    (assigned_to = auth.uid())
    or public.is_manager_of(agency_id)
    or public.is_team_lead_of(team_id)
    or ((scope = 'ORGANIZATION'::work_scope) and public.is_org_admin(organization_id))
    or ((assigned_to is null) and public.is_staff_of(agency_id)
        and public.in_scope(agency_id, division, team_id, null::uuid, null::uuid))
    or ((assigned_to is null) and (scope = 'ORGANIZATION'::work_scope)
        and public.org_scope_allows(organization_id, null::uuid))
    /* Marketing assigns deliberately — a lead hands content to a writer, and
       a writer picks work up. Requiring team lead for that would make a team
       of two unable to give each other anything. */
    or public.may_reach_marketing(workspace_id, true)
  )
  and (
    ((scope = 'AGENCY'::work_scope) and public.is_staff_of(agency_id))
    or ((scope = 'ORGANIZATION'::work_scope) and (organization_id is not null)
        and public.is_org_member(organization_id) and (agency_id = public.org_agency(organization_id)))
    or ((scope = 'ORGANIZATION'::work_scope) and (organization_id is not null) and (division is not null)
        and public.is_staff_of(agency_id)
        and public.bes_may_fulfil(organization_id, null::uuid, division))
    or ((scope = 'ORGANIZATION'::work_scope) and (workspace_id is not null)
        and public.is_staff_of(agency_id) and (agency_id = public.org_agency(organization_id)))
  )
);

drop policy if exists work_items_update on public.work_items;
create policy work_items_update on public.work_items for update to authenticated
using (
  ((workspace_id is null) or public.workspace_reach(workspace_id, board_id, true, assigned_to))
  and (
    (public.is_staff_of(agency_id)
      and ((scope = 'AGENCY'::work_scope) or public.bes_engaged_with(organization_id))
      and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
    or ((scope = 'ORGANIZATION'::work_scope) and public.org_scope_allows(organization_id, assigned_to))
    or public.may_reach_marketing(workspace_id, true)
  )
)
with check (
  ((workspace_id is null) or public.workspace_reach(workspace_id, board_id, true, assigned_to))
  and ((team_id is null) or exists (
        select 1 from public.teams t
         where t.id = work_items.team_id and t.archived_at is null
           and ((t.agency_id = work_items.agency_id) or (t.organization_id = work_items.organization_id))))
  and (
    (assigned_to is null)
    or (assigned_to = auth.uid())
    or public.is_manager_of(agency_id)
    or public.is_team_lead_of(team_id)
    or ((scope = 'ORGANIZATION'::work_scope) and public.is_org_admin(organization_id))
    or public.may_reach_marketing(workspace_id, true)
  )
);

-- ── 5. Checklists and custom fields follow the item ─────────────────────────
create or replace function public.can_write_work_item(p_item uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.work_items w
     where w.id = p_item
       and ((public.is_staff_of(w.agency_id)
             and public.in_scope(w.agency_id, w.division, w.team_id, w.assigned_to, w.created_by))
         or (w.scope = 'ORGANIZATION' and public.org_scope_allows(w.organization_id, w.assigned_to))
         or public.may_reach_marketing(w.workspace_id, true))
  )
$function$;

/* `work_item_field_values_write` asked `is_org_member(wi.organization_id)`,
   and an agency-owned workspace has no organization — so NOBODY could write a
   field value on a marketing item, Dee included. The Content Calendar is built
   on one of those fields, so this was a hard blocker rather than a narrowing. */
drop policy if exists work_item_field_values_write on public.work_item_field_values;
create policy work_item_field_values_write on public.work_item_field_values
  for all to authenticated
  using (exists (
    select 1 from public.work_items wi
      join public.workspace_fields f on f.workspace_id = wi.workspace_id
     where wi.id = work_item_field_values.work_item_id
       and f.id = work_item_field_values.field_id
       and (public.is_org_member(wi.organization_id)
            or public.may_reach_marketing(wi.workspace_id, true))))
  with check (exists (
    select 1 from public.work_items wi
      join public.workspace_fields f on f.workspace_id = wi.workspace_id
     where wi.id = work_item_field_values.work_item_id
       and f.id = work_item_field_values.field_id
       and (public.is_org_member(wi.organization_id)
            or public.may_reach_marketing(wi.workspace_id, true))));

-- ── 6. Provisioning and the partner list stop reading the icon ─────────────
create or replace function public.ensure_marketing_workspace(
  p_agency uuid, p_group uuid default null, p_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_id uuid;
  v_name text;
begin
  select id into v_id from public.workspaces
   where agency_id = p_agency
     and module = 'sales_marketing'
     and partner_group_id is not distinct from p_group
     and archived_at is null;
  if v_id is not null then return v_id; end if;

  v_name := coalesce(
    p_name,
    (select g.name || ' — Marketing' from public.outsourcing_groups g where g.id = p_group),
    'BES Internal Marketing');

  insert into public.workspaces (agency_id, partner_group_id, module, name, description, icon, colour)
  values (p_agency, p_group, 'sales_marketing', v_name,
          case when p_group is null
               then 'BES''s own content, campaigns, social and launch work.'
               else 'Marketing and sales work BES does for this partner.' end,
          'megaphone', '#7c3aed')
  returning id into v_id;

  insert into public.workspace_statuses (workspace_id, key, label, colour, position, canonical_stage, is_terminal) values
    (v_id, 'backlog',          'Backlog',             '#94a3b8', 10, 'Queued',        false),
    (v_id, 'todo',             'To Do',               '#64748b', 20, 'Assigned',      false),
    (v_id, 'in_progress',      'In Progress',         '#2563eb', 30, 'In Processing', false),
    (v_id, 'waiting',          'Waiting / Blocked',   '#f59e0b', 40, 'Blocked',       false),
    (v_id, 'internal_review',  'For Internal Review', '#8b5cf6', 50, 'Ready for QA',  false),
    (v_id, 'partner_approval', 'For Partner Approval','#a855f7', 60, 'QA Review',     false),
    (v_id, 'completed',        'Completed',           '#10b981', 70, 'Completed',     true),
    (v_id, 'archived',         'Archived',            '#cbd5e1', 80, 'Completed',     true)
  on conflict do nothing;

  insert into public.workspace_item_types (workspace_id, key, label, icon, position) values
    (v_id, 'task',     'Task',         'check-square', 10),
    (v_id, 'content',  'Content',      'image',        20),
    (v_id, 'creative', 'Creative',     'palette',      30),
    (v_id, 'lead',     'Lead / Sales', 'target',       40)
  on conflict do nothing;

  insert into public.workspace_fields (workspace_id, key, label, field_type, options, position) values
    (v_id, 'channel',      'Platform / Channel', 'select',
       '{"choices":["Facebook","Instagram","TikTok","LinkedIn","YouTube","X","Email","Blog","Other"]}'::jsonb, 10),
    (v_id, 'content_type', 'Content Type', 'select',
       '{"choices":["Post","Reel","Story","Carousel","Video","Graphic","Article","Ad","Email"]}'::jsonb, 20),
    (v_id, 'publish_at',   'Publish Date',  'date', null, 30),
    (v_id, 'caption',      'Caption / Copy','text', null, 40),
    (v_id, 'published_url','Published URL', 'text', null, 50)
  on conflict do nothing;

  insert into public.workspace_boards (workspace_id, name, view_kind, position) values
    (v_id, 'Tasks',            'list',     10),
    (v_id, 'Content Calendar', 'calendar', 20),
    (v_id, 'Board',            'board',    30)
  on conflict do nothing;

  return v_id;
end $function$;

create or replace view public.marketing_partners as
  select distinct g.id, g.name, g.partner_name, g.lifecycle,
         (select w.id from public.workspaces w
           where w.partner_group_id = g.id and w.module = 'sales_marketing'
             and w.archived_at is null
           limit 1) as workspace_id
    from public.outsourcing_groups g
    join public.fulfillment_engagements e on e.outsourcing_group_id = g.id
   where e.service = 'sales_marketing'
     and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
     and g.archived_at is null
     and not g.is_fixture;

alter view public.marketing_partners set (security_invoker = true);
grant select on public.marketing_partners to authenticated;
