-- Channel details: starring, notification level, and the panel that shows them.
--
-- Dee's reference puts a Channel details panel under the thread, carrying the
-- description, the members, who created it and when, a Notifications setting
-- and links.
--
-- Two of those did not exist. There is no favourites table and no per-channel
-- notification preference anywhere in the schema — so a star and a
-- "Notifications: All messages" row would have been controls that do nothing,
-- which CLAUDE.md forbids outright: no dead visible controls.
--
-- So they are built. Both are small, both are per-person, and the notification
-- level actually changes what is delivered rather than being a label.

-- ── Starring ───────────────────────────────────────────────────────────────

create table if not exists public.channel_favourites (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

comment on table public.channel_favourites is
  'Conversations a person has starred. Per-person and nothing more — starring is not membership and grants nothing.';

alter table public.channel_favourites enable row level security;

/* Yours alone: you see your stars, you set your stars. Nobody else's starring
   is anybody's business, and it confers no access — `channel_visible` still
   decides everything. */
create policy channel_favourites_select on public.channel_favourites
  for select using (user_id = auth.uid());
create policy channel_favourites_insert on public.channel_favourites
  for insert with check (user_id = auth.uid() and public.channel_visible(channel_id));
create policy channel_favourites_delete on public.channel_favourites
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.channel_favourites to authenticated;

create or replace function public.set_channel_favourite(p_channel uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  /* Starring a conversation you cannot open would put a row in your rail that
     opens onto nothing. */
  if not public.channel_visible(p_channel) then
    raise exception 'You are not in that conversation' using errcode = '42501';
  end if;

  if p_on then
    insert into public.channel_favourites (channel_id, user_id)
    values (p_channel, auth.uid())
    on conflict do nothing;
  else
    delete from public.channel_favourites
     where channel_id = p_channel and user_id = auth.uid();
  end if;
  return p_on;
end $$;

revoke all on function public.set_channel_favourite(uuid, boolean) from public, anon;
grant execute on function public.set_channel_favourite(uuid, boolean) to authenticated;

-- ── How much a conversation may interrupt you ──────────────────────────────

create table if not exists public.channel_notification_prefs (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  /* `all` every message · `mentions` only when named · `none` nothing */
  level      text not null default 'all',
  updated_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  constraint channel_notification_prefs_level_ck check (level in ('all', 'mentions', 'none'))
);

comment on table public.channel_notification_prefs is
  'How much one conversation may interrupt one person. Absent means `all`, which is what it has always been — the default is the old behaviour, so nothing changes for anybody who never touches it.';

alter table public.channel_notification_prefs enable row level security;

create policy channel_notification_prefs_select on public.channel_notification_prefs
  for select using (user_id = auth.uid());
create policy channel_notification_prefs_write on public.channel_notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.channel_notification_prefs to authenticated;

create or replace function public.set_channel_notifications(p_channel uuid, p_level text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_level not in ('all', 'mentions', 'none') then
    raise exception 'Choose all, mentions or none' using errcode = '22023';
  end if;
  if not public.channel_visible(p_channel) then
    raise exception 'You are not in that conversation' using errcode = '42501';
  end if;

  insert into public.channel_notification_prefs (channel_id, user_id, level, updated_at)
  values (p_channel, auth.uid(), p_level, now())
  on conflict (channel_id, user_id) do update
    set level = excluded.level, updated_at = now();
  return p_level;
end $$;

revoke all on function public.set_channel_notifications(uuid, text) from public, anon;
grant execute on function public.set_channel_notifications(uuid, text) to authenticated;

-- ── Two corrections to the notifier ───────────────────────────────────────
--
-- FIRST, A REGRESSION OF MINE. When 20260917007000 added group mentions I
-- rewrote `notify_message_recipients` from a partial read of it and silently
-- dropped its Direct messages branch. Since that migration a DM has produced
-- no notification at all unless it happened to contain an @. Nothing failed
-- and nothing was logged — the messages arrived, and nobody was told.
--
-- This is the second time today I have rewritten a function from a truncated
-- read and lost a branch; `suspend_partner` was the first. The lesson is the
-- same one and it is now written twice: read the whole thing, or change one
-- line of it.
--
-- SECOND, the new preference. `channel_notifiable` is left exactly as it is —
-- it answers CAN THIS PERSON BE REACHED HERE, which is the right question for
-- `channel_mentionable` and for @everyone's reach. Muting yourself should not
-- remove you from a mention list or from a count of who is in a conversation.
-- What it should do is stop the notification, so the check is here, where the
-- notification is written.

create or replace function public.notify_message_recipients()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ch       record;
  v_target   uuid;
  v_token    text;
  v_mentions uuid[] := public.mentioned_user_ids(new.body);
  v_groups   text[] := public.mentioned_group_targets(new.body);
  v_label    text;
begin
  select * into v_ch from public.channel_notice(new.channel_id);

  /* No agency, no notification — and above all, no failed INSERT. An AFTER
     INSERT trigger that raises takes the message with it (0174, 0196, 0206). */
  if v_ch.agency_id is null then
    return new;
  end if;

  /* What to call the conversation. The author for a direct one, because that
     is what the recipient recognises; the channel's own name otherwise. */
  if v_ch.is_direct then
    select coalesce(nullif(trim(p.full_name), ''), p.email, 'Someone')
      into v_label
      from public.profiles p where p.id = new.author_id;
  else
    v_label := v_ch.label;
  end if;

  /* A group mention is expanded into the same list the named ones go through,
     so one person named twice — once by name and once by team — is notified
     once, and every recipient passes the same gate. */
  foreach v_token in array v_groups loop
    v_mentions := array(
      select distinct u from unnest(
        v_mentions || array(select user_id from public.mention_group_recipients(new.channel_id, v_token))
      ) as u);
  end loop;

  /* ── Mentions ────────────────────────────────────────────────────────── */
  foreach v_target in array v_mentions loop
    continue when v_target = new.author_id;
    /* Named, but must still be able to reach the conversation. Naming
       somebody does not admit them to it (§27). */
    continue when not public.channel_notifiable(new.channel_id, v_target);
    /* And must not have silenced this conversation. `mentions` still gets
       this one — being named is the exception that setting is named for. */
    continue when coalesce((select level from public.channel_notification_prefs
                             where channel_id = new.channel_id and user_id = v_target), 'all') = 'none';

    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    values (v_target, new.author_id, v_ch.agency_id, v_ch.organization_id, 'mention',
            'channel', new.channel_id::text, v_label, v_ch.visibility,
            'You were mentioned in ' || v_label,
            left(coalesce(new.body_text, 'a message'), 160))
    on conflict do nothing;
  end loop;

  /* ── Direct messages ─────────────────────────────────────────────────
     RESTORED. A DM is addressed to a person, so it is told without an @.
     Members only, `channel_notifiable` re-checked so a conversation somebody
     has been removed from stops pinging them, and anybody already mentioned
     above is skipped rather than notified twice about one message. */
  if v_ch.is_direct then
    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    select m.user_id, new.author_id, v_ch.agency_id, v_ch.organization_id, 'dm',
           'channel', new.channel_id::text, v_label, v_ch.visibility,
           'New direct message', left(new.body_text, 280)
      from public.channel_members m
     where m.channel_id = new.channel_id
       and m.user_id <> new.author_id
       and not (m.user_id = any (coalesce(v_mentions, '{}'::uuid[])))
       and public.channel_notifiable(new.channel_id, m.user_id)
       /* Anything but every-message silences a DM that did not name you. */
       and coalesce((select level from public.channel_notification_prefs
                      where channel_id = new.channel_id and user_id = m.user_id), 'all') = 'all'
    on conflict do nothing;
  end if;

  return new;
end $$;

comment on function public.notify_message_recipients() is
  'Mentions, group mentions and direct messages, one trigger on `messages`. Respects each person''s notification level for this conversation: `mentions` still hears when named, `none` hears nothing.';

revoke execute on function public.notify_message_recipients() from public, anon, authenticated;

-- ── Everything the details panel shows, in one call ────────────────────────

create or replace function public.channel_details(p_channel uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'name', c.name,
    'purpose', c.purpose,
    'kind', c.kind::text,
    'open_to_scope', c.open_to_scope,
    'created_at', c.created_at,
    'created_by', (select coalesce(nullif(trim(p.full_name), ''), p.email)
                     from public.profiles p where p.id = c.created_by),
    'archived_at', c.archived_at,
    'favourite', exists (select 1 from public.channel_favourites f
                          where f.channel_id = c.id and f.user_id = auth.uid()),
    'notifications', coalesce((select level from public.channel_notification_prefs n
                                where n.channel_id = c.id and n.user_id = auth.uid()), 'all'),
    /* An open conversation has no member ROWS — everybody in scope is in it —
       so the count is of who can actually be reached, not of a table. */
    'member_count', (select count(*) from public.mention_group_recipients(c.id, 'channel')),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', m.name) order by m.name)
        from (select user_id, name from public.channel_mentionable(c.id)
               where user_id !~ '^(channel|team:)' limit 12) m
    ), '[]'::jsonb)
  )
    from public.channels c
   where c.id = p_channel
     and (public.channel_visible(c.id) or public.channel_auditable(c.id))
$$;

comment on function public.channel_details(uuid) is
  'What the Channel details panel shows, in one round trip. The member count is who can actually be reached, not how many rows a table has — an open conversation has none.';

revoke all on function public.channel_details(uuid) from public, anon;
grant execute on function public.channel_details(uuid) to authenticated;
