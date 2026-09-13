-- 0339 — TalentOps gets partner workspaces, scoped by ASSIGNMENT.
--
-- ---------------------------------------------------------------------------
-- THE HIERARCHY, AND NOTHING UNDER IT
--
--   TalentOps → Partner → Project / List → Task
--
-- Dee, 2026-09-13: "Do not create another hidden hierarchy underneath it."
-- So: a partner is a `workspaces` row, a project is a `workspace_boards` row,
-- a task is a `work_items` row. No phases and no milestones — those belong to
-- BES CRM project delivery, where a build genuinely has checkpoints.
--
-- ---------------------------------------------------------------------------
-- THE SECURITY QUESTION THIS MIGRATION EXISTS TO ANSWER
--
-- Dee: "Keep Partner assignments authoritative for who may work inside a
-- Partner workspace… If either person can see unrelated Partner work, treat
-- that as a security defect, not a UI filter issue."
--
-- `workspace_reach()` today has four branches, and for an AGENCY-owned partner
-- workspace only one of them applies: `is_agency_manager_or_above()`. That is
-- wrong twice over for TalentOps — Alliana is not a manager and would see
-- NOTHING, while any manager would see EVERY partner regardless of assignment.
--
-- Marketing solved its own version with `may_reach_marketing`, which is
-- capability-gated but deliberately NOT partner-scoped: BES's content team
-- works across every partner. TalentOps is the opposite case. A dedicated EA
-- is assigned to accounts, and somebody else's account is none of their
-- business — so this carve-out asks `can_see_partner()`.
--
-- `can_see_partner()` already means: owner or admin, or a LIVE assignment by
-- name, by a live team, or by a department you manage. Reusing it is what
-- makes assignment authoritative rather than a second opinion about it.
-- ---------------------------------------------------------------------------

-- ── Who may reach a TalentOps workspace ─────────────────────────────────
create or replace function public.may_reach_talentops(p_workspace uuid, p_need_work boolean)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_workspace is not null
     and exists (
       select 1 from public.workspaces w
        where w.id = p_workspace
          and w.module = 'talentops'
          and w.archived_at is null
          and public.is_staff_of(w.agency_id)
          /* The whole point. An internal TalentOps workspace (no partner) is
             reachable by the module's people; a PARTNER workspace is reachable
             only by somebody that partner is actually theirs to work. */
          and (w.partner_group_id is null or public.can_see_partner(w.partner_group_id))
     )
     and case when p_need_work
              then public.agency_can('talentops.tasks.manage')
              else public.agency_can('talentops.view')
                or public.agency_can('talentops.tasks.manage')
         end
$function$;
revoke execute on function public.may_reach_talentops(uuid, boolean) from public, anon;
grant execute on function public.may_reach_talentops(uuid, boolean) to authenticated;

comment on function public.may_reach_talentops(uuid, boolean) is
  'Whether the caller may read (or work in) a TalentOps workspace. Partner assignment is the authority — `can_see_partner` — so one EA cannot reach another EA''s account. Not a UI filter (Dee, 2026-09-13).';

/* The one new capability. `talentops.view` already existed for entering the
   module; working in it is a separate thing an agent may be given without
   being made a manager. */
insert into public.permission_keys (key, module, label, description, owner_gated, sort)
select 'talentops.tasks.manage', 'TalentOps', 'Manage TalentOps work',
       'Create, assign and complete tasks inside a TalentOps partner workspace.', false,
       coalesce((select max(sort) from public.permission_keys), 0) + 1
 where not exists (select 1 from public.permission_keys where key = 'talentops.tasks.manage');

-- ── Add the branch, changing nothing that already worked ────────────────
/* The defaults are part of the existing signature — `create or replace` cannot
   drop them, and dropping the function would take every policy that calls it
   with it. Repeated exactly. */
create or replace function public.workspace_reach(
  p_ws uuid, p_board uuid, p_need_work boolean default false, p_assignee uuid default null)
returns boolean
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
         and public.is_agency_manager_or_above()
         /* NARROWED for TalentOps only: being a manager is not a reason to
            read an account nobody made you responsible for. Every other
            module's agency workspaces behave exactly as before. */
         and (w.module is distinct from 'talentops'
              or w.partner_group_id is null
              or public.can_see_partner(w.partner_group_id)))
  -- The module's own people, who are not managers and are not meant to be.
  or public.may_reach_marketing(p_ws, p_need_work)
  or public.may_reach_talentops(p_ws, p_need_work)
$function$;

comment on function public.workspace_reach(uuid, uuid, boolean, uuid) is
  'Who may reach a workspace, and its boards and work. The manager branch is narrowed for TalentOps: partner assignment decides an account, because a dedicated EA''s work is not every manager''s to read (0339).';

-- ── Provisioning: one workspace per LIVE TalentOps-family engagement ────
--
-- Derived from the engagement, never hand-maintained, so the partner list in
-- the sidebar is exactly the partners BES is contracted to staff.
create or replace function public.ensure_talentops_workspace(p_agency uuid, p_group uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_id uuid; v_name text; v_board uuid;
begin
  select id into v_id from public.workspaces
   where agency_id = p_agency and module = 'talentops'
     and partner_group_id is not distinct from p_group and archived_at is null;
  if v_id is not null then return v_id; end if;

  v_name := coalesce(p_name,
    (select g.name from public.outsourcing_groups g where g.id = p_group),
    'BES Internal Operations');

  insert into public.workspaces (agency_id, partner_group_id, module, name, description, icon, colour)
  values (p_agency, p_group, 'talentops', v_name,
          case when p_group is null
               then 'BES''s own operational work.'
               else 'Day-to-day work BES delivers for this partner.' end,
          'users', '#0d9488')
  returning id into v_id;

  /* Dee's status set, as ROWS. `canonical_stage` maps each onto the
     platform's vocabulary so production, EOD and Attention understand
     TalentOps work without knowing what TalentOps is. */
  insert into public.workspace_statuses (workspace_id, key, label, colour, position, canonical_stage, is_terminal) values
    (v_id, 'backlog',     'Backlog',           '#94a3b8', 10, 'Queued',        false),
    (v_id, 'todo',        'To Do',             '#64748b', 20, 'Assigned',      false),
    (v_id, 'in_progress', 'In Progress',       '#2563eb', 30, 'In Processing', false),
    (v_id, 'waiting',     'Waiting / Blocked', '#f59e0b', 40, 'Blocked',       false),
    (v_id, 'for_review',  'For Review',        '#8b5cf6', 50, 'Ready for QA',  false),
    (v_id, 'completed',   'Completed',         '#16a34a', 60, 'Completed',     true),
    (v_id, 'archived',    'Archived',          '#a3a3a3', 70, 'Completed',     true);

  /* One project to land in, so a new partner folder is never an empty screen
     with no way forward. More are created by the people doing the work. */
  insert into public.workspace_boards (workspace_id, name, description, position)
  values (v_id, 'Daily Operations', 'Recurring and day-to-day work for this account.', 10)
  returning id into v_board;

  return v_id;
end;
$function$;
revoke execute on function public.ensure_talentops_workspace(uuid, uuid, text) from public, anon;
grant execute on function public.ensure_talentops_workspace(uuid, uuid, text) to authenticated;

comment on function public.ensure_talentops_workspace(uuid, uuid, text) is
  'Find-or-create a partner''s TalentOps workspace with its statuses and a first project. Idempotent; called when the partner folder is opened.';

-- ── The partner list, derived from live engagements ─────────────────────
create or replace function public.talentops_partners()
returns table (
  group_id uuid, partner_name text, workspace_id uuid,
  open_tasks integer, due_today integer, overdue integer, agents integer)
language sql stable security definer set search_path = public as $function$
  with mine as (
    /* A partner belongs in TalentOps when BES is contracted to staff them.
       `partner_services` is the commercial record; these three service types
       are the human-delivered work that is not CreditOps. */
    select distinct g.id, g.name
      from public.partner_services ps
      join public.outsourcing_groups g on g.id = ps.group_id
     where ps.service_type in ('TALENTOPS', 'OPERATIONS_MANAGEMENT', 'CLIENT_SUPPORT')
       and ps.status in ('active', 'onboarding')
       and g.archived_at is null
       and public.is_agency_staff()
       and public.can_see_partner(g.id)
  )
  select m.id, m.name, w.id,
         coalesce((select count(*)::int from public.work_items i
                    where i.workspace_id = w.id and i.archived_at is null and i.completed_at is null), 0),
         coalesce((select count(*)::int from public.work_items i
                    where i.workspace_id = w.id and i.archived_at is null and i.completed_at is null
                      and i.due_at::date = current_date), 0),
         coalesce((select count(*)::int from public.work_items i
                    where i.workspace_id = w.id and i.archived_at is null and i.completed_at is null
                      and i.due_at < now()), 0),
         coalesce((select count(distinct a.user_id)::int from public.partner_assignments a
                    where a.group_id = m.id and a.ended_on is null and a.user_id is not null), 0)
    from mine m
    left join public.workspaces w
      on w.partner_group_id = m.id and w.module = 'talentops' and w.archived_at is null
   order by m.name
$function$;
revoke execute on function public.talentops_partners() from public, anon;
grant execute on function public.talentops_partners() to authenticated;

comment on function public.talentops_partners() is
  'The TalentOps partner list — A→Z, derived from LIVE service engagements and narrowed by assignment, so it is never hand-maintained and never shows an account that is not the caller''s to work (Dee, 2026-09-13).';
