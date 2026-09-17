-- "MEMBERS · 1" above "Nobody yet."
--
-- Found opening one of the new team rooms: the details panel counted one
-- person and then listed none of them. Both numbers were right about
-- different questions, which is the same shape as the "Members 0 / Members
-- 10" disagreement the previous migration merged away — and it survived
-- because only the COUNT moved, not the list beside it.
--
-- The count is `mention_group_recipients(channel)` — who can be reached here.
-- The list was `channel_mentionable`, which is the MENTION PICKER, and a
-- mention picker deliberately leaves you out: `p.id <> auth.uid()`, because
-- you cannot @ yourself. In a busy channel that is an off-by-one nobody
-- notices. In a room where you are the only person so far, it reads as a
-- contradiction on the screen.
--
-- `channel_mentionable` is right as it stands; it is the wrong source for
-- "who is in this conversation". Both now come from the same function, so
-- they cannot drift apart again.

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
    /* Which clock every timestamp below the header is read in. */
    'timezone', public.channel_timezone(c.id),
    'files', (select count(*)::int from public.files f
               join public.messages m on m.channel_id = c.id
                and f.entity_type = 'channel_message' and f.entity_id = m.id::text
              where m.deleted_at is null),
    'pins', (select count(*)::int from public.message_pins mp
              join public.messages m on m.id = mp.message_id
             where m.channel_id = c.id and m.deleted_at is null),
    'member_count', (select count(*) from public.mention_group_recipients(c.id, 'channel')),
    /* The SAME source as the count, so the list can never disagree with the
       number above it — including you, because you are in the room. */
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.name)
        from (select p.id::text as id,
                     coalesce(nullif(trim(p.full_name), ''), p.email) as name
                from public.mention_group_recipients(c.id, 'channel') r
                join public.profiles p on p.id = r.user_id
               order by 2 limit 12) m
    ), '[]'::jsonb)
  )
    from public.channels c
   where c.id = p_channel
     and (public.channel_visible(c.id) or public.channel_auditable(c.id))
$$;

comment on function public.channel_details(uuid) is
  'Everything a conversation''s header, tabs, details panel and timestamps need, in ONE round trip. The member count and the member list come from the same function, so they cannot disagree.';

revoke all on function public.channel_details(uuid) from public, anon;
grant execute on function public.channel_details(uuid) to authenticated;
