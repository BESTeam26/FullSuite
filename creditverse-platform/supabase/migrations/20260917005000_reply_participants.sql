-- Who replied, not just how many.
--
-- Dee's reference shows a thread indicator with the repliers' faces on it:
--
--     [avatar][avatar]  2 replies · last reply 10:15 AM
--
-- `channel_messages` returned a count and a timestamp and nothing about the
-- people, so the indicator could only ever be text. The faces are the part
-- that tells you at a glance whether a conversation you care about is one you
-- are in.
--
-- Bounded to five, deduplicated, most recent replier first — the same shape
-- the rail already uses for members, and small enough that it costs nothing
-- to carry on every row.

/* Adding a column to a set-returning function means replacing it, not
   amending it — Postgres will not change the row type of an existing one.
   Nothing but the client reads it, and both change in the same push. */
drop function if exists public.channel_messages(uuid, integer);

create function public.channel_messages(p_channel uuid, p_limit integer default 60)
returns table (
  id bigint, channel_id uuid, author_id uuid, author_name text, author_is_bes boolean,
  body_text text, created_at timestamptz, edited_at timestamptz, deleted boolean,
  message_type text, announcement_id uuid, announcement_title text,
  announcement_body text, announcement_published_at timestamptz,
  parent_message_id bigint, reply_to_id bigint, reply_to_text text, reply_to_author text,
  reply_count integer, last_reply_at timestamptz, reply_participants jsonb,
  pinned boolean, reactions jsonb, attachments jsonb, mentions jsonb)
language sql
stable
set search_path to 'public'
as $$
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
    /* The faces on the indicator. Distinct people, most recent first, five at
       most — after that a row of avatars stops being information. */
    coalesce((
      select jsonb_agg(jsonb_build_object('id', t.author_id, 'name', t.who) order by t.recent desc)
        from (
          select r.author_id,
                 coalesce(nullif(trim(rp.full_name), ''), rp.email) as who,
                 max(r.created_at) as recent
            from public.messages r
            join public.profiles rp on rp.id = r.author_id
           where r.parent_message_id = m.id and r.deleted_at is null
           group by r.author_id, rp.full_name, rp.email
           order by max(r.created_at) desc
           limit 5
        ) t
    ), '[]'::jsonb),
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
$$;

revoke execute on function public.channel_messages(uuid, integer) from public, anon;
grant execute on function public.channel_messages(uuid, integer) to authenticated;

-- ── Everything the channel's tabs need, in one query ──────────────────────
--
-- The reference header carries Messages · Files · Pins · Members with counts.
-- Three of those counts are separate questions, and asking them one screen at
-- a time is the waterfall rule 14 names. One call, one row.

create or replace function public.channel_tab_counts(p_channel uuid)
returns table (files integer, pins integer, members integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (select count(*)::int from public.files f
      join public.messages m on m.channel_id = p_channel
       and f.entity_type = 'channel_message' and f.entity_id = m.id::text
     where m.deleted_at is null),
    (select count(*)::int from public.message_pins p
      join public.messages m on m.id = p.message_id
     where m.channel_id = p_channel and m.deleted_at is null),
    (select count(*)::int from public.channel_members cm where cm.channel_id = p_channel)
   where public.channel_visible(p_channel) or public.channel_auditable(p_channel)
$$;

comment on function public.channel_tab_counts(uuid) is
  'Files, pins and members for one conversation, in one round trip. Returns no row at all when the caller cannot see the conversation — the counts are about content they would not be shown.';

revoke all on function public.channel_tab_counts(uuid) from public, anon;
grant execute on function public.channel_tab_counts(uuid) to authenticated;

-- ── The files shared in a conversation ────────────────────────────────────

create or replace function public.channel_files(p_channel uuid, p_limit integer default 100)
returns table (
  id uuid, name text, path text, mime_type text, size_bytes bigint,
  message_id bigint, author_name text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.id, f.name, f.path, f.mime_type, f.size_bytes, m.id,
         coalesce(nullif(trim(pr.full_name), ''), pr.email), f.created_at
    from public.files f
    join public.messages m on f.entity_type = 'channel_message' and f.entity_id = m.id::text
    left join public.profiles pr on pr.id = m.author_id
   where m.channel_id = p_channel
     and m.deleted_at is null
     /* The conversation's own rule decides. A file shared into a channel is
        readable by whoever may read the channel, and by nobody else. */
     and (public.channel_visible(p_channel) or public.channel_auditable(p_channel))
   order by f.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

comment on function public.channel_files(uuid, integer) is
  'Every file shared in a conversation, newest first. Gated on the conversation, because a file shared into it is exactly as readable as the message that carried it.';

revoke all on function public.channel_files(uuid, integer) from public, anon;
grant execute on function public.channel_files(uuid, integer) to authenticated;
