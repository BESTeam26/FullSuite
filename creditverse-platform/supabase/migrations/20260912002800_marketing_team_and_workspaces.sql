-- =============================================================================
-- The Sales & Marketing team, the internal workspace, and partner workspaces
-- that provision themselves.
--
-- Dee, 2026-09-12: "When an active Sales & Marketing service engagement is
-- created: ensure that Partner has a canonical Marketing workspace… Do NOT
-- create duplicate workspaces every time another Marketing service is added.
-- Creation must be idempotent."
--
-- ── ONE WORKSPACE PER PARTNER, NOT PER SERVICE ──────────────────────────────
--
-- A partner buying Social Media Management and then Content & Creative has
-- ONE marketing workspace holding both. The service is recorded on the work
-- inside it where that matters, not by splitting the partner in two.
--
-- ── BES's OWN MARKETING IS A WORKSPACE, NOT A FAKE PARTNER ──────────────────
--
-- `workspaces.partner_group_id` is nullable and `agency_id` is not, so an
-- agency-owned workspace is already the model. Dee: "Do NOT create BES as a
-- fake Partner." Inventing an outsourcing_group called "BES" would put BES in
-- its own partner list, its own invoices and its own engagement rules.
-- =============================================================================

-- ── The division, the department and its team ───────────────────────────────
/* A department belongs to a division, and the division is what carries the
   `service`. Sales & Marketing is an operating division beside the others. */
insert into public.divisions (agency_id, name, description, service, sort, tier)
select a.id, 'Sales & Marketing',
       'Marketing and sales work for BES and for partners who buy it.',
       'sales_marketing', 50, 'operating'
  from public.agencies a
 where not exists (
   select 1 from public.divisions d where d.agency_id = a.id and d.service = 'sales_marketing');

insert into public.departments (agency_id, division_id, division, key, name, sort)
select a.id, dv.id, 'sales_marketing', 'sales_marketing', 'Sales & Marketing', 10
  from public.agencies a
  join public.divisions dv on dv.agency_id = a.id and dv.service = 'sales_marketing'
 where not exists (
   select 1 from public.departments d
    where d.agency_id = a.id and d.division = 'sales_marketing' and d.key = 'sales_marketing');

insert into public.teams (agency_id, department_id, name, description, sort)
select a.id, d.id, 'Sales & Marketing Team',
       'Marketing and sales work for BES and for partners who buy it.', 60
  from public.agencies a
  join public.departments d
    on d.agency_id = a.id and d.division = 'sales_marketing' and d.key = 'sales_marketing'
 where not exists (
   select 1 from public.teams t
    where t.agency_id = a.id and t.department_id = d.id and t.name = 'Sales & Marketing Team');

/* Marketing assigns deliberately — a person picks up a campaign, a lead gives
   out content work. Dee: "Do NOT copy CreditOps Auto Equal routing into
   Marketing." The column exists for every department; this one says so. */
update public.departments set assignment_mode = 'team_lead'
 where division = 'sales_marketing' and key = 'sales_marketing';

-- ── Calendar is a view kind the generic engine did not have ────────────────
/**
 * `workspace_boards.view_kind` allowed `list` and `board`. Marketing needs a
 * calendar, and Dee was explicit that it must not be a separate data source:
 * "Do not create a separate calendar data source. One record. Multiple
 * views."
 *
 * So it is a third view over the same work items, added to the generic engine
 * rather than built beside it — which is what makes the same record show up
 * as a task and as a scheduled post.
 */
alter table public.workspace_boards drop constraint if exists workspace_boards_view_kind_check;
alter table public.workspace_boards add constraint workspace_boards_view_kind_check
  check (view_kind in ('list', 'board', 'calendar'));

-- ── Provisioning a marketing workspace ──────────────────────────────────────
/**
 * Ensure the workspace exists for one partner — or for BES itself when
 * `p_group` is null — and return it.
 *
 * Idempotent by lookup, not by exception: called on every engagement change
 * and every time the module lists its partners, so it has to be cheap and
 * silent when there is nothing to do.
 *
 * The statuses, item types, fields and views are seeded WITH the workspace,
 * because a workspace with no statuses is one nobody can put work in — and
 * they are rows, so Dee can rename or reorder them later without a migration.
 */
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
     and partner_group_id is not distinct from p_group
     and archived_at is null
     and icon = 'megaphone';
  if v_id is not null then return v_id; end if;

  v_name := coalesce(
    p_name,
    (select g.name || ' — Marketing' from public.outsourcing_groups g where g.id = p_group),
    'BES Internal Marketing');

  insert into public.workspaces (agency_id, partner_group_id, name, description, icon, colour)
  values (p_agency, p_group, v_name,
          case when p_group is null
               then 'BES''s own content, campaigns, social and launch work.'
               else 'Marketing and sales work BES does for this partner.' end,
          'megaphone', '#7c3aed')
  returning id into v_id;

  /* V1 workflow, as ROWS. `canonical_stage` maps each one onto the platform's
     existing `work_stage` vocabulary, so reporting, Attention and EOD
     understand marketing work without knowing anything about marketing —
     which is the whole point of one work engine. The LABELS are Dee's; the
     stage behind each is the canonical one. */
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

  /* Content metadata as FIELDS, so a content item and a task are the same
     record seen two ways — Dee: "One record. Multiple views." */
  insert into public.workspace_fields (workspace_id, key, label, field_type, options, position) values
    /* `options` is an OBJECT with a `choices` array — the shape the table's
       own constraint requires, checked rather than assumed. */
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

revoke execute on function public.ensure_marketing_workspace(uuid, uuid, text) from public, anon;
grant execute on function public.ensure_marketing_workspace(uuid, uuid, text) to authenticated;

-- ── BES's own ───────────────────────────────────────────────────────────────
do $$
declare a uuid;
begin
  select id into a from public.agencies limit 1;
  perform public.ensure_marketing_workspace(a, null, 'BES Internal Marketing');
end $$;

-- ── A marketing engagement provisions its workspace ─────────────────────────
create or replace function public.marketing_engagement_workspace()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.service = 'sales_marketing' and new.outsourcing_group_id is not null then
    perform public.ensure_marketing_workspace(new.agency_id, new.outsourcing_group_id, null);
  end if;
  return null;
end $function$;
revoke execute on function public.marketing_engagement_workspace() from public, anon, authenticated;

drop trigger if exists fulfillment_engagements_marketing_workspace on public.fulfillment_engagements;
create trigger fulfillment_engagements_marketing_workspace
  after insert or update of service, status on public.fulfillment_engagements
  for each row execute function public.marketing_engagement_workspace();

-- ── Who is in the module ────────────────────────────────────────────────────
/**
 * Partners with a LIVE Sales & Marketing engagement, and nothing else.
 *
 * Derived, never maintained: Dee, "Do not manually maintain this Partner
 * list. It must derive from the engagements." Pausing or ending an engagement
 * removes the partner from the active list and touches none of their
 * workspace, tasks, files or history.
 */
create or replace view public.marketing_partners as
  select distinct g.id, g.name, g.partner_name, g.lifecycle,
         (select w.id from public.workspaces w
           where w.partner_group_id = g.id and w.icon = 'megaphone' and w.archived_at is null
           limit 1) as workspace_id
    from public.outsourcing_groups g
    join public.fulfillment_engagements e on e.outsourcing_group_id = g.id
   where e.service = 'sales_marketing'
     and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
     and g.archived_at is null
     and not g.is_fixture;

alter view public.marketing_partners set (security_invoker = true);
comment on view public.marketing_partners is
  'Partners with a live Sales & Marketing engagement. Module membership is derived from the engagement — never ticked by hand (Dee, 2026-09-12).';
grant select on public.marketing_partners to authenticated;
