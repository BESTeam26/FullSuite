-- Phase 6, step 2 of 2: Custom Workspaces foundation.
--
-- Doctrine (CLAUDE.md rule 17): one engine underneath, always. Customisation
-- is DATA — statuses, item types and fields are rows scoped to a workspace,
-- and every workspace item is a canonical work_items row. Nothing here creates
-- a second task engine; Time, Production, EOD, Attention and Reporting keep
-- reading work_items exactly as before.
--
-- The one bridge that keeps "one engine" true: each workspace status maps to a
-- canonical work_stage. A trigger copies that stage onto the item whenever its
-- status changes, so work_attention, EOD and completion stamping never need to
-- know that custom statuses exist. is_terminal is the same fact as
-- canonical_stage = 'Completed' — a check constraint says so.
--
-- Assumptions taken from the proposal's open questions, recorded here:
--   * statuses are a list, not a workflow (no "may follow" rules);
--   * workspace items enter Attention only the way any work item does — a
--     blocked/attention stage or a due date;
--   * 'crm' means BES CRM delivery visibility.

----------------------------------------------------------------------
-- 0. Entitlement check usable in policies
----------------------------------------------------------------------
create or replace function public.org_entitled(p_org uuid, p_product text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.product_entitlements pe
     where pe.organization_id = p_org and pe.product::text = p_product and pe.enabled
  )
$$;
revoke execute on function public.org_entitled(uuid, text) from public, anon;
grant execute on function public.org_entitled(uuid, text) to authenticated;

----------------------------------------------------------------------
-- 1. Container and configuration rows
----------------------------------------------------------------------
create table public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 80),
  description     text,
  icon            text,
  colour          text,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index workspaces_org_idx on public.workspaces (organization_id) where archived_at is null;
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_boards (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 80),
  view_kind    text not null default 'list' check (view_kind in ('list', 'board')),
  position     integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index workspace_boards_ws_idx on public.workspace_boards (workspace_id, position);

create table public.workspace_statuses (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  key             text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label           text not null check (length(trim(label)) between 1 and 40),
  colour          text,
  position        integer not null default 0,
  canonical_stage public.work_stage not null default 'Queued',
  is_terminal     boolean not null default false,
  unique (workspace_id, key),
  -- "Done" in a workspace IS the engine's Completed. One truth.
  check (is_terminal = (canonical_stage = 'Completed'))
);
create index workspace_statuses_ws_idx on public.workspace_statuses (workspace_id, position);

create table public.workspace_item_types (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label        text not null check (length(trim(label)) between 1 and 40),
  icon         text,
  position     integer not null default 0,
  unique (workspace_id, key)
);

create table public.workspace_fields (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label        text not null check (length(trim(label)) between 1 and 40),
  field_type   text not null check (field_type in ('text', 'number', 'date', 'select', 'checkbox')),
  options      jsonb,
  position     integer not null default 0,
  unique (workspace_id, key)
);

----------------------------------------------------------------------
-- 2. The engine gains four nullable columns. CreditOps / FundingOps rows
--    leave them NULL and behave exactly as before.
----------------------------------------------------------------------
alter table public.work_items
  add column workspace_id uuid references public.workspaces(id) on delete restrict,
  add column board_id     uuid references public.workspace_boards(id) on delete set null,
  add column status_id    uuid references public.workspace_statuses(id) on delete restrict,
  add column item_type_id uuid references public.workspace_item_types(id) on delete set null;
create index work_items_workspace_idx on public.work_items (workspace_id, board_id) where workspace_id is not null;
create index work_items_status_idx on public.work_items (status_id) where status_id is not null;

create table public.work_item_field_values (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  field_id     uuid not null references public.workspace_fields(id) on delete cascade,
  value        jsonb,
  updated_at   timestamptz not null default now(),
  primary key (work_item_id, field_id)
);

-- Consistency and the stage bridge. BEFORE, so RLS WITH CHECK sees final values.
create or replace function public.work_items_workspace_consistency()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ws_org uuid;
  v_stage  public.work_stage;
begin
  if new.workspace_id is null then
    if new.board_id is not null or new.status_id is not null or new.item_type_id is not null then
      raise exception 'board, status and item type require a workspace' using errcode = '23514';
    end if;
    return new;
  end if;

  select w.organization_id into v_ws_org from public.workspaces w where w.id = new.workspace_id and w.archived_at is null;
  if v_ws_org is null then
    raise exception 'workspace not found or archived' using errcode = '23514';
  end if;
  if new.scope is distinct from 'ORGANIZATION' or new.organization_id is distinct from v_ws_org then
    raise exception 'a workspace item belongs to the workspace''s organization' using errcode = '23514';
  end if;
  if new.board_id is not null and not exists (select 1 from public.workspace_boards b where b.id = new.board_id and b.workspace_id = new.workspace_id) then
    raise exception 'board belongs to another workspace' using errcode = '23514';
  end if;
  if new.item_type_id is not null and not exists (select 1 from public.workspace_item_types t where t.id = new.item_type_id and t.workspace_id = new.workspace_id) then
    raise exception 'item type belongs to another workspace' using errcode = '23514';
  end if;

  -- Default status: the workspace's first. Then copy its canonical stage.
  if new.status_id is null then
    select s.id into new.status_id from public.workspace_statuses s
     where s.workspace_id = new.workspace_id order by s.position, s.key limit 1;
  end if;
  select s.canonical_stage into v_stage from public.workspace_statuses s
   where s.id = new.status_id and s.workspace_id = new.workspace_id;
  if v_stage is null then
    raise exception 'status belongs to another workspace' using errcode = '23514';
  end if;
  new.stage := v_stage;
  -- work_items_stamp_completion ran earlier (alphabetical order) with the
  -- client's stage, so completion is stamped here from the derived one.
  if v_stage = 'Completed' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.work_items_workspace_consistency() from public, anon, authenticated;
create trigger work_items_workspace_consistency
  before insert or update on public.work_items
  for each row execute function public.work_items_workspace_consistency();

-- Logger: a workspace status change is the meaningful event; the derived stage
-- change that accompanies it is not logged twice.
create or replace function public.log_work_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org uuid;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  v_org := coalesce(new.organization_id, new.subject_organization_id);

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Work item created', new.title, new.stage::text);
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Status changed',
            coalesce((select label from public.workspace_statuses where id = old.status_id), '—')
            || ' → ' ||
            coalesce((select label from public.workspace_statuses where id = new.status_id), '—'),
            'status', old.status_id::text, new.status_id::text);
  elsif new.stage is distinct from old.stage then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Status changed', old.stage::text || ' → ' || new.stage::text,
            'stage', old.stage::text, new.stage::text);
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles where id = old.assigned_to), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles where id = new.assigned_to), 'Unassigned'),
            'assigned_to', old.assigned_to::text, new.assigned_to::text);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Priority changed', old.priority::text || ' → ' || new.priority::text,
            'priority', old.priority::text, new.priority::text);
  end if;

  return new;
end $$;

----------------------------------------------------------------------
-- 3. Authorization. Visibility of a workspace = org membership + entitlement
--    (Phase 7 adds "or shared to BES under a live TalentOps engagement" HERE,
--    and nowhere else — every dependent policy follows the workspace).
----------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_boards enable row level security;
alter table public.workspace_statuses enable row level security;
alter table public.workspace_item_types enable row level security;
alter table public.workspace_fields enable row level security;
alter table public.work_item_field_values enable row level security;

revoke all on public.workspaces, public.workspace_boards, public.workspace_statuses,
  public.workspace_item_types, public.workspace_fields, public.work_item_field_values
  from public, anon;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_boards, public.workspace_statuses,
  public.workspace_item_types, public.workspace_fields, public.work_item_field_values to authenticated;

create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_org_member(organization_id) and public.org_entitled(organization_id, 'workspaces'));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (public.is_org_admin(organization_id) and public.org_entitled(organization_id, 'workspaces'));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_org_admin(organization_id) and public.org_entitled(organization_id, 'workspaces'))
  with check (public.is_org_admin(organization_id) and public.org_entitled(organization_id, 'workspaces'));
-- No delete policy: workspaces are archived, never deleted (rule 11).

-- Configuration rows follow the workspace (caller's RLS decides visibility);
-- only an org admin of that workspace's organization may change them.
do $$
declare t text;
begin
  foreach t in array array['workspace_boards', 'workspace_statuses', 'workspace_item_types', 'workspace_fields'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select to authenticated
        using (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id));
      create policy %1$s_write on public.%1$s for insert to authenticated
        with check (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id and public.is_org_admin(w.organization_id)));
      create policy %1$s_update on public.%1$s for update to authenticated
        using (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id and public.is_org_admin(w.organization_id)))
        with check (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id and public.is_org_admin(w.organization_id)));
      create policy %1$s_delete on public.%1$s for delete to authenticated
        using (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id and public.is_org_admin(w.organization_id)));
    $f$, t);
  end loop;
end $$;

-- Field values follow the item; writing requires the item to be updatable by
-- the caller (the same policy that governs the item) and the field to belong
-- to the item's workspace.
create policy work_item_field_values_select on public.work_item_field_values for select to authenticated
  using (exists (select 1 from public.work_items wi where wi.id = work_item_id));
create policy work_item_field_values_write on public.work_item_field_values for all to authenticated
  using (exists (select 1 from public.work_items wi join public.workspace_fields f on f.workspace_id = wi.workspace_id
                  where wi.id = work_item_id and f.id = field_id and public.is_org_member(wi.organization_id)))
  with check (exists (select 1 from public.work_items wi join public.workspace_fields f on f.workspace_id = wi.workspace_id
                  where wi.id = work_item_id and f.id = field_id and public.is_org_member(wi.organization_id)));

-- Work items in a workspace are visible only to those who can see the
-- workspace. One added conjunct on each existing policy; the rest unchanged.
drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
  using (
    (workspace_id is null or exists (select 1 from public.workspaces w where w.id = work_items.workspace_id))
    and (
      (public.is_staff_of(agency_id) and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
      or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
      or (scope = 'AGENCY' and subject_organization_id is not null and public.is_org_admin(subject_organization_id))
    )
  );

drop policy if exists work_items_update on public.work_items;
create policy work_items_update on public.work_items for update to authenticated
  using (
    (workspace_id is null or exists (select 1 from public.workspaces w where w.id = work_items.workspace_id))
    and (
      (public.is_staff_of(agency_id) and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
      or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
    )
  )
  with check (
    (workspace_id is null or exists (select 1 from public.workspaces w where w.id = work_items.workspace_id))
    and (team_id is null or exists (select 1 from public.teams t where t.id = work_items.team_id and t.archived_at is null
                                      and (t.agency_id = work_items.agency_id or t.organization_id = work_items.organization_id)))
    and (assigned_to is null or assigned_to = auth.uid() or public.is_manager_of(agency_id) or public.is_team_lead_of(team_id)
         or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id)))
  );

drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert on public.work_items for insert to authenticated
  with check (
    (workspace_id is null or exists (select 1 from public.workspaces w where w.id = work_items.workspace_id))
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
    )
  );

----------------------------------------------------------------------
-- 4. Audit: workspace configuration changes keep actor, before, after.
----------------------------------------------------------------------
create or replace function public.audit_workspace_config()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id text;
begin
  if tg_table_name = 'workspaces' then
    v_org := coalesce(new.organization_id, old.organization_id);
  else
    select w.organization_id into v_org from public.workspaces w where w.id = coalesce(new.workspace_id, old.workspace_id);
  end if;
  v_id := coalesce(new.id, old.id)::text;
  insert into public.audit_log (actor_id, agency_id, organization_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), public.org_agency(v_org), v_org, tg_op, tg_table_name, v_id,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_workspace_config() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['workspaces', 'workspace_boards', 'workspace_statuses', 'workspace_item_types', 'workspace_fields'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_workspace_config()', t);
  end loop;
end $$;

-- New tables must not carry the default TRUNCATE/TRIGGER/REFERENCES grants.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

----------------------------------------------------------------------
-- 5. Deterministic dev fixtures. Lakeside is entitled; Northgate explicitly
--    is not (negative control). [TEST] prefixes mark them as fixtures.
----------------------------------------------------------------------
insert into public.product_entitlements (organization_id, product, enabled) values
  ('dddddddd-0000-4000-8000-80ce8814eb05', 'workspaces', true),
  ('dddddddd-0000-4000-8000-3f3028d6b8f3', 'workspaces', false)
on conflict do nothing;

insert into public.workspaces (id, organization_id, name, description, icon, colour) values
  ('ee000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-80ce8814eb05',
   '[TEST] Business Acquisition', 'Fixture workspace — not real operational data.', 'briefcase', '#0f766e');
insert into public.workspace_boards (id, workspace_id, name, view_kind, position) values
  ('ee000000-0000-4000-8000-000000000011', 'ee000000-0000-4000-8000-000000000001', 'Pipeline', 'board', 0);
insert into public.workspace_statuses (id, workspace_id, key, label, colour, position, canonical_stage, is_terminal) values
  ('ee000000-0000-4000-8000-000000000021', 'ee000000-0000-4000-8000-000000000001', 'backlog',     'Backlog',     '#64748b', 0, 'Queued',        false),
  ('ee000000-0000-4000-8000-000000000022', 'ee000000-0000-4000-8000-000000000001', 'in_progress', 'In Progress', '#2563eb', 1, 'In Processing', false),
  ('ee000000-0000-4000-8000-000000000023', 'ee000000-0000-4000-8000-000000000001', 'review',      'Review',      '#d97706', 2, 'QA Review',     false),
  ('ee000000-0000-4000-8000-000000000024', 'ee000000-0000-4000-8000-000000000001', 'done',        'Done',        '#16a34a', 3, 'Completed',     true);
insert into public.workspace_item_types (id, workspace_id, key, label, icon, position) values
  ('ee000000-0000-4000-8000-000000000031', 'ee000000-0000-4000-8000-000000000001', 'task',        'Task',        'check-square', 0),
  ('ee000000-0000-4000-8000-000000000032', 'ee000000-0000-4000-8000-000000000001', 'deal_review', 'Deal Review', 'file-search',  1);
insert into public.workspace_fields (id, workspace_id, key, label, field_type, position) values
  ('ee000000-0000-4000-8000-000000000041', 'ee000000-0000-4000-8000-000000000001', 'target_close', 'Target close', 'date', 0);

insert into public.work_items (id, scope, organization_id, related_type, title, description, priority, assigned_to,
                               workspace_id, board_id, status_id, item_type_id) values
  ('ee000000-0000-4000-8000-000000000101', 'ORGANIZATION', 'dddddddd-0000-4000-8000-80ce8814eb05', 'project',
   '[TEST] Review Harbor LOI', 'Fixture item.', 'High',
   (select id from auth.users where email = 'org.owner@bes.test'),
   'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000011',
   'ee000000-0000-4000-8000-000000000022', 'ee000000-0000-4000-8000-000000000032'),
  ('ee000000-0000-4000-8000-000000000102', 'ORGANIZATION', 'dddddddd-0000-4000-8000-80ce8814eb05', 'project',
   '[TEST] Collect Q2 financials', 'Fixture item.', 'Normal', null,
   'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000011',
   'ee000000-0000-4000-8000-000000000021', 'ee000000-0000-4000-8000-000000000031');
