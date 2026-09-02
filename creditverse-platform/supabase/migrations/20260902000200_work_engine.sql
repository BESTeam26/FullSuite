-- =============================================================================
-- BES Platform — Migration 0002: Shared Operations Engine
-- =============================================================================
-- One work engine, hard-scoped. Mirrors WorkItem / ActivityEntry from
-- src/lib/bes-domain.ts and src/lib/fulfillment/creditops-store-types.ts.
--
--   scope = AGENCY        -> BES employees only. organization_id IS NULL.
--                            subject_organization_id names the org the work is
--                            ABOUT (a fulfillment subscriber), which is how BES
--                            does done-for-you work without the item becoming
--                            that org's own work.
--   scope = ORGANIZATION  -> a customer org's self-managed work.
--                            organization_id IS NOT NULL.
--
-- The boundary rule from the domain model holds in the database: sub-account
-- activity never automatically becomes BES agency work.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.work_scope as enum ('AGENCY', 'ORGANIZATION');

create type public.work_related_type as enum (
  'credit_case', 'funding_deal', 'project', 'support', 'fulfillment'
);

create type public.work_stage as enum (
  'Queued', 'Assigned', 'In Processing', 'Ready for QA',
  'QA Review', 'Completed', 'Blocked', 'Attention'
);

create type public.work_priority as enum ('Normal', 'High', 'Urgent');

-- -----------------------------------------------------------------------------
-- work_items
-- -----------------------------------------------------------------------------
create table public.work_items (
  id                        uuid primary key default gen_random_uuid(),
  scope                     public.work_scope not null,
  -- Owning scope. NULL for AGENCY work.
  organization_id           uuid references public.organizations(id) on delete cascade,
  -- The org this work concerns (AGENCY fulfillment work for a subscriber).
  subject_organization_id   uuid references public.organizations(id) on delete set null,
  related_type              public.work_related_type not null,
  -- Domain record reference. Real FKs arrive with the Phase 3+ tables.
  related_ref               text,
  title                     text not null,
  description               text,
  stage                     public.work_stage not null default 'Queued',
  priority                  public.work_priority not null default 'Normal',
  assigned_to               uuid references public.profiles(id) on delete set null,
  created_by                uuid references public.profiles(id) on delete set null,
  due_at                    timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint work_items_scope_org_ck check (
    (scope = 'ORGANIZATION' and organization_id is not null) or
    (scope = 'AGENCY'       and organization_id is null)
  )
);

create index work_items_scope_idx on public.work_items(scope, stage);
create index work_items_org_idx on public.work_items(organization_id) where organization_id is not null;
create index work_items_subject_org_idx on public.work_items(subject_organization_id) where subject_organization_id is not null;
create index work_items_assignee_idx on public.work_items(assigned_to, stage);
create index work_items_due_idx on public.work_items(due_at) where completed_at is null;

create trigger work_items_updated_at before update on public.work_items
  for each row execute function public.set_updated_at();

-- Stamp completed_at whenever the item lands on Completed (and clear it if reopened).
create or replace function public.work_items_stamp_completion()
returns trigger language plpgsql as $$
begin
  if new.stage = 'Completed' and (old.stage is distinct from 'Completed') then
    new.completed_at = now();
  elsif new.stage <> 'Completed' then
    new.completed_at = null;
  end if;
  return new;
end $$;

create trigger work_items_completion before update on public.work_items
  for each row execute function public.work_items_stamp_completion();

-- -----------------------------------------------------------------------------
-- activity_events — append-only timeline for any entity
-- -----------------------------------------------------------------------------
create table public.activity_events (
  id               bigint generated always as identity primary key,
  -- RLS scope. NULL = agency-scope activity (BES staff only).
  organization_id  uuid references public.organizations(id) on delete cascade,
  entity_type      text not null,          -- 'work_item' | 'organization' | ...
  entity_id        text not null,
  actor_id         uuid references public.profiles(id) on delete set null,
  -- Denormalised so the timeline still reads correctly after a user is removed.
  actor_name       text,
  action           text not null,          -- 'Status changed'
  detail           text,                   -- 'In Processing → Ready for QA'
  field            text,
  previous_value   text,
  new_value        text,
  pinned           boolean not null default false,
  mark             text,
  created_at       timestamptz not null default now()
);

create index activity_events_entity_idx on public.activity_events(entity_type, entity_id, created_at desc);
create index activity_events_org_idx on public.activity_events(organization_id, created_at desc);
create index activity_events_pinned_idx on public.activity_events(entity_type, entity_id) where pinned;

-- -----------------------------------------------------------------------------
-- files — metadata for Storage objects (evidence, letters, attachments)
-- -----------------------------------------------------------------------------
create table public.files (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  entity_type      text,
  entity_id        text,
  bucket           text not null default 'bes-files',
  path             text not null unique,
  name             text not null,
  mime_type        text,
  size_bytes       bigint check (size_bytes >= 0),
  sha256           text,
  uploaded_by      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index files_entity_idx on public.files(entity_type, entity_id);
create index files_org_idx on public.files(organization_id);

-- Private bucket. Access is granted only through the storage policies below.
insert into storage.buckets (id, name, public)
values ('bes-files', 'bes-files', false)
on conflict (id) do nothing;

-- =============================================================================
-- Authorization helpers for work
-- =============================================================================

-- Can the caller see a work item with this scope/org pair?
create or replace function public.can_view_work(
  p_scope public.work_scope, p_org uuid, p_subject_org uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_scope = 'AGENCY' then
      -- BES staff see all agency work. An org admin may see agency work performed
      -- FOR their organization (done-for-you transparency), never other orgs'.
      public.is_agency_staff()
      or (p_subject_org is not null and public.is_org_admin(p_subject_org))
    else
      public.is_agency_staff() or public.is_org_member(p_org)
  end
$$;

-- Can the caller create/modify work in this scope?
create or replace function public.can_write_work(
  p_scope public.work_scope, p_org uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_scope = 'AGENCY' then public.is_agency_staff()
    else public.is_agency_manager_or_above() or public.is_org_member(p_org)
  end
$$;

-- Scoped assignee picker: never a company-wide directory dump.
-- AGENCY work  -> BES staff.
-- ORG work     -> that organization's members only.
create or replace function public.assignable_profiles(
  p_scope public.work_scope, p_org uuid default null
) returns table (id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, am.role::text
  from public.agency_memberships am
  join public.profiles p on p.id = am.user_id
  where p_scope = 'AGENCY' and public.is_agency_staff()
  union all
  select p.id, p.full_name, p.email, om.role::text
  from public.org_memberships om
  join public.profiles p on p.id = om.user_id
  where p_scope = 'ORGANIZATION'
    and om.organization_id = p_org
    and (public.is_agency_staff() or public.is_org_member(p_org))
$$;

-- =============================================================================
-- Activity logging — automatic on work-item changes
-- =============================================================================
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

  if new.stage is distinct from old.stage then
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

create trigger work_items_activity_insert after insert on public.work_items
  for each row execute function public.log_work_activity();
create trigger work_items_activity_update after update on public.work_items
  for each row execute function public.log_work_activity();

-- =============================================================================
-- Attention view — what needs a human, scoped by RLS (security_invoker)
-- =============================================================================
create view public.work_attention
with (security_invoker = true) as
select
  w.*,
  case
    when w.stage in ('Blocked', 'Attention') then 'blocked'
    when w.due_at is not null and w.due_at < now() then 'overdue'
    when w.due_at is not null and w.due_at < now() + interval '4 hours' then 'sla_risk'
  end as attention_reason,
  case
    when w.due_at is null then null
    else round(extract(epoch from (w.due_at - now())) / 3600.0, 1)
  end as hours_remaining
from public.work_items w
where w.completed_at is null
  and (
    w.stage in ('Blocked', 'Attention')
    or (w.due_at is not null and w.due_at < now() + interval '4 hours')
  );

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.work_items      enable row level security;
alter table public.activity_events enable row level security;
alter table public.files           enable row level security;

-- work_items
create policy work_items_select on public.work_items for select to authenticated
  using (public.can_view_work(scope, organization_id, subject_organization_id));

create policy work_items_insert on public.work_items for insert to authenticated
  with check (public.can_write_work(scope, organization_id));

-- An agent may edit work they are assigned; managers may edit anything in scope.
create policy work_items_update on public.work_items for update to authenticated
  using (
    assigned_to = auth.uid()
    or (scope = 'AGENCY' and public.is_agency_manager_or_above())
    or (scope = 'ORGANIZATION' and (public.is_agency_manager_or_above() or public.is_org_admin(organization_id)))
  )
  with check (public.can_write_work(scope, organization_id));

create policy work_items_delete on public.work_items for delete to authenticated
  using (
    (scope = 'AGENCY' and public.is_agency_admin())
    or (scope = 'ORGANIZATION' and (public.is_agency_admin() or public.is_org_admin(organization_id)))
  );

-- activity_events: readable in scope, insert-only (append-only timeline).
create policy activity_events_select on public.activity_events for select to authenticated
  using (
    case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

create policy activity_events_insert on public.activity_events for insert to authenticated
  with check (
    case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

-- Only the author may pin/mark their own comment; nothing else is mutable.
create policy activity_events_update on public.activity_events for update to authenticated
  using (actor_id = auth.uid() or public.is_agency_manager_or_above())
  with check (actor_id = auth.uid() or public.is_agency_manager_or_above());

-- No delete policy: activity is append-only by design.

-- files
create policy files_select on public.files for select to authenticated
  using (
    case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and case
      when organization_id is null then public.is_agency_staff()
      else public.is_agency_staff() or public.is_org_member(organization_id)
    end
  );

create policy files_delete on public.files for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_agency_manager_or_above()
    or (organization_id is not null and public.is_org_admin(organization_id))
  );

-- -----------------------------------------------------------------------------
-- Storage policies for the private bes-files bucket.
-- Object paths are laid out as:  <organization_id | 'agency'>/<entity>/<filename>
-- so the first path segment is the tenancy key.
-- -----------------------------------------------------------------------------
create policy bes_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bes-files'
    and (
      (storage.foldername(name))[1] = 'agency' and public.is_agency_staff()
      or (
        (storage.foldername(name))[1] <> 'agency'
        and (
          public.is_agency_staff()
          or public.is_org_member(((storage.foldername(name))[1])::uuid)
        )
      )
    )
  );

create policy bes_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    and (
      (storage.foldername(name))[1] = 'agency' and public.is_agency_staff()
      or (
        (storage.foldername(name))[1] <> 'agency'
        and (
          public.is_agency_staff()
          or public.is_org_member(((storage.foldername(name))[1])::uuid)
        )
      )
    )
  );

create policy bes_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'bes-files'
    and (owner = auth.uid() or public.is_agency_manager_or_above())
  );

-- Grants (RLS still applies)
grant select, insert, update, delete on public.work_items to authenticated;
grant select, insert, update on public.activity_events to authenticated;
grant select, insert, delete on public.files to authenticated;
grant select on public.work_attention to authenticated;
