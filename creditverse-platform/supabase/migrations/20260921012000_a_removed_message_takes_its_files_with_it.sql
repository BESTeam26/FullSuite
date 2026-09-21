-- P-049: deleting a message left its attachments on screen.
--
-- Jet posted the wrong screenshot — a client's IdentityIQ dashboard, scores
-- and all — deleted it, and the image stayed under the tombstone. "This
-- message was removed", with the picture still there.
--
-- The three readers that serve a message aggregated its files without asking
-- whether the message still existed. The rule was already written one line
-- below, for mentions: "a removed message should not still be telling
-- somebody they were named in it". The same is true of what it showed.
--
-- The Files tab (`channel_files`) and the counts (`channel_details`) already
-- excluded deleted messages, so this is the last path that served them.
--
-- The stored object itself stays in the bucket: Supabase refuses storage
-- deletes from SQL, and nothing in the application can produce a URL for a
-- row no reader returns. Purging the objects of removed messages is a
-- Storage-API sweep, recorded in the backlog rather than pretended here.
--
-- Generated from the live definitions; one block replaced in each.

CREATE OR REPLACE FUNCTION public.channel_messages(p_channel uuid, p_limit integer DEFAULT 60)
 RETURNS TABLE(id bigint, channel_id uuid, author_id uuid, author_name text, author_is_bes boolean, body_text text, created_at timestamp with time zone, edited_at timestamp with time zone, deleted boolean, message_type text, announcement_id uuid, announcement_title text, announcement_body text, announcement_published_at timestamp with time zone, parent_message_id bigint, reply_to_id bigint, reply_to_text text, reply_to_author text, reply_count integer, last_reply_at timestamp with time zone, reply_participants jsonb, pinned boolean, reactions jsonb, attachments jsonb, mentions jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    /* Withheld on a tombstone, exactly as the body and the mentions are.
       Removing a message left its files on screen — Jet Manugas posted a
       client's credit report by mistake on 2026-09-21, deleted it, and the
       screenshot stayed (P-049). A removal that leaves the picture is not a
       removal. */
    case when m.deleted_at is null then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path,
                                          'mime', f.mime_type, 'size', f.size_bytes))
        from public.files f
       where f.entity_type = 'channel_message' and f.entity_id = m.id::text
    ), '[]'::jsonb) else '[]'::jsonb end,
    /* Withheld on a tombstone along with the body: a removed message should
       not still be telling somebody they were named in it. */
    case when m.deleted_at is null then public.message_mentions(m.body) else '[]'::jsonb end
  from base m
  left join public.profiles pr on pr.id = m.author_id
  left join public.announcements an on an.id = m.announcement_id
  order by m.created_at
$function$;

CREATE OR REPLACE FUNCTION public.thread_messages(p_root bigint)
 RETURNS TABLE(id bigint, author_id uuid, author_name text, author_is_bes boolean, body_text text, created_at timestamp with time zone, edited_at timestamp with time zone, deleted boolean, reactions jsonb, attachments jsonb, mentions jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select m.id, m.author_id, coalesce(nullif(trim(pr.full_name), ''), pr.email), m.author_is_bes,
         case when m.deleted_at is null then m.body_text end,
         m.created_at, m.edited_at, m.deleted_at is not null,
         coalesce((
           select jsonb_agg(x order by x->>'emoji') from (
             select jsonb_build_object('emoji', rx.emoji, 'count', count(*)::int,
                                       'mine', bool_or(rx.user_id = auth.uid())) as x
               from public.message_reactions rx where rx.message_id = m.id group by rx.emoji) r
         ), '[]'::jsonb),
         /* Withheld on a tombstone, exactly as the body and the mentions are.
            Removing a message left its files on screen — Jet Manugas posted a
            client's credit report by mistake on 2026-09-21, deleted it, and the
            screenshot stayed (P-049). A removal that leaves the picture is not a
            removal. */
         case when m.deleted_at is null then coalesce((
           select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path,
                                               'mime', f.mime_type, 'size', f.size_bytes))
             from public.files f
            where f.entity_type = 'channel_message' and f.entity_id = m.id::text
         ), '[]'::jsonb) else '[]'::jsonb end,
         case when m.deleted_at is null then public.message_mentions(m.body) else '[]'::jsonb end
    from public.messages m
    left join public.profiles pr on pr.id = m.author_id
   where m.parent_message_id = p_root
   order by m.created_at
$function$;

CREATE OR REPLACE FUNCTION public.channel_message_by_id(p_id bigint)
 RETURNS TABLE(id bigint, channel_id uuid, author_id uuid, author_name text, author_is_bes boolean, body_text text, created_at timestamp with time zone, edited_at timestamp with time zone, deleted boolean, message_type text, announcement_id uuid, announcement_title text, announcement_body text, announcement_published_at timestamp with time zone, parent_message_id bigint, reply_to_id bigint, reply_to_text text, reply_to_author text, reply_count integer, last_reply_at timestamp with time zone, pinned boolean, reactions jsonb, attachments jsonb, mentions jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    /* Withheld on a tombstone, exactly as the body and the mentions are.
       Removing a message left its files on screen — Jet Manugas posted a
       client's credit report by mistake on 2026-09-21, deleted it, and the
       screenshot stayed (P-049). A removal that leaves the picture is not a
       removal. */
    case when m.deleted_at is null then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path,
                                          'mime', f.mime_type, 'size', f.size_bytes))
        from public.files f
       where f.entity_type = 'channel_message' and f.entity_id = m.id::text
    ), '[]'::jsonb) else '[]'::jsonb end,
    case when m.deleted_at is null then public.message_mentions(m.body) else '[]'::jsonb end
  from public.messages m
  left join public.profiles pr on pr.id = m.author_id
  left join public.announcements an on an.id = m.announcement_id
 where m.id = p_id
$function$;
