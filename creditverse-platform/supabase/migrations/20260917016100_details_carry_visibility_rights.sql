-- The details panel needs to know whether the switch is offered, and why not.
--
-- Three different answers, and a control that guesses at them is a control
-- that either hides itself from somebody who may act or offers an action the
-- database will refuse:
--
--   can_set_visibility  a manager, and not a direct message or group chat
--   is_default          a default channel, which may never be made private
--   is_manager          already implied by can_rename on a channel, but NOT on
--                       a group chat, where can_rename means "more than two
--                       people are in it" — so it cannot stand in for this.
--
-- Same call as everything else the panel shows: one round trip per
-- conversation, still (rule 14).

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
    /* A group chat has no audience to open: it IS its people. */
    'can_set_visibility', c.archived_at is null and c.kind <> 'direct'
                          and public.channel_manager(c.id),
    'is_default', c.system_key is not null,
    'favourite', exists (select 1 from public.channel_favourites f
                          where f.channel_id = c.id and f.user_id = auth.uid()),
    'notifications', coalesce((select level from public.channel_notification_prefs n
                                where n.channel_id = c.id and n.user_id = auth.uid()), 'all'),
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

revoke all on function public.channel_details(uuid) from public, anon;
grant execute on function public.channel_details(uuid) to authenticated;
