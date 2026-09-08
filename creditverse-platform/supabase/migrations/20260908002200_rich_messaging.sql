-- 0199 — Threads, reactions, pins, attachments, tombstones, idempotent send.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS FOR
--
-- Dee: "BES Communication should become the primary work communication space
-- for the BES team... reduce or eliminate dependence on Slack, Microsoft Teams
-- and WhatsApp." A team does not leave Slack for something that cannot thread
-- a conversation, react to a message, or attach a file.
--
-- And the constraint that shapes every choice below: "Do not turn it into an
-- unnecessarily complicated collaboration suite." So this adds four small
-- tables and five columns to the ONE message model. No second messaging
-- engine, no separate thread store, no chat attachment bucket.
--
-- ---------------------------------------------------------------------------
-- THE ONE RULE THAT OUTRANKS EVERY FEATURE HERE
--
-- Dee, §30, marked PERMANENT: "NEVER ALLOW ONE USER TO DELETE ANOTHER USER'S
-- MESSAGE. Not even Manager, Agency Admin, Agency Owner."
--
-- `messages_update` already says `author_id = auth.uid()` on both sides, and
-- there is no DELETE grant on the table at all. This migration does not
-- loosen either, and adds `deleted_by` so a tombstone records who — which,
-- given the rule, is always the author, and is worth being able to prove.
-- ---------------------------------------------------------------------------

-- ── Threads (§21) and idempotent send (§44) ─────────────────────────────
alter table public.messages
  /* A thread reply. NOT the same thing as `reply_to_id`, which already
     existed and is the lightweight quote of §23: reply_to says "about this
     message", parent says "inside this thread". */
  add column if not exists parent_message_id bigint references public.messages(id) on delete cascade,
  /* Who tombstoned it. Always the author — the policy allows nobody else —
     and recorded so that can be shown rather than assumed (§32). */
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  /* §44. A retry carries the same key and writes no second message. */
  add column if not exists client_message_id uuid,
  /* §12. An announcement CARD. The message holds no copy of the announcement:
     see 0200 for why that matters to §15. */
  add column if not exists announcement_id uuid references public.announcements(id) on delete cascade,
  add column if not exists message_type text not null default 'message'
    check (message_type in ('message', 'announcement', 'meeting', 'system'));

create index if not exists messages_parent_idx on public.messages (parent_message_id)
  where parent_message_id is not null;
create unique index if not exists messages_client_id_idx
  on public.messages (author_id, client_message_id) where client_message_id is not null;

comment on column public.messages.parent_message_id is
  'The thread this reply is in. Threads reuse the canonical message model rather than a second one (Dee, §21); `reply_to_id` is the separate, lighter "about this message" reference of §23.';
comment on column public.messages.client_message_id is
  'The sender''s own idempotency key. A retried request carries the same one and writes no second message (Dee, §44).';

/* A thread is one level deep, and lives in one channel. Without this a reply
   can point at a reply, and "3 replies" stops being answerable without
   walking a tree nobody asked for. */
create or replace function public.message_thread_is_flat()
returns trigger language plpgsql set search_path = public as $function$
declare v_parent record;
begin
  if new.parent_message_id is null then return new; end if;
  select channel_id, parent_message_id into v_parent
    from public.messages where id = new.parent_message_id;
  if v_parent is null then
    raise exception 'No such message to reply to' using errcode = 'P0002';
  end if;
  if v_parent.parent_message_id is not null then
    raise exception 'Reply to the thread, not to a reply inside it' using errcode = 'P0001';
  end if;
  if v_parent.channel_id is distinct from new.channel_id then
    raise exception 'A thread reply belongs to the same conversation' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
drop trigger if exists messages_thread_flat on public.messages;
create trigger messages_thread_flat before insert or update of parent_message_id on public.messages
  for each row execute function public.message_thread_is_flat();

-- ── Reactions (§20) ─────────────────────────────────────────────────────
create table public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index message_reactions_message_idx on public.message_reactions (message_id);

comment on table public.message_reactions is
  'One row per person per emoji per message. The primary key IS the rule: clicking the same emoji twice removes your own, and there is no shape in which you remove somebody else''s (Dee, §20).';

alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from public, anon;
grant select, insert, delete on public.message_reactions to authenticated;

create policy message_reactions_select on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m
                  where m.id = message_id and public.channel_visible(m.channel_id)));
/* Your own, in a conversation you are in — never merely one you may audit. */
create policy message_reactions_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.messages m
                           where m.id = message_id and public.channel_writable(m.channel_id)));
create policy message_reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ── Pins (§28, §29) ─────────────────────────────────────────────────────
--
-- The pin references the message. It stores no copy of it, so a tombstoned
-- message shows as a tombstone in the Pinned list rather than as text that
-- was deleted everywhere else (§28).
create table public.message_pins (
  message_id bigint primary key references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  pinned_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  pinned_at  timestamptz not null default now()
);
create index message_pins_channel_idx on public.message_pins (channel_id);

alter table public.message_pins enable row level security;
revoke all on public.message_pins from public, anon;
grant select, insert, delete on public.message_pins to authenticated;

create policy message_pins_select on public.message_pins for select to authenticated
  using (public.channel_visible(channel_id));
/* §29: a channel manager pins. Pinning is not administration — an agency
   admin who is not in the conversation cannot pin in it, because
   `channel_manager` asks about THIS channel. */
create policy message_pins_insert on public.message_pins for insert to authenticated
  with check (public.channel_manager(channel_id) and pinned_by = auth.uid()
              and exists (select 1 from public.messages m
                           where m.id = message_id and m.channel_id = message_pins.channel_id));
create policy message_pins_delete on public.message_pins for delete to authenticated
  using (public.channel_manager(channel_id));

-- ── Attachments (§24, §25, §26) ─────────────────────────────────────────
--
-- The canonical `files` table, with `entity_type = 'channel_message'`. No
-- second bucket and no second file model: Dee, §24, "Do NOT create a second
-- random chat attachment bucket."
--
-- `entity_visible` is default-DENY (0118/0166), so until this case exists a
-- message attachment is invisible to everybody — including its uploader. The
-- case resolves through `messages`, whose own policy is the channel's. An
-- attachment is therefore reachable exactly when its message is, and a
-- storage path copied out of the page grants nothing on its own (§26).
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    else false
  end
$function$;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone. Add the case — with a real check, not `true` — when you add the type. Restored in 0166 after 0159 reverted it by copying an older definition; `channel_message` added in 0199.';

-- ── The message list, in ONE call ───────────────────────────────────────
--
-- Rule 14, and §41–§43. A list that fetches messages, then reactions per
-- message, then a reply count per message, then attachments per message, is
-- four round trips times fifty messages to open a conversation.
--
-- INVOKER, so `messages_select` decides what comes back. Tombstones come back
-- as tombstones: the row survives so a thread keeps its shape, and the body is
-- replaced with NULL here rather than trusted to the interface, because "do
-- not expose deleted content through normal API reads" (§32) is a statement
-- about the API.
create or replace function public.channel_messages(p_channel uuid, p_limit integer default 60)
returns table (
  id bigint, channel_id uuid, author_id uuid, author_name text, author_is_bes boolean,
  body_text text, created_at timestamptz, edited_at timestamptz, deleted boolean,
  message_type text, announcement_id uuid, parent_message_id bigint, reply_to_id bigint,
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
    m.message_type, m.announcement_id, m.parent_message_id, m.reply_to_id,
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
        select jsonb_build_object(
                 'emoji', rx.emoji, 'count', count(*)::int,
                 'mine', bool_or(rx.user_id = auth.uid())) as x
          from public.message_reactions rx
         where rx.message_id = m.id
         group by rx.emoji
      ) r
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'name', f.name, 'path', f.path,
               'mime', f.mime_type, 'size', f.size_bytes))
        from public.files f
       where f.entity_type = 'channel_message' and f.entity_id = m.id::text
    ), '[]'::jsonb)
  from base m
  left join public.profiles pr on pr.id = m.author_id
  order by m.created_at
$function$;
revoke execute on function public.channel_messages(uuid, integer) from public, anon;
grant execute on function public.channel_messages(uuid, integer) to authenticated;

comment on function public.channel_messages(uuid, integer) is
  'A conversation''s top-level messages with their reactions, reply counts, quotes, pins and attachments, in ONE call. INVOKER so messages_select stays the only answer to who may read what. Deleted bodies are NULL here, not filtered by the client (Dee, §32).';

/* Thread replies are fetched only when a thread is opened — a conversation
   does not load every reply of every thread to render "3 replies". */
create or replace function public.thread_messages(p_root bigint)
returns table (
  id bigint, author_id uuid, author_name text, author_is_bes boolean,
  body_text text, created_at timestamptz, edited_at timestamptz, deleted boolean,
  reactions jsonb, attachments jsonb
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
         ), '[]'::jsonb)
    from public.messages m
    left join public.profiles pr on pr.id = m.author_id
   where m.parent_message_id = p_root
   order by m.created_at
$function$;
revoke execute on function public.thread_messages(bigint) from public, anon;
grant execute on function public.thread_messages(bigint) to authenticated;

-- ── Delete your own, and nobody else's (§30, §31, §32) ──────────────────
create or replace function public.delete_own_message(p_id bigint)
returns void language plpgsql security invoker set search_path = public as $function$
declare v_author uuid;
begin
  select author_id into v_author from public.messages where id = p_id;
  if v_author is null then
    raise exception 'No such message' using errcode = 'P0002';
  end if;
  if v_author <> auth.uid() then
    raise exception 'You can only remove your own messages' using errcode = '42501';
  end if;
  /* SECURITY INVOKER on purpose: `messages_update` says `author_id =
     auth.uid()` and is the real gate. This function is the readable error
     message, never the permission — a definer here would BE the permission,
     and the one rule Dee marked permanent would live inside a function body
     instead of in a policy. */
  update public.messages
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_id and deleted_at is null;
end;
$function$;
revoke execute on function public.delete_own_message(bigint) from public, anon;
grant execute on function public.delete_own_message(bigint) to authenticated;

comment on function public.delete_own_message(bigint) is
  'A soft delete of your OWN message. INVOKER, so `messages_update` — author_id = auth.uid(), on both USING and WITH CHECK — is what actually refuses everybody else, including an owner (Dee, §30, permanent).';
