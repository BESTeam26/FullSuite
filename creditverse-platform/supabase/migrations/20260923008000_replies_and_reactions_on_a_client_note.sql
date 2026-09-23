-- Replies and reactions on a client note — the ClickUp commenting Dee asked
-- for.
--
-- Dee, 2026-09-23: "i want the click up style commenting feature, we have this
-- before." She is right that it exists: Communication has threads
-- (`messages.parent_message_id`) and reactions (`message_reactions`). What the
-- CLIENT FILE has is a note composer that posts to `activity_events` with a
-- screenshot and an @mention — and no way to reply to one or react to it.
--
-- ── WHY NOT JUST USE MESSAGES ─────────────────────────────────────────────
--
-- Because the client feed is not a channel. Dee's own screenshot shows the two
-- kinds interleaved — "Ivan Olympia: you have successfully submitted your
-- complaint" next to "ClickBot removed assignee: Ivan Olympia". A note and the
-- audit trail belong in ONE feed in the order they happened, and they already
-- are one table. Giving every client a channel would mean a second store and a
-- merge on every read, to end up with the list `activity_events` already is.
--
-- ── WHAT IS DELIBERATELY NARROW ───────────────────────────────────────────
--
-- Only a NOTE can be replied to or reacted to. `activity_events` is also the
-- audit trail, written by triggers, and a status change is not a thing to have
-- a conversation under — nor should a reply be able to attach itself to one
-- and inherit its position in the record. Both are enforced in the database,
-- not by which buttons the screen draws (rule 1).
--
-- The table stays append-only for events. Reactions are their own table
-- precisely so removing one is not a delete against the audit trail — you can
-- take back a thumbs-up without anything being erased from the history.
--
-- Cost impact: no material increase. Two columns of index on a table already
-- read per client file; reactions are fetched with the feed, not per row.

/* ── Replies ──────────────────────────────────────────────────────────── */
alter table public.activity_events
  add column if not exists parent_id bigint references public.activity_events(id) on delete cascade;

create index if not exists activity_events_parent_idx
  on public.activity_events (parent_id) where parent_id is not null;

comment on column public.activity_events.parent_id is
  'The note this is a reply to. Null for a top-level note and for every system '
  'event. Only a note may be a parent — a status change is not a conversation.';

/* A reply hangs off a NOTE, never off an audit row, and never off another
   reply: ClickUp threads one level and so does this. Enforced here because the
   screen is not the place to decide it. */
create or replace function public.activity_reply_target_is_a_note()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_id is null then return new; end if;

  select action, parent_id, entity_type, entity_id into p
    from public.activity_events where id = new.parent_id;

  if p is null then
    raise exception 'That note no longer exists' using errcode = '23503';
  end if;
  if p.parent_id is not null then
    raise exception 'Replies are one level deep — reply to the note itself'
      using errcode = '23514';
  end if;
  if coalesce(p.action, '') not in ('Note', 'Comment posted') then
    raise exception 'Only a note can be replied to, not a recorded change'
      using errcode = '23514';
  end if;
  /* A reply belongs to the same record as the note it answers. */
  if p.entity_type is distinct from new.entity_type
     or p.entity_id is distinct from new.entity_id then
    raise exception 'A reply must sit on the same record as the note'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists activity_reply_target_is_a_note on public.activity_events;
create trigger activity_reply_target_is_a_note
  before insert or update of parent_id on public.activity_events
  for each row execute function public.activity_reply_target_is_a_note();

/* ── Reactions ────────────────────────────────────────────────────────── */
create table if not exists public.activity_reactions (
  activity_id bigint not null references public.activity_events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id, emoji)
);

comment on table public.activity_reactions is
  'A reaction on a client note. Its own table, not a column on the event, so '
  'taking a reaction back is never a delete against the append-only audit trail '
  '(2026-09-23).';

create index if not exists activity_reactions_activity_idx
  on public.activity_reactions (activity_id);

alter table public.activity_reactions enable row level security;

/* You may react to exactly what you may READ — the event's own policy decides,
   so a reaction can never be a way to learn that a note exists. */
create policy activity_reactions_select on public.activity_reactions
  for select to authenticated
  using (exists (select 1 from public.activity_events a where a.id = activity_id));

create policy activity_reactions_insert on public.activity_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.activity_events a
       where a.id = activity_id
         and coalesce(a.action, '') in ('Note', 'Comment posted')
    )
  );

/* Your own, and only ever your own. */
create policy activity_reactions_delete on public.activity_reactions
  for delete to authenticated
  using (user_id = auth.uid());

revoke update on public.activity_reactions from authenticated;
grant select, insert, delete on public.activity_reactions to authenticated;

do $$
begin
  if (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'activity_reactions') <> 3 then
    raise exception 'activity_reactions must have exactly select, insert and delete policies';
  end if;
end $$;
