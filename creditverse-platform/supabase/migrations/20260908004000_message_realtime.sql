-- 0217 — Realtime messages, and reading exactly one of them.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SAFE TO PUBLISH
--
-- Dee, §55: "Other participants' messages should appear without refresh."
--
-- Supabase Realtime's `postgres_changes` applies ROW-LEVEL SECURITY to
-- delivery: a change is sent to a subscriber only if that subscriber could
-- have SELECTed the row. `messages_select` asks `channel_auditable`, so
-- adding this table to the publication grants nobody a message they could
-- not already read. If that were not true, publishing a table would be a way
-- to bypass every policy on it, and nothing here would be safe to stream.
--
-- Only `messages` is published. Not `channels`, not `channel_members`, not
-- `message_reactions` — each would be a separate decision with its own
-- reasoning, and a publication is not a place to be generous by default.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS A SINGLE-MESSAGE READER
--
-- A realtime payload is the raw `messages` row: an author id, not an author
-- name; no reactions, no reply count, no attachments. The list is rendered
-- from `channel_messages()`, which brings all of that with it.
--
-- The lazy option is to refetch the channel on every arriving message, which
-- §43 forbids in as many words: "Do not reload all channels / reload 50
-- messages unnecessarily." So an arriving message costs ONE small read of
-- ONE row, in the same shape the list already speaks — no second mapper, no
-- name guessed from a cache that may not have it.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;

comment on table public.messages is
  'Soft-deleted only. A conversation an engagement has ended does not get rewritten — historical BES participation stays attributable (Dee, C4). Published to supabase_realtime (0217): delivery is RLS-filtered, so streaming grants nobody a message `messages_select` would refuse.';

create or replace function public.channel_message_by_id(p_id bigint)
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
    case when m.deleted_at is null then public.message_mentions(m.body) else '[]'::jsonb end
  from public.messages m
  left join public.profiles pr on pr.id = m.author_id
  left join public.announcements an on an.id = m.announcement_id
 where m.id = p_id
$function$;
revoke execute on function public.channel_message_by_id(bigint) from public, anon;
grant execute on function public.channel_message_by_id(bigint) to authenticated;

comment on function public.channel_message_by_id(bigint) is
  'ONE message, in the same shape `channel_messages` returns — so a realtime arrival costs one small read instead of reloading the conversation (Dee, §43). INVOKER, so `messages_select` still decides.';

-- ── §56 — editing your OWN message, and the audit that survives it ──────
--
-- `messages_update` already says `author_id = auth.uid()` on both USING and
-- WITH CHECK, so nobody edits anybody else's — not a manager, not an admin,
-- not the owner. That is unchanged and is asserted by a probe.
--
-- What is added is the version history. Dee, §56: "Preserve enough
-- audit/version history to avoid silent rewriting." An `edited` badge tells a
-- reader the text moved; it does not tell them what it said. So each edit
-- appends the PREVIOUS text, and the row is append-only — no update grant, no
-- delete grant — because a rewritable history is not one.
create table public.message_revisions (
  id          bigint generated always as identity primary key,
  message_id  bigint not null references public.messages(id) on delete cascade,
  /** What it said BEFORE this edit. */
  body_text   text not null,
  edited_by   uuid references public.profiles(id) on delete set null,
  edited_at   timestamptz not null default now()
);
create index message_revisions_message_idx on public.message_revisions (message_id, edited_at desc);

comment on table message_revisions is
  'What a message said before each edit. Append-only — no UPDATE or DELETE grant — because a history somebody can rewrite is not a history (Dee, §56).';

alter table public.message_revisions enable row level security;
revoke all on public.message_revisions from public, anon, authenticated;
grant select on public.message_revisions to authenticated;
-- No insert grant either: the trigger below writes it, so a client cannot
-- fabricate or omit a revision.

create policy message_revisions_select on public.message_revisions for select to authenticated
  using (exists (select 1 from public.messages m
                  where m.id = message_id and public.channel_auditable(m.channel_id)));

create or replace function public.record_message_revision()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  /* Only a real change to the words. A soft delete is not an edit, and a
     reaction arriving does not touch this table at all. */
  if new.body_text is distinct from old.body_text and old.deleted_at is null then
    insert into public.message_revisions (message_id, body_text, edited_by)
    values (old.id, old.body_text, auth.uid());
  end if;
  return new;
end;
$function$;
drop trigger if exists messages_record_revision on public.messages;
create trigger messages_record_revision before update of body_text on public.messages
  for each row execute function public.record_message_revision();
