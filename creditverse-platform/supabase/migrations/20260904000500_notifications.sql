-- Phase 5: a real notification engine.
--
-- Facts this rests on (verified live before writing):
--   * There was no notifications relation. The frontend showed an honest
--     empty state.
--   * Every audited mutation already lands in activity_events through six
--     SECURITY DEFINER loggers (log_work_activity, log_fulfillment_client_
--     activity, log_funding_client_activity, log_funding_deal_activity,
--     log_department_status_activity, log_eod_activity). Assignee changes
--     carry the old/new assignee UUID as text in previous_value/new_value.
--   * entity_visible() and can_view_activity() are SECURITY INVOKER, so they
--     answer for whoever is reading. That makes read time the right place to
--     re-check authorization: a notification about a record the recipient can
--     no longer see disappears, and the badge (same predicate) agrees.
--
-- Design: ONE table, one row per recipient per event. Recipients are computed
-- deterministically by an AFTER INSERT trigger on activity_events — the single
-- choke point — so no logger has to change and nothing can notify by hand.
-- Clients may only read their own rows and set read_at.

----------------------------------------------------------------------
-- 0. Hardening found while auditing grants: Supabase's default grants gave
--    anon/authenticated TRUNCATE, TRIGGER and REFERENCES on all 33 tables.
--    None of the three is governed by RLS. PostgREST never issues them, so
--    they were not reachable, but append-only tables must not carry them.
----------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

----------------------------------------------------------------------
-- 1. Table
----------------------------------------------------------------------
create table public.notifications (
  id               bigint generated always as identity primary key,
  recipient_id     uuid not null references public.profiles(id) on delete cascade,
  actor_id         uuid references public.profiles(id) on delete set null,
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete cascade,
  kind             text not null check (kind in ('assigned', 'unassigned', 'note', 'status')),
  entity_type      text not null,
  entity_id        text not null,
  entity_label     text,
  activity_id      bigint references public.activity_events(id) on delete cascade,
  visibility       public.activity_visibility not null,
  title            text not null,
  detail           text,
  created_at       timestamptz not null default now(),
  read_at          timestamptz
);

comment on table public.notifications is
  'One row per recipient per event. Written only by notify_from_activity(); clients read their own rows and set read_at.';

-- A person is told about an event once, per kind.
create unique index notifications_once_per_event
  on public.notifications (recipient_id, activity_id, kind)
  where activity_id is not null;
-- The badge and the list.
create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

alter table public.notifications enable row level security;

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Read: mine, and still authorized for the underlying record right now.
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    recipient_id = auth.uid()
    and public.can_view_activity(agency_id, organization_id, visibility, entity_type)
    and public.entity_visible(entity_type, entity_id)
  );

-- Mark read: mine. The column grant limits what can change to read_at.
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

----------------------------------------------------------------------
-- 2. Recipient resolution
----------------------------------------------------------------------
create or replace function public.as_uuid(p text)
returns uuid language sql immutable as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
  end
$$;

-- Who currently owns a record, and what to call it. Internal: definer, not
-- callable from the API.
create or replace function public.record_owner(
  p_entity_type text, p_entity_id text,
  out assignee uuid, out team uuid, out label text)
language plpgsql security definer stable set search_path = public as $$
declare v_id uuid := public.as_uuid(p_entity_id);
begin
  if v_id is null then return; end if;
  if p_entity_type = 'work_item' then
    select w.assigned_to, w.team_id, w.title into assignee, team, label
      from public.work_items w where w.id = v_id;
  elsif p_entity_type = 'fulfillment_client' then
    select c.assigned_agent_id, c.team_id, c.name into assignee, team, label
      from public.fulfillment_clients c where c.id = v_id;
  elsif p_entity_type = 'funding_client' then
    select c.assigned_agent_id, c.team_id, c.name into assignee, team, label
      from public.funding_clients c where c.id = v_id;
  end if;
end $$;

create or replace function public.notify_from_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner record;
  v_new   uuid;
  v_old   uuid;
begin
  -- Rule 1: assignment changed → the person who gained it, the person who lost it.
  if new.action = 'Assignee changed' and new.field in ('assigned_to', 'assigned_agent_id') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    v_new := public.as_uuid(new.new_value);
    v_old := public.as_uuid(new.previous_value);
    if v_new is not null and v_new is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_new, new.actor_id, new.agency_id, new.organization_id, 'assigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Assigned to you', new.detail)
      on conflict do nothing;
    end if;
    if v_old is not null and v_old is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_old, new.actor_id, new.agency_id, new.organization_id, 'unassigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Reassigned away from you', new.detail)
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- Rule 2: created already assigned → the assignee. (The creation event
  -- itself does not carry the assignee, so read the record.)
  if new.action in ('Work item created', 'Client added') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'assigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Assigned to you', new.detail)
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- Rule 3: a note or comment → the current assignee and the leads of the
  -- record's team. Never the author. Visibility is copied, so an org user
  -- assigned to organization work never reads a bes_internal note.
  if new.action in ('Comment posted', 'Note') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'note', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail)
      on conflict do nothing;
    end if;
    if v_owner.team is not null then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      select tm.user_id, new.actor_id, new.agency_id, new.organization_id, 'note', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail
        from public.team_memberships tm
       where tm.team_id = v_owner.team
         and tm.is_lead
         and tm.user_id is distinct from new.actor_id
         and tm.user_id is distinct from v_owner.assignee
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- Rule 4: status moved by someone else → the assignee.
  if new.field in ('stage', 'status', 'department_status', 'deal_status') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'status', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail)
      on conflict do nothing;
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.as_uuid(text) from public, anon, authenticated;
revoke execute on function public.record_owner(text, text) from public, anon, authenticated;
revoke execute on function public.notify_from_activity() from public, anon, authenticated;

-- AFTER, so stamp_activity_agency (BEFORE) has already filled agency_id.
create trigger activity_events_notify
  after insert on public.activity_events
  for each row execute function public.notify_from_activity();
