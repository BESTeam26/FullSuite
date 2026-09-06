-- 0104 — Channels. Private by default; BES only by explicit share plus a live
-- engagement.
--
-- Dee's doctrine, restated because every policy below is one of these lines:
--
--   Organization channels are private by default.
--   BES has zero access unless the organization explicitly shares the channel
--     AND there is a qualifying live fulfillment engagement.
--   Shared + live engagement = authorized BES personnel read, post and reply
--     within their permitted service and scope.
--   Shared + engagement ended    = access revoked immediately.
--   Live engagement + not shared = no access.
--   BES may never self-share a channel or grant itself access.
--
-- ── This is not a new sharing model ────────────────────────────────────────
--
-- `workspace_shares` already does exactly this shape for TalentOps: a share row
-- that points at an engagement, so access ends when the engagement does without
-- anybody revoking anything. `channel_shares` is the same pattern, and that is
-- deliberate — a second way to share would be a second thing to get wrong.
--
-- Nothing else here is new either. Authors are `profiles`. Membership is
-- `org_memberships`. Mentions reuse `mentioned_user_ids()`. Attachments reuse
-- `files`. Notifications reuse `notifications`. History reuses
-- `activity_events`. No duplicate identity, file, notification or audit system.

create type public.channel_kind as enum ('general', 'department', 'topic', 'direct');

create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            public.channel_kind not null default 'topic',
  name            text not null check (length(trim(name)) between 1 and 80),
  purpose         text,
  /** A department channel is scoped to one; everything else is null. */
  department_id   uuid references public.organization_departments(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  archived_at     timestamptz
);
create index channels_org_idx on public.channels (organization_id) where archived_at is null;
create unique index channels_one_general_idx on public.channels (organization_id)
  where kind = 'general' and archived_at is null;

comment on table public.channels is
  'An organization''s own channels. Private by default: membership is the only way in, and BES is never a member.';

create table public.channel_members (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  /** Manager may rename, archive, share with BES and add people. */
  is_manager  boolean not null default false,
  joined_at   timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (channel_id, user_id)
);
create index channel_members_user_idx on public.channel_members (user_id);

/**
 * The BES bridge, and the only one.
 *
 * A share names an ENGAGEMENT rather than an agency or a person, so access
 * follows the commercial relationship automatically. When the engagement stops
 * being live, every policy below stops granting — no revocation job, no
 * nightly sweep, nothing to forget. `revoked_at` is for the organization
 * withdrawing a share early.
 */
create table public.channel_shares (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.channels(id) on delete cascade,
  engagement_id uuid not null references public.fulfillment_engagements(id) on delete cascade,
  created_by    uuid not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles(id) on delete set null
);
create index channel_shares_channel_idx on public.channel_shares (channel_id) where revoked_at is null;

comment on table public.channel_shares is
  'The ONLY way BES reaches an organization channel. Points at an engagement, so access ends when the engagement does. Created only by an organization manager of the channel — BES cannot insert one.';

create table public.messages (
  id           bigint generated always as identity primary key,
  channel_id   uuid not null references public.channels(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete restrict,
  /** Same rich-text shape as activity notes, so mentions work unchanged. */
  body         jsonb not null,
  /** Plain text of the same content, for search and for notification detail. */
  body_text    text not null check (length(body_text) between 1 and 8000),
  reply_to_id  bigint references public.messages(id) on delete set null,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  /** Soft only. A message is never removed: history is the record (rule 11). */
  deleted_at   timestamptz
);
create index messages_channel_idx on public.messages (channel_id, created_at desc);
create index messages_author_idx on public.messages (author_id);

comment on table public.messages is
  'Soft-deleted only. A conversation an engagement has ended does not get rewritten — historical BES participation stays attributable (Dee, C4).';

-- ---------------------------------------------------------------------------
-- Authorization. One function each for reading and writing, so the same rule
-- cannot drift between five policies.
-- ---------------------------------------------------------------------------

/**
 * BES reach into one channel.
 *
 * Three things must all hold, and the middle one is the whole doctrine:
 *   1. a share exists and has not been withdrawn;
 *   2. the engagement behind it is LIVE right now;
 *   3. this staff member is in scope for that engagement's service.
 *
 * When the engagement ends, (2) fails and access stops the same second —
 * without deleting a share, a message or a membership.
 */
create or replace function public.channel_shared_with_bes(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.channel_shares s
      join public.fulfillment_engagements e on e.id = s.engagement_id
      join public.channels c on c.id = s.channel_id
     where s.channel_id = p_channel
       and s.revoked_at is null
       and e.organization_id = c.organization_id
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
       and public.is_staff_of(e.agency_id)
       and public.in_scope(e.agency_id, e.service, null, null, null)
  )
$$;
revoke all on function public.channel_shared_with_bes(uuid) from public, anon;
grant execute on function public.channel_shared_with_bes(uuid) to authenticated;

/**
 * May the caller see this channel at all?
 *
 * An organization member needs CHANNEL MEMBERSHIP, not merely organization
 * membership — private by default means exactly that, and a colleague in
 * another department does not read a channel they were not added to.
 */
create or replace function public.channel_visible(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         exists (
           select 1 from public.channel_members m
            where m.channel_id = c.id
              and m.user_id = auth.uid()
              and public.is_org_member(c.organization_id)
         )
         or public.channel_shared_with_bes(c.id)
       )
  )
$$;
revoke all on function public.channel_visible(uuid) from public, anon;
grant execute on function public.channel_visible(uuid) to authenticated;

/**
 * May the caller post here?
 *
 * The same test. Dee, C4: BES may "post and reply in shared channels when the
 * engagement permits it, not read-only." A channel nobody may write to is a
 * noticeboard, and the point of sharing one is to work in it together.
 */
create or replace function public.channel_writable(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.channel_visible(p_channel)
     and not exists (select 1 from public.channels c where c.id = p_channel and c.archived_at is not null)
$$;
revoke all on function public.channel_writable(uuid) from public, anon;
grant execute on function public.channel_writable(uuid) to authenticated;

/** A channel manager, for renaming, archiving, adding people and sharing. */
create or replace function public.channel_manager(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members m
      join public.channels c on c.id = m.channel_id
     where m.channel_id = p_channel and m.user_id = auth.uid() and m.is_manager
       and public.is_org_member(c.organization_id)
  )
  or exists (
    select 1 from public.channels c
     where c.id = p_channel and public.is_org_admin(c.organization_id)
  )
$$;
revoke all on function public.channel_manager(uuid) from public, anon;
grant execute on function public.channel_manager(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies.
-- ---------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_shares enable row level security;
alter table public.messages enable row level security;

create policy channels_select on public.channels for select to authenticated
  using (public.channel_visible(id));
/* Only a member of the organization creates a channel in it, and never BES. */
create policy channels_insert on public.channels for insert to authenticated
  with check (public.is_org_member(organization_id) and created_by = auth.uid());
create policy channels_update on public.channels for update to authenticated
  using (public.channel_manager(id)) with check (public.channel_manager(id));

create policy channel_members_select on public.channel_members for select to authenticated
  using (public.channel_visible(channel_id));
create policy channel_members_write on public.channel_members for all to authenticated
  using (public.channel_manager(channel_id) or user_id = auth.uid())
  with check (public.channel_manager(channel_id));

/*
 * Sharing. The `with check` is the line that stops BES letting itself in:
 * the caller must be a MANAGER OF THE CHANNEL, which requires organization
 * membership, which BES staff never have. `channel_manager()` cannot return
 * true for a BES account, so this policy cannot pass for one.
 */
create policy channel_shares_select on public.channel_shares for select to authenticated
  using (public.channel_visible(channel_id));
create policy channel_shares_insert on public.channel_shares for insert to authenticated
  with check (public.channel_manager(channel_id) and created_by = auth.uid());
create policy channel_shares_update on public.channel_shares for update to authenticated
  using (public.channel_manager(channel_id)) with check (public.channel_manager(channel_id));

create policy messages_select on public.messages for select to authenticated
  using (public.channel_visible(channel_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.channel_writable(channel_id) and author_id = auth.uid());
/* Edit your own words and nobody else's; a soft delete is the same act. */
create policy messages_update on public.messages for update to authenticated
  using (author_id = auth.uid() and public.channel_visible(channel_id))
  with check (author_id = auth.uid());

revoke all on public.channels, public.channel_members, public.channel_shares, public.messages from anon;
grant select, insert, update on public.channels to authenticated;
grant select, insert, update, delete on public.channel_members to authenticated;
grant select, insert, update on public.channel_shares to authenticated;
grant select, insert, update on public.messages to authenticated;
/* No delete grant on messages. History is not deleted (rule 11). */

-- ---------------------------------------------------------------------------
-- Mentions reuse the existing machinery rather than a second one.
-- ---------------------------------------------------------------------------
create or replace function public.notify_message_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_target uuid; v_org uuid; v_agency uuid; v_name text;
begin
  select c.organization_id, o.agency_id, c.name into v_org, v_agency, v_name
    from public.channels c join public.organizations o on o.id = c.organization_id
   where c.id = new.channel_id;

  foreach v_target in array public.mentioned_user_ids(new.body) loop
    continue when v_target = new.author_id;
    /* Named, but must still be able to READ the channel. Naming somebody does
       not admit them to it, and a mention is a poor way to leak a room. */
    if not exists (select 1 from public.channel_members m where m.channel_id = new.channel_id and m.user_id = v_target) then
      continue;
    end if;
    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    values (v_target, new.author_id, v_agency, v_org, 'mention', 'channel', new.channel_id::text,
            v_name, 'organization_internal', 'You were mentioned', left(new.body_text, 280))
    on conflict do nothing;
  end loop;
  return new;
end $$;
revoke all on function public.notify_message_mentions() from public, anon, authenticated;
create trigger messages_notify_mentions after insert on public.messages
  for each row execute function public.notify_message_mentions();

-- ---------------------------------------------------------------------------
-- Every organization gets one General channel (Dee, C4). Its owner is in it.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_general_channel(p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_owner uuid;
begin
  select id into v_id from public.channels
   where organization_id = p_org and kind = 'general' and archived_at is null;
  if v_id is not null then return v_id; end if;

  select user_id into v_owner from public.org_memberships
   where organization_id = p_org and role = 'org_admin' order by created_at limit 1;

  insert into public.channels (organization_id, kind, name, purpose, created_by)
  values (p_org, 'general', 'General Chat', 'Everyone in the company. Start here.', v_owner)
  returning id into v_id;

  insert into public.channel_members (channel_id, user_id, is_manager)
  select v_id, m.user_id, m.role = 'org_admin'
    from public.org_memberships m where m.organization_id = p_org
  on conflict do nothing;

  return v_id;
end $$;
revoke all on function public.ensure_general_channel(uuid) from public, anon;
grant execute on function public.ensure_general_channel(uuid) to authenticated;

/* New organizations get theirs automatically; existing ones get one now. */
create or replace function public.general_channel_on_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'org_admin' then
    perform public.ensure_general_channel(new.organization_id);
  else
    insert into public.channel_members (channel_id, user_id)
    select c.id, new.user_id from public.channels c
     where c.organization_id = new.organization_id and c.kind = 'general' and c.archived_at is null
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.general_channel_on_membership() from public, anon, authenticated;
create trigger org_memberships_general_channel after insert on public.org_memberships
  for each row execute function public.general_channel_on_membership();

select public.ensure_general_channel(o.id) from public.organizations o;
