-- Inbox, Mentions & Reactions, Saved — the HOME section of Communication.
--
-- Dee, 2026-09-16: *"Add a Communication Inbox view … This is a projection of
-- existing conversations/messages. Do not create a second inbox table unless
-- the architecture genuinely needs one."*
--
-- It does not. Two of the three are pure projections over records that already
-- exist, and they are written that way:
--
--   INBOX is `visible_channels()`, which the rail already calls, sliced by
--   unread / kind / owner in the client. No SQL at all, no second list of
--   conversations to fall out of step with the first.
--
--   MENTIONS AND REACTIONS is a read over `messages` and `message_reactions`.
--   A mention is not a row anywhere — it is a node inside the message body,
--   extracted by `mentioned_user_ids(body)`. So the feed is a query, not a
--   table, and it cannot drift from what was actually said.
--
-- SAVED is the one that needs storage, because "I want to come back to this"
-- is a fact about a person and is recorded nowhere else.
--
-- SECURITY INVOKER on the feed, deliberately. `messages` already has the
-- policy that decides who may read a conversation; running as the invoker
-- means this inherits it exactly rather than re-stating it, and a conversation
-- somebody cannot open cannot leak a line of its text through a mention feed.

-- ── Saved messages ─────────────────────────────────────────────────────────

create table if not exists public.saved_messages (
  /* Defaulted, like every other actor column in this schema. `message_reactions`
     is the cautionary tale: its user_id had no default, the client did not send
     one, and RLS refused every insert for as long as the feature existed. */
  user_id    uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  message_id bigint      not null references public.messages (id) on delete cascade,
  saved_at   timestamptz not null default now(),
  primary key (user_id, message_id)
);

comment on table public.saved_messages is
  'Messages a person kept to come back to. Private to that person — saving is not sharing, and nobody else can see what you saved.';

create index if not exists saved_messages_user_idx
  on public.saved_messages (user_id, saved_at desc);

alter table public.saved_messages enable row level security;

/* Yours, and only for a conversation you can actually read. The second half
   matters: losing access to a channel must not leave its text reachable
   through something you saved while you could. */
create policy saved_messages_select on public.saved_messages
  for select using (
    user_id = auth.uid()
    and exists (select 1 from public.messages m
                 where m.id = saved_messages.message_id
                   and public.channel_visible(m.channel_id))
  );

create policy saved_messages_insert on public.saved_messages
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m
                 where m.id = saved_messages.message_id
                   and public.channel_visible(m.channel_id))
  );

create policy saved_messages_delete on public.saved_messages
  for delete using (user_id = auth.uid());

-- ── Mentions and reactions, as one feed ────────────────────────────────────

/*
 * Dee groups these under one nav item, and they answer one question: what has
 * happened that is about ME. A mention is somebody asking; a reaction is
 * somebody answering without words. Both belong in the same list, newest first.
 */
create or replace function public.my_communication_activity(p_limit integer default 50)
returns table (
  kind          text,
  message_id    bigint,
  channel_id    uuid,
  channel_name  text,
  body_text     text,
  actor_id      uuid,
  actor_name    text,
  emoji         text,
  happened_at   timestamptz
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with mentions as (
    select 'mention'::text as kind, m.id, m.channel_id,
           m.body_text, m.author_id as actor_id, null::text as emoji, m.created_at as happened_at
      from public.messages m
     where m.deleted_at is null
       and m.author_id <> auth.uid()
       and auth.uid() = any (public.mentioned_user_ids(m.body))
  ),
  reactions as (
    /* Reactions to MY messages. Somebody reacting to their own is not news. */
    select 'reaction'::text as kind, m.id, m.channel_id,
           m.body_text, r.user_id as actor_id, r.emoji, r.created_at as happened_at
      from public.message_reactions r
      join public.messages m on m.id = r.message_id
     where m.author_id = auth.uid()
       and m.deleted_at is null
       and r.user_id <> auth.uid()
  ),
  /* Not `both` — that is a reserved word here (trim(BOTH ...)), and naming a
     CTE with it fails at parse time. */
  about_me as (select * from mentions union all select * from reactions)
  select b.kind, b.id, b.channel_id,
         coalesce(c.name, 'Conversation'),
         b.body_text, b.actor_id,
         coalesce(p.full_name, p.email, 'Someone'),
         b.emoji, b.happened_at
    from about_me b
    join public.channels c on c.id = b.channel_id
    left join public.profiles p on p.id = b.actor_id
   order by b.happened_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

comment on function public.my_communication_activity(integer) is
  'What has happened that is about me: mentions of me, and reactions to my messages. SECURITY INVOKER, so the messages policy decides what is readable.';

grant execute on function public.my_communication_activity(integer) to authenticated;

-- ── Saved, read back with enough to render a row ───────────────────────────

create or replace function public.my_saved_messages(p_limit integer default 50)
returns table (
  message_id   bigint,
  channel_id   uuid,
  channel_name text,
  body_text    text,
  author_id    uuid,
  author_name  text,
  created_at   timestamptz,
  saved_at     timestamptz
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select m.id, m.channel_id, coalesce(c.name, 'Conversation'), m.body_text,
         m.author_id, coalesce(p.full_name, p.email, 'Someone'), m.created_at, s.saved_at
    from public.saved_messages s
    join public.messages m on m.id = s.message_id and m.deleted_at is null
    join public.channels c on c.id = m.channel_id
    left join public.profiles p on p.id = m.author_id
   where s.user_id = auth.uid()
   order by s.saved_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

grant execute on function public.my_saved_messages(integer) to authenticated;
