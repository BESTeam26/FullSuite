-- 0208 — A message comes back knowing who it named.
--
-- ---------------------------------------------------------------------------
-- WHY THE READ PATH NEEDS THIS
--
-- `channel_messages()` returned `body_text`, in which a mention is the
-- characters "@Rowell" and nothing more. The interface could print it, and
-- that is where it stopped: no emphasis, and no way to tell the person being
-- addressed that they were the one addressed.
--
-- Dee, §27: a mention creates "notification/unread emphasis". Emphasis needs
-- to know which run of characters is the mention and who it points at, and
-- guessing that by searching the text for every colleague's name is how you
-- end up highlighting the word "Mark" in "mark it done".
--
-- So the nodes are read where they already live — in `body` — and returned
-- beside the text. `body` itself is deliberately NOT returned: it is the
-- authoring format, the interface has no use for it, and a column nobody
-- needs is a column that grows.
--
-- Labels come from the document rather than from `profiles`, so a message
-- reads as it was written. Somebody who changes their display name does not
-- retroactively change what a colleague appears to have typed last March —
-- the same reasoning as `author_is_bes` being stamped at write time.
-- ---------------------------------------------------------------------------

create or replace function public.message_mentions(p_body jsonb)
returns jsonb
language sql immutable set search_path = public as $function$
  with recursive nodes(node) as (
    select p_body
    union all
    select child
      from nodes,
           lateral jsonb_array_elements(
             case when jsonb_typeof(nodes.node -> 'content') = 'array'
                  then nodes.node -> 'content' else '[]'::jsonb end
           ) as child
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('userId', id, 'label', label)), '[]'::jsonb)
    from (
      select node -> 'attrs' ->> 'userId' as id,
             node -> 'attrs' ->> 'label'  as label
        from nodes
       where node ->> 'type' = 'mention'
         and node -> 'attrs' ->> 'userId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         and length(trim(coalesce(node -> 'attrs' ->> 'label', ''))) > 0
    ) found
$function$;
revoke execute on function public.message_mentions(jsonb) from public, anon;
grant execute on function public.message_mentions(jsonb) to authenticated;

comment on function public.message_mentions(jsonb) is
  'The people a message named, with the labels the author saw when they wrote it. Read from the document, never re-derived from profiles — a message should read as it was written (0208).';

drop function if exists public.channel_messages(uuid, integer);
create or replace function public.channel_messages(p_channel uuid, p_limit integer default 60)
returns table (
  id bigint, channel_id uuid, author_id uuid, author_name text, author_is_bes boolean,
  body_text text, created_at timestamptz, edited_at timestamptz, deleted boolean,
  message_type text, announcement_id uuid, announcement_title text,
  announcement_body text, announcement_published_at timestamptz,
  parent_message_id bigint, reply_to_id bigint,
  reply_to_text text, reply_to_author text, reply_count integer, last_reply_at timestamptz,
  pinned boolean, reactions jsonb, attachments jsonb, mentions jsonb
)
language sql stable security invoker set search_path = public as $function$
  with base as (
    select m.* from public.messages m
     where m.channel_id = p_channel and m.parent_message_id is null
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 60), 1), 200)
  )
  select
    m.id, m.channel_id, m.author_id,
    coalesce(nullif(trim(pr.full_name), ''), pr.email), m.author_is_bes,
    case when m.deleted_at is null then m.body_text end,
    m.created_at, m.edited_at, m.deleted_at is not null,
    m.message_type, m.announcement_id, an.title, an.body, an.published_at,
    m.parent_message_id, m.reply_to_id,
    (select case when q.deleted_at is null then left(q.body_text, 160) end
       from public.messages q where q.id = m.reply_to_id),
    (select coalesce(nullif(trim(qp.full_name), ''), qp.email)
       from public.messages q join public.profiles qp on qp.id = q.author_id
      where q.id = m.reply_to_id),
    (select count(*)::int from public.messages r
      where r.parent_message_id = m.id and r.deleted_at is null),
    (select max(r.created_at) from public.messages r where r.parent_message_id = m.id),
    exists (select 1 from public.message_pins p where p.message_id = m.id),
    coalesce((
      select jsonb_agg(x order by x->>'emoji') from (
        select jsonb_build_object('emoji', rx.emoji, 'count', count(*)::int,
                                  'mine', bool_or(rx.user_id = auth.uid())) as x
          from public.message_reactions rx where rx.message_id = m.id group by rx.emoji) r
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path,
                                          'mime', f.mime_type, 'size', f.size_bytes))
        from public.files f
       where f.entity_type = 'channel_message' and f.entity_id = m.id::text
    ), '[]'::jsonb),
    /* Withheld on a tombstone along with the body: a removed message should
       not still be telling somebody they were named in it. */
    case when m.deleted_at is null then public.message_mentions(m.body) else '[]'::jsonb end
  from base m
  left join public.profiles pr on pr.id = m.author_id
  left join public.announcements an on an.id = m.announcement_id
  order by m.created_at
$function$;
revoke execute on function public.channel_messages(uuid, integer) from public, anon;
grant execute on function public.channel_messages(uuid, integer) to authenticated;

drop function if exists public.thread_messages(bigint);
create or replace function public.thread_messages(p_root bigint)
returns table (
  id bigint, author_id uuid, author_name text, author_is_bes boolean,
  body_text text, created_at timestamptz, edited_at timestamptz, deleted boolean,
  reactions jsonb, attachments jsonb, mentions jsonb
)
language sql stable security invoker set search_path = public as $function$
  select m.id, m.author_id, coalesce(nullif(trim(pr.full_name), ''), pr.email), m.author_is_bes,
         case when m.deleted_at is null then m.body_text end,
         m.created_at, m.edited_at, m.deleted_at is not null,
         coalesce((
           select jsonb_agg(x order by x->>'emoji') from (
             select jsonb_build_object('emoji', rx.emoji, 'count', count(*)::int,
                                       'mine', bool_or(rx.user_id = auth.uid())) as x
               from public.message_reactions rx where rx.message_id = m.id group by rx.emoji) r
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path,
                                               'mime', f.mime_type, 'size', f.size_bytes))
             from public.files f
            where f.entity_type = 'channel_message' and f.entity_id = m.id::text
         ), '[]'::jsonb),
         case when m.deleted_at is null then public.message_mentions(m.body) else '[]'::jsonb end
    from public.messages m
    left join public.profiles pr on pr.id = m.author_id
   where m.parent_message_id = p_root
   order by m.created_at
$function$;
revoke execute on function public.thread_messages(bigint) from public, anon;
grant execute on function public.thread_messages(bigint) to authenticated;
