-- =============================================================================
-- Approval is not publication.
--
-- Dee, 2026-09-13: "Do NOT mark content as Completed merely because the Partner
-- approved it. Approval is not publication… Published should be a separate
-- later state."
--
-- She is right and I had it wrong: `my_partner_review` set the work to
-- Completed and stamped `completed_at` the moment a partner clicked Approve.
-- That closes the record while the actual job — posting the thing — has not
-- happened, so the task leaves My Work, leaves the queues, counts as done in
-- production and EOD, and the person who has to publish it on Friday has
-- nothing telling them to.
--
-- ── THE WORKFLOW, AS ROWS ───────────────────────────────────────────────────
--
--   Backlog → To Do → In Progress → For Internal Review → For Partner Approval
--     → Approved / Scheduled → Published
--   beside: Changes Requested · Blocked · Archived
--
-- Three statuses are new. `completed` is KEPT rather than renamed: work items
-- already point at it, and renaming a status out from under live rows rewrites
-- history to say something that was never true (rule 11). It moves after
-- Published and stays available.
--
-- `Approved / Scheduled` is deliberately NOT terminal. That is the whole
-- correction: the canonical stage behind it is QA Review, so production, EOD
-- and Attention all still see open work — which is exactly what it is.
-- =============================================================================

-- ── 1. Every marketing workspace gains the three states ────────────────────
insert into public.workspace_statuses
  (workspace_id, key, label, colour, position, canonical_stage, is_terminal)
select w.id, v.key, v.label, v.colour, v.position, v.stage::public.work_stage, v.terminal
  from public.workspaces w
  cross join (values
    ('changes_requested',  'Changes Requested',   '#f97316', 35, 'In Processing', false),
    ('approved_scheduled', 'Approved / Scheduled','#0ea5e9', 65, 'QA Review',     false),
    ('published',          'Published',           '#10b981', 70, 'Completed',     true)
  ) as v(key, label, colour, position, stage, terminal)
 where w.module = 'sales_marketing'
   and w.archived_at is null
   and not exists (
     select 1 from public.workspace_statuses s
      where s.workspace_id = w.id and s.key = v.key);

/* `Waiting / Blocked` is just Blocked in Dee's workflow, and `Completed` moves
   out of the way of Published. Labels and order only — no key changes, so no
   row anywhere is pointed at something different. */
update public.workspace_statuses s
   set label = 'Blocked'
  from public.workspaces w
 where w.id = s.workspace_id and w.module = 'sales_marketing'
   and s.key = 'waiting' and s.label <> 'Blocked';

update public.workspace_statuses s
   set position = 75
  from public.workspaces w
 where w.id = s.workspace_id and w.module = 'sales_marketing'
   and s.key = 'completed' and s.position <> 75;

-- ── 2. New workspaces are seeded with the whole workflow ───────────────────
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

  /* The content workflow, as ROWS. `canonical_stage` maps each onto the
     platform's existing vocabulary so production, EOD and Attention
     understand marketing work without knowing what marketing is. */
  insert into public.workspace_statuses (workspace_id, key, label, colour, position, canonical_stage, is_terminal) values
    (v_id, 'backlog',           'Idea / Backlog',       '#94a3b8', 10, 'Queued',        false),
    (v_id, 'todo',              'To Do',                '#64748b', 20, 'Assigned',      false),
    (v_id, 'in_progress',       'In Progress',          '#2563eb', 30, 'In Processing', false),
    (v_id, 'changes_requested', 'Changes Requested',    '#f97316', 35, 'In Processing', false),
    (v_id, 'waiting',           'Blocked',              '#f59e0b', 40, 'Blocked',       false),
    (v_id, 'internal_review',   'For Internal Review',  '#8b5cf6', 50, 'Ready for QA',  false),
    (v_id, 'partner_approval',  'For Partner Approval', '#a855f7', 60, 'QA Review',     false),
    (v_id, 'approved_scheduled','Approved / Scheduled', '#0ea5e9', 65, 'QA Review',     false),
    (v_id, 'published',         'Published',            '#10b981', 70, 'Completed',     true),
    (v_id, 'completed',         'Completed',            '#16a34a', 75, 'Completed',     true),
    (v_id, 'archived',          'Archived',             '#cbd5e1', 80, 'Completed',     true)
  on conflict do nothing;

  insert into public.workspace_item_types (workspace_id, key, label, icon, position) values
    (v_id, 'task',     'Task',         'check-square', 10),
    (v_id, 'content',  'Content',      'image',        20),
    (v_id, 'creative', 'Creative',     'palette',      30),
    (v_id, 'lead',     'Lead / Sales', 'target',       40)
  on conflict do nothing;

  insert into public.workspace_fields (workspace_id, key, label, field_type, options, position) values
    (v_id, 'channel',      'Platform / Channel', 'select',
       '{"choices":["Facebook","Instagram","TikTok","YouTube","LinkedIn","Email","SMS","Blog / Website","X","Other"]}'::jsonb, 10),
    (v_id, 'content_type', 'Content Type', 'select',
       '{"choices":["Post","Reel","Story","Carousel","Video","Graphic","Article","Ad","Email"]}'::jsonb, 20),
    (v_id, 'publish_at',   'Publish Date',  'date', null, 30),
    (v_id, 'caption',      'Caption / Copy','text', null, 40),
    (v_id, 'cta',          'Call to Action','text', null, 45),
    (v_id, 'asset_url',    'Asset / Creative','text', null, 48),
    (v_id, 'published_url','Published URL', 'text', null, 50)
  on conflict do nothing;

  insert into public.workspace_boards (workspace_id, name, view_kind, position) values
    (v_id, 'Tasks',            'list',     10),
    (v_id, 'Content Calendar', 'calendar', 20),
    (v_id, 'Board',            'board',    30)
  on conflict do nothing;

  return v_id;
end $function$;

/* SMS and the CTA / asset fields the drawer needs, for workspaces that already
   exist. Adding a choice to a select is data, not a migration of anybody's
   work (Dee: "Make Platform configurable, but seed common channels"). */
update public.workspace_fields f
   set options = '{"choices":["Facebook","Instagram","TikTok","YouTube","LinkedIn","Email","SMS","Blog / Website","X","Other"]}'::jsonb
  from public.workspaces w
 where w.id = f.workspace_id and w.module = 'sales_marketing' and f.key = 'channel';

insert into public.workspace_fields (workspace_id, key, label, field_type, options, position)
select w.id, v.key, v.label, v.field_type, null, v.position
  from public.workspaces w
  cross join (values
    ('cta',       'Call to Action',   'text', 45),
    ('asset_url', 'Asset / Creative', 'text', 48)
  ) as v(key, label, field_type, position)
 where w.module = 'sales_marketing' and w.archived_at is null
   and not exists (select 1 from public.workspace_fields f
                    where f.workspace_id = w.id and f.key = v.key);

-- ── 3. What a partner's answer now means ───────────────────────────────────
/**
 * Approved sends the work to `Approved / Scheduled`, NOT to Completed, and
 * leaves `completed_at` alone. Publishing is a later, separate act by BES.
 *
 * Changes requested sends it to `Changes Requested` — its own state rather
 * than a silent drop back into In Progress, so "this came back from the
 * partner" is visible on a board instead of being inferred from a comment.
 * Either way the work item is the same record it always was.
 */
create or replace function public.my_partner_review(
  p_action uuid, p_approved boolean, p_comment text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  a public.partner_action_items%rowtype;
  w public.work_items%rowtype;
  v_status uuid;
  v_label text;
  v_who text;
begin
  select * into a from public.partner_action_items
   where id = p_action and group_id = public.partner_group_of_user();
  if a.id is null then
    raise exception 'That item is not yours to review' using errcode = '42501';
  end if;
  if a.status <> 'open' then
    raise exception 'That item has already been answered' using errcode = '22023';
  end if;
  if a.work_item_id is null then
    raise exception 'That item is not a review' using errcode = '22023';
  end if;

  update public.partner_action_items
     set status = case when p_approved then 'completed' else 'changes_requested' end,
         responded_by = auth.uid(), responded_at = now(),
         response = nullif(btrim(coalesce(p_comment, '')), ''), updated_at = now()
   where id = p_action;

  select * into w from public.work_items where id = a.work_item_id;

  /* Falls back to a state that exists rather than leaving the work stranded
     in For Partner Approval if a workspace has not been given these rows. */
  select id, label into v_status, v_label from public.workspace_statuses
   where workspace_id = w.workspace_id
     and key = case when p_approved then 'approved_scheduled' else 'changes_requested' end;
  if v_status is null then
    select id, label into v_status, v_label from public.workspace_statuses
     where workspace_id = w.workspace_id
       and key = case when p_approved then 'internal_review' else 'in_progress' end;
  end if;

  if v_status is not null then
    /* `completed_at` is NOT set. Approval is not publication, and a stamped
       completion is what took the work out of My Work and counted it in
       production before anybody had posted it. */
    update public.work_items
       set status_id = v_status, updated_at = now()
     where id = a.work_item_id;
  end if;

  select coalesce(full_name, email) into v_who from public.profiles where id = auth.uid();
  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (a.agency_id, null, 'work_item', a.work_item_id::text, auth.uid(), v_who,
     case when p_approved then 'Partner approved' else 'Partner requested changes' end,
     coalesce(nullif(btrim(coalesce(p_comment, '')), ''),
              case when p_approved then 'Approved.' else 'Changes requested.' end),
     'partner_review', 'For Partner Approval', coalesce(v_label, 'unchanged'), 'shared_with_partner');

  perform public.log_audit('marketing.approval_answered', 'work_item', a.work_item_id::text, null,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('approved', p_approved, 'comment', p_comment, 'moved_to', v_label));
end $function$;
revoke execute on function public.my_partner_review(uuid, boolean, text) from public, anon;
grant execute on function public.my_partner_review(uuid, boolean, text) to authenticated;
