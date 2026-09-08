-- 0198 — Creating a BES channel, atomically. And the two that must always exist.
--
-- ---------------------------------------------------------------------------
-- THE CIRCULARITY DEE NAMED (§2)
--
--   "Avoid circular RLS such as: you cannot insert the channel until you are a
--    member, while you cannot become a member until the channel exists."
--
-- It was real, and it was one role away from biting. Creating a channel is two
-- statements: insert `channels`, then insert `channel_members` for the
-- creator. The second is governed by
--
--     channel_members_write ... with check (channel_manager(channel_id))
--
-- and `channel_manager` asks for an EXISTING manager row — or, for an agency
-- channel, `is_admin_of`. So an owner or admin creating a channel passes on
-- the admin branch and never notices. An `agency_manager` granted the
-- capability creates the channel and is then refused membership of it: a
-- channel they own, cannot manage, and cannot add anybody to.
--
-- One authorized operation in one transaction removes the question.
--
-- ---------------------------------------------------------------------------
-- WHAT THE DEFINER IS TRUSTED WITH, AND WHAT IT CHECKS FIRST
--
-- Dee, §2: validate auth.uid(); validate ACTIVE agency membership; validate
-- the capability; take the agency FROM THE MEMBERSHIP and never from the
-- browser; safe search_path; create only inside the caller's own agency.
--
-- All six, in that order, before a single row is written. The agency is
-- resolved here precisely so that a browser cannot name one — which is rule
-- 16's "never trust an organization_id supplied by the frontend as proof of
-- access", applied to the agency.
--
-- RLS is not weakened anywhere in this migration. No policy gains USING true,
-- WITH CHECK true, or a bare is_staff_of.
-- ---------------------------------------------------------------------------

-- ── §6 — a permanent key, so a rename never makes a second one ──────────
alter table public.channels
  add column if not exists system_key text
    check (system_key is null or system_key in ('general_discussion', 'announcements_updates'));

create unique index if not exists channels_system_key_idx
  on public.channels (agency_id, system_key) where system_key is not null;

comment on column public.channels.system_key is
  'A default channel''s permanent identity. Dee, §6: "Do not identify default channels only by their display name." Renaming General Discussion must not cause the seeder to make a second one.';

-- ── §3 — the capability, named as Dee named it ──────────────────────────
--
-- `communication.manage` from 0192 is RENAMED rather than joined by a second
-- key meaning the same thing (rule 6). It is a few hours old and nothing has
-- been granted on it.
--
-- The new key is INSERTED before anything is repointed at it and the old one
-- is deleted LAST: `agency_role_permissions.key` is a foreign key, so renaming
-- the parent row out from under its children fails with 23503. Found by
-- pushing it.
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('communication.channels.manage', 'Communication', 'Manage conversations',
   'Create channels, and add or remove their people and teams.', true, 151),
  ('communication.channels.create', 'Communication', 'Create channels',
   'Open a new BES conversation. Owner and administrator hold it by role; anybody else must be granted it.',
   true, 152)
on conflict (key) do nothing;

update public.agency_role_permissions set key = 'communication.channels.manage'
 where key = 'communication.manage'
   and not exists (select 1 from public.agency_role_permissions x
                    where x.key = 'communication.channels.manage'
                      and x.role = agency_role_permissions.role
                      and x.agency_id is not distinct from agency_role_permissions.agency_id);
update public.agency_member_permissions set key = 'communication.channels.manage'
 where key = 'communication.manage';
delete from public.agency_role_permissions where key = 'communication.manage';
delete from public.permission_keys where key = 'communication.manage';

insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'communication.channels.create', false),
  (null, 'agency_team_lead', 'communication.channels.create', false),
  (null, 'agency_agent',     'communication.channels.create', false)
on conflict do nothing;

-- ── §2 — one authorized operation ───────────────────────────────────────
create or replace function public.create_agency_channel(
  p_name          text,
  p_purpose       text default null,
  p_kind          text default 'topic',
  p_open_to_scope boolean default false,
  p_team_ids      uuid[] default '{}',
  p_user_ids      uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_me     uuid := auth.uid();
  v_agency uuid;
  v_id     uuid;
  v_team   uuid;
  v_user   uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  /* The agency comes from the caller's own ACTIVE membership. Not from an
     argument — there is deliberately no agency argument to pass. */
  select agency_id into v_agency
    from public.agency_memberships
   where user_id = v_me and status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'Not active agency staff' using errcode = '42501';
  end if;

  if not public.agency_can('communication.channels.create') then
    raise exception 'You do not have permission to create channels' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'A conversation needs a name' using errcode = '22023';
  end if;
  if p_kind not in ('general', 'department', 'topic') then
    raise exception 'Not a channel kind you can create here' using errcode = '22023';
  end if;

  insert into public.channels (agency_id, kind, name, purpose, created_by, open_to_scope)
  values (v_agency, p_kind::public.channel_kind, trim(p_name),
          nullif(trim(coalesce(p_purpose, '')), ''), v_me, coalesce(p_open_to_scope, false))
  returning id into v_id;

  /* The creator manages it. Without this the channel exists and nobody can
     add anybody to it — the circularity above. */
  insert into public.channel_members (channel_id, user_id, is_manager)
  values (v_id, v_me, true);

  /* A team must be one of THIS agency's. A uuid from the browser proves the
     team exists, not that it is ours. */
  foreach v_team in array coalesce(p_team_ids, '{}') loop
    if not exists (select 1 from public.teams t
                    where t.id = v_team and t.agency_id = v_agency and t.archived_at is null) then
      raise exception 'That team is not one of yours' using errcode = '42501';
    end if;
    insert into public.channel_teams (channel_id, team_id) values (v_id, v_team)
      on conflict do nothing;
  end loop;

  /* Likewise a person: active staff of this agency, or nobody. */
  foreach v_user in array coalesce(p_user_ids, '{}') loop
    if not exists (select 1 from public.agency_memberships m
                    where m.user_id = v_user and m.agency_id = v_agency and m.status = 'active') then
      raise exception 'That person is not active staff of this agency' using errcode = '42501';
    end if;
    insert into public.channel_members (channel_id, user_id, is_manager)
    values (v_id, v_user, false) on conflict do nothing;
  end loop;

  return v_id;
end;
$function$;
revoke execute on function public.create_agency_channel(text, text, text, boolean, uuid[], uuid[]) from public, anon;
grant execute on function public.create_agency_channel(text, text, text, boolean, uuid[], uuid[]) to authenticated;

comment on function public.create_agency_channel(text, text, text, boolean, uuid[], uuid[]) is
  'Create a BES conversation and its first membership in ONE transaction. The agency is read from the caller''s own active membership and cannot be supplied. RLS is unchanged — this exists because creating a channel and joining it are two writes whose policies would otherwise deadlock for anybody who is not already an administrator (Dee, §2).';

-- ── §5, §7, §8 — the two channels that must always exist ────────────────
--
-- Both are AGENCY_ALL: `open_to_scope`, which resolves through
-- `is_staff_of(agency)` and therefore through `agency_memberships.status`. So
-- somebody activated tomorrow is in them tomorrow, somebody suspended is out
-- the same second, and there is not one membership row per employee to keep
-- tidy (Dee, §8: "No manual membership cleanup").
--
-- Idempotent on `system_key`, not on the name. Running it twice, or after
-- somebody renames General Discussion, creates nothing.
create or replace function public.ensure_default_agency_channels(p_agency uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_owner uuid;
  v_key   text;
  v_name  text;
  v_purpose text;
  v_kind  text;
  v_existing uuid;
begin
  select user_id into v_owner from public.agency_memberships
   where agency_id = p_agency and role = 'agency_owner' and status = 'active'
   order by created_at limit 1;

  foreach v_key in array array['general_discussion', 'announcements_updates'] loop
    v_name := case v_key when 'general_discussion' then 'General Discussion'
                         else 'Announcements and Updates' end;
    v_purpose := case v_key when 'general_discussion' then 'Everyone at BES.'
                            else 'Official BES announcements, and the conversation around them.' end;
    v_kind := case v_key when 'general_discussion' then 'general' else 'topic' end;

    if exists (select 1 from public.channels
                where agency_id = p_agency and system_key = v_key) then
      continue;
    end if;

    /* §7 reconciliation: adopt an equivalent channel somebody already made
       rather than stand a second one beside it. Matched on name, and ONLY on
       an unkeyed agency channel — adoption sets the key and changes nothing
       else, so no messages move and nothing is merged. */
    select id into v_existing from public.channels
     where agency_id = p_agency and system_key is null and archived_at is null
       and lower(trim(name)) = any (
         case v_key
           when 'general_discussion' then array['general', 'general discussion', 'general chat']
           else array['announcements', 'announcements and updates', 'announcements & updates']
         end)
     order by created_at limit 1;

    if v_existing is not null then
      update public.channels
         set system_key = v_key, name = v_name, open_to_scope = true
       where id = v_existing;
      continue;
    end if;

    insert into public.channels (agency_id, kind, name, purpose, created_by, open_to_scope, system_key)
    values (p_agency, v_kind::public.channel_kind, v_name, v_purpose, v_owner, true, v_key);
  end loop;
end;
$function$;
revoke execute on function public.ensure_default_agency_channels(uuid) from public, anon;
grant execute on function public.ensure_default_agency_channels(uuid) to authenticated;

comment on function public.ensure_default_agency_channels(uuid) is
  'Idempotent on system_key. Adopts an equivalent unkeyed channel rather than creating a duplicate beside it, and never merges two that both hold messages (Dee, §7).';

/* Every agency that exists now. New agencies are handled by the trigger below. */
do $$
declare a record;
begin
  for a in select id from public.agencies loop
    perform public.ensure_default_agency_channels(a.id);
  end loop;
end $$;

create or replace function public.seed_agency_channels()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  perform public.ensure_default_agency_channels(new.id);
  return new;
end;
$function$;
drop trigger if exists agencies_seed_channels on public.agencies;
create trigger agencies_seed_channels after insert on public.agencies
  for each row execute function public.seed_agency_channels();

-- ── §7 — a default channel cannot be archived or renamed away ───────────
create or replace function public.protect_system_channels()
returns trigger language plpgsql set search_path = public as $function$
begin
  if old.system_key is not null then
    if new.system_key is distinct from old.system_key then
      raise exception 'A default channel keeps its identity' using errcode = 'P0001';
    end if;
    if new.archived_at is not null and old.archived_at is null then
      raise exception 'General Discussion and Announcements and Updates cannot be archived. Every active agency has them.'
        using errcode = 'P0001';
    end if;
    /* Renaming is allowed — the KEY is the identity, not the label (§6). */
  end if;
  return new;
end;
$function$;
drop trigger if exists channels_protect_system on public.channels;
create trigger channels_protect_system before update on public.channels
  for each row execute function public.protect_system_channels();
