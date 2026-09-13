-- 0340 — the first project, with the columns `workspace_boards` actually has.
--
-- 0339 seeded a starting board with a `description`. That column does not
-- exist: a board is `workspace_id, name, view_kind, position`. The function
-- therefore raised on every call and no TalentOps workspace could be created.
--
-- Caught by the probe rather than by Dee, which is the point of running one
-- before building the screen.
create or replace function public.ensure_talentops_workspace(p_agency uuid, p_group uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_id uuid; v_name text;
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
  insert into public.workspace_boards (workspace_id, name, view_kind, position)
  values (v_id, 'Daily Operations', 'list', 10);

  return v_id;
end;
$function$;
