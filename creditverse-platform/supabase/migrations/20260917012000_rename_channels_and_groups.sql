-- Renaming a channel or a group chat — and never a direct message.
--
-- Dee, 2026-09-17: "I should be able to rename all the channels and group chat
-- names. Just not the DMs."
--
-- ── WHY A DM CANNOT BE RENAMED ────────────────────────────────────────────
--
-- A direct message has no name that is right for both people in it. Each side
-- is shown the OTHER one — that is how `visible_channels` has always built it.
-- Letting somebody name it would mean either renaming it for both (so one of
-- them sees a label the other chose for a conversation about themselves) or
-- storing two names for one row. Neither is worth having.
--
-- A GROUP chat is different, and that is the distinction Dee drew. Once there
-- are three people, "Rowell, Allyssa, James" is a description rather than a
-- name, and the people in it may well have a better one.
--
-- ── NAMED, OR DERIVED ─────────────────────────────────────────────────────
--
-- `channels.name` holds a placeholder for a direct conversation — literally
-- 'Direct message' or 'Group message' — and the display name is derived from
-- the members. So a renamed group chat needs a way to say "this one really was
-- named", and comparing against those two strings would be a magic-string test
-- that breaks the day somebody types "Group message" as a real name.
--
-- Hence `named_at`: null means derive, set means a person chose this.

alter table public.channels add column if not exists named_at timestamptz;

comment on column public.channels.named_at is
  'When a person last chose this conversation''s name. Null on a direct conversation means the name is derived from who is in it; set means somebody named it. Never set on a two-person DM.';

-- ── The rule, in one place ─────────────────────────────────────────────────

create or replace function public.rename_channel(p_channel uuid, p_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c       public.channels%rowtype;
  v_name  text := btrim(coalesce(p_name, ''));
  v_people int;
begin
  select * into c from public.channels where id = p_channel;
  if c.id is null then
    raise exception 'That conversation does not exist' using errcode = '22023';
  end if;
  if not public.channel_visible(p_channel) then
    raise exception 'You are not in that conversation' using errcode = '42501';
  end if;
  if c.archived_at is not null then
    raise exception 'That conversation is archived' using errcode = '22023';
  end if;

  if length(v_name) < 1 then
    raise exception 'A name cannot be empty' using errcode = '22023';
  end if;
  if length(v_name) > 80 then
    raise exception 'That name is too long — 80 characters at most' using errcode = '22023';
  end if;

  if c.kind = 'direct' then
    select count(*) into v_people from public.channel_members m where m.channel_id = c.id;
    /* Two people. There is no name that is right for both of them. */
    if v_people <= 2 then
      raise exception 'A direct message is named after the person you are talking to'
        using errcode = '22023';
    end if;
    /* A group chat belongs to the people in it. There is no administrator of
       a conversation you were all in from the start, so any member may name
       it — `channel_visible` above already established membership. */
  else
    /* A channel is a place somebody administers, so naming it is theirs. */
    if not public.channel_manager(p_channel) then
      raise exception 'Only a manager of this channel can rename it' using errcode = '42501';
    end if;
  end if;

  update public.channels
     set name = v_name, named_at = now()
   where id = p_channel;

  perform public.log_audit('channel.renamed', 'channel', p_channel::text, null,
    jsonb_build_object('name', c.name),
    jsonb_build_object('name', v_name, 'kind', c.kind::text));

  return v_name;
end $$;

comment on function public.rename_channel(uuid, text) is
  'Renames a channel (managers) or a group chat (any member). Refuses a two-person direct message: it has no name that is right for both people, which is why each side is shown the other.';

revoke all on function public.rename_channel(uuid, text) from public, anon;
grant execute on function public.rename_channel(uuid, text) to authenticated;

/* The function is the door, and a raw UPDATE must not be a second one.
   `channels_update` is gated on `channel_manager`, and both people in a DM are
   managers of it — so without this a DM could be renamed by going round the
   function, and the rule would live only in code nobody has to call. */
create or replace function public.channels_guard_name()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.name is distinct from old.name
     and old.kind = 'direct'
     and (select count(*) from public.channel_members m where m.channel_id = old.id) <= 2 then
    raise exception 'A direct message is named after the person you are talking to'
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists channels_guard_name on public.channels;
create trigger channels_guard_name
  before update on public.channels
  for each row execute function public.channels_guard_name();

-- ── A named group chat shows its name ──────────────────────────────────────

/* A new column means a new row type, which Postgres will not replace. */
drop function if exists public.visible_channels();

create function public.visible_channels()
returns table (
  id uuid, organization_id uuid, agency_id uuid, partner_group_id uuid,
  partner_service_id uuid, partner_topic text, organization_name text,
  partner_name text, service_name text, kind text, name text, display_name text,
  direct_user_id uuid, purpose text, open_to_scope boolean,
  archived_at timestamptz, shared_with_bes boolean, audit_only boolean,
  is_manager boolean, favourite boolean, can_rename boolean,
  unread integer, last_message_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id, c.organization_id, c.agency_id, c.partner_group_id, c.partner_service_id,
    c.partner_topic,
    o.name, g.name, ps.name, c.kind::text, c.name,
    /* A direct conversation that somebody NAMED shows that name. One that
       nobody named is described by who is in it — each person shown the
       OTHERS, first names, up to three then "+2". */
    case
      when c.kind = 'direct' and c.named_at is not null then c.name
      when c.kind = 'direct' then coalesce((
        select case
          when count(*) = 0 then c.name
          when count(*) <= 3 then string_agg(who, ', ' order by who)
          else string_agg(who, ', ' order by who)
                 filter (where rn <= 3) || ' +' || (count(*) - 3)
        end
          from (
            select split_part(coalesce(nullif(trim(pr.full_name), ''), pr.email), ' ', 1) as who,
                   row_number() over (order by coalesce(nullif(trim(pr.full_name), ''), pr.email)) as rn
              from public.channel_members dm
              join public.profiles pr on pr.id = dm.user_id
             where dm.channel_id = c.id and dm.user_id <> auth.uid()
          ) others
      ), c.name)
      else c.name
    end,
    /* Only meaningful when there is exactly ONE other person — it is what the
       rail hangs an avatar on, and a group has no single face. */
    case when c.kind = 'direct' then (
      select case when array_length(ids, 1) = 1 then ids[1] end
        from (select array_agg(dm.user_id) as ids
                from public.channel_members dm
               where dm.channel_id = c.id and dm.user_id <> auth.uid()) one
    ) end,
    c.purpose, c.open_to_scope, c.archived_at,
    exists (select 1 from public.channel_shares s
             where s.channel_id = c.id and s.revoked_at is null),
    not public.channel_visible(c.id),
    public.channel_manager(c.id),
    exists (select 1 from public.channel_favourites f
             where f.channel_id = c.id and f.user_id = auth.uid()),
    /* Offered exactly where `rename_channel` would allow it: a group chat to
       any member, a channel to its managers, a DM to nobody. */
    c.archived_at is null and (
      case when c.kind = 'direct'
           then (select count(*) from public.channel_members m where m.channel_id = c.id) > 2
           else public.channel_manager(c.id) end),
    (select count(*)::int from public.messages m
      where m.channel_id = c.id and m.deleted_at is null
        and m.author_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.channel_reads r
            where r.channel_id = c.id and r.user_id = auth.uid()),
          '-infinity'::timestamptz)),
    (select max(m.created_at) from public.messages m
      where m.channel_id = c.id and m.deleted_at is null)
    from public.channels c
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.partner_group_id
    left join public.partner_services ps on ps.id = c.partner_service_id
   where public.channel_visible(c.id) or public.channel_auditable(c.id)
$$;

revoke all on function public.visible_channels() from public, anon;
grant execute on function public.visible_channels() to authenticated;

/* The details panel asks the same question, so the two cannot disagree. */
create or replace function public.channel_details(p_channel uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'name', case
      when c.kind = 'direct' and c.named_at is null then null
      else c.name end,
    'purpose', c.purpose,
    'kind', c.kind::text,
    'open_to_scope', c.open_to_scope,
    'created_at', c.created_at,
    'created_by', (select coalesce(nullif(trim(p.full_name), ''), p.email)
                     from public.profiles p where p.id = c.created_by),
    'archived_at', c.archived_at,
    'can_rename', c.archived_at is null and (
      case when c.kind = 'direct'
           then (select count(*) from public.channel_members m where m.channel_id = c.id) > 2
           else public.channel_manager(c.id) end),
    'favourite', exists (select 1 from public.channel_favourites f
                          where f.channel_id = c.id and f.user_id = auth.uid()),
    'notifications', coalesce((select level from public.channel_notification_prefs n
                                where n.channel_id = c.id and n.user_id = auth.uid()), 'all'),
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

revoke all on function public.channel_details(uuid) from public, anon;
grant execute on function public.channel_details(uuid) to authenticated;
