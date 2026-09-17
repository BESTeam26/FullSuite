-- One call when a conversation opens, not two.
--
-- Dee, 2026-09-17: "make sure we have running this communication as fast as we
-- can, no delays."
--
-- `channel_details` and `channel_tab_counts` are both per-conversation, both
-- fetched the moment one is opened, and both cheap — which is exactly the
-- shape rule 14 says to merge rather than pay twice for. They also disagreed
-- about one number: the tab counted `channel_members` rows while the details
-- counted who can actually be REACHED, so an open conversation showed
-- "Members 0" on the tab and "Members 10" in the panel.
--
-- One function, one answer.

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
    /* The tab strip's numbers, from the same call — and the member count is
       who can be reached, which is what the panel has always said. An open
       conversation has no member ROWS, so counting the table told the tab
       there was nobody in a conversation with ten people in it. */
    'files', (select count(*)::int from public.files f
               join public.messages m on m.channel_id = c.id
                and f.entity_type = 'channel_message' and f.entity_id = m.id::text
              where m.deleted_at is null),
    'pins', (select count(*)::int from public.message_pins mp
              join public.messages m on m.id = mp.message_id
             where m.channel_id = c.id and m.deleted_at is null),
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
  'Everything a conversation''s header, tabs and details panel need, in ONE round trip. The member count is who can be reached, not how many rows a table has.';

revoke all on function public.channel_details(uuid) from public, anon;
grant execute on function public.channel_details(uuid) to authenticated;

/* Superseded: its three numbers are in `channel_details`, and having two
   functions answer "how many members" is how they came to disagree. */
drop function if exists public.channel_tab_counts(uuid);
