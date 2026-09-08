-- 0200 — An announcement appears in Communication. Once, and by reference.
--
-- ---------------------------------------------------------------------------
-- WHAT DEE ASKED FOR (§10–§15)
--
--   "Do NOT require Dee to: create Announcement, then copy it, then paste it
--    into Communication. That is exactly the manual duplication we are
--    eliminating."
--
-- And the two constraints that make it safe rather than merely convenient:
--
--   §12  "Do not maintain an independently editable copied version of the
--         Announcement body. The Communication item should render from /
--         reference the canonical Announcement."
--
--   §15  "Do NOT broaden a targeted Announcement simply because Announcements
--         and Updates is visible to all BES staff... A user who is not
--         authorized must not receive its title, body, snippet, search
--         result, notification or message card. Do not solve this only in
--         React."
--
-- ---------------------------------------------------------------------------
-- HOW BOTH ARE KEPT AT ONCE
--
-- The message row carries an `announcement_id` and NO CONTENT. Its `body_text`
-- is the literal word "Announcement" — not the title, not a summary. That one
-- decision satisfies both sections:
--
--   §12, because there is nothing to edit independently. An edited
--        announcement changes what the card renders, immediately, because the
--        card was never a copy.
--
--   §15, because `search_messages` searches `body_text`, and `body_text`
--        contains no announcement content. A targeted announcement cannot leak
--        a snippet through message search, and the card's own title and body
--        come from a join that `announcements_select` filters. Somebody not
--        authorized sees an unavailable card, not a redacted one.
--
-- Announcement targeting beyond `bes_internal` does not exist today, so
-- nothing can leak today. This is built so that when Dee adds team or
-- department targeting, the leak does not appear along with it.
-- ---------------------------------------------------------------------------

/* §13. One announcement, one card, whatever retries. */
create unique index if not exists messages_announcement_idx
  on public.messages (announcement_id, channel_id) where announcement_id is not null;

create or replace function public.post_announcement_to_communication()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_channel uuid;
  v_author  uuid;
begin
  /* Only BES-internal announcements, and only once published. A draft is not
     an announcement yet. */
  if new.audience <> 'bes_internal' or new.published_at is null then
    return new;
  end if;

  /* On an edit there is nothing to post: the card already renders from this
     row, so it is already correct (§14). */
  if tg_op = 'UPDATE' and old.published_at is not null then
    return new;
  end if;

  select c.id into v_channel
    from public.channels c
    join public.agencies a on a.id = c.agency_id
   where c.system_key = 'announcements_updates'
   order by c.created_at
   limit 1;
  if v_channel is null then
    /* No channel to post into is not a reason to refuse the announcement.
       The announcement is the canonical record; the card is a surface. */
    return new;
  end if;

  select coalesce(new.created_by,
                  (select user_id from public.agency_memberships
                    where role = 'agency_owner' and status = 'active'
                    order by created_at limit 1))
    into v_author;
  if v_author is null then
    return new;
  end if;

  insert into public.messages (channel_id, author_id, body, body_text,
                               message_type, announcement_id)
  values (v_channel, v_author, '{}'::jsonb, 'Announcement', 'announcement', new.id)
  on conflict do nothing;

  return new;
end;
$function$;

drop trigger if exists announcements_to_communication on public.announcements;
create trigger announcements_to_communication
  after insert or update of published_at, audience on public.announcements
  for each row execute function public.post_announcement_to_communication();

comment on function public.post_announcement_to_communication() is
  'Posts a REFERENCE, never a copy. The card holds no title and no body, so an edited announcement is already correct and a targeted one cannot leak a snippet through message search (Dee, §12, §14, §15).';

-- ── The card's content comes from the announcement, through its own RLS ─
--
-- `channel_messages` is SECURITY INVOKER, so this LEFT JOIN is filtered by
-- `announcements_select` for the caller. Somebody not authorized for an
-- announcement gets NULL title and NULL body and the interface renders "not
-- available to you" — it does not receive the content and hide it.
--
-- Dropped and recreated rather than replaced: `create or replace` cannot widen
-- a function's OUT parameters, and 0199 shipped this one three columns
-- narrower. Postgres says so with 42P13, which is how this line got here.
drop function if exists public.channel_messages(uuid, integer);
create or replace function public.channel_messages(p_channel uuid, p_limit integer default 60)
returns table (
  id bigint, channel_id uuid, author_id uuid, author_name text, author_is_bes boolean,
  body_text text, created_at timestamptz, edited_at timestamptz, deleted boolean,
  message_type text, announcement_id uuid, announcement_title text,
  announcement_body text, announcement_published_at timestamptz,
  parent_message_id bigint, reply_to_id bigint,
  reply_to_text text, reply_to_author text, reply_count integer, last_reply_at timestamptz,
  pinned boolean, reactions jsonb, attachments jsonb
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
    ), '[]'::jsonb)
  from base m
  left join public.profiles pr on pr.id = m.author_id
  left join public.announcements an on an.id = m.announcement_id
  order by m.created_at
$function$;
revoke execute on function public.channel_messages(uuid, integer) from public, anon;
grant execute on function public.channel_messages(uuid, integer) to authenticated;

/* Backfill: every BES-internal announcement already published gets its card,
   once. `on conflict do nothing` makes a second run of this migration a no-op. */
insert into public.messages (channel_id, author_id, body, body_text, message_type, announcement_id, created_at)
select c.id,
       coalesce(a.created_by, (select user_id from public.agency_memberships
                                where role = 'agency_owner' and status = 'active'
                                order by created_at limit 1)),
       '{}'::jsonb, 'Announcement', 'announcement', a.id, a.published_at
  from public.announcements a
  cross join lateral (select id from public.channels
                       where system_key = 'announcements_updates' order by created_at limit 1) c
 where a.audience = 'bes_internal' and a.published_at is not null and a.archived_at is null
   and coalesce(a.created_by, (select user_id from public.agency_memberships
                                where role = 'agency_owner' and status = 'active'
                                order by created_at limit 1)) is not null
on conflict do nothing;
