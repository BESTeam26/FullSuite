-- Who has already seen it.
--
-- Dee, 2026-09-17: "I still cant see the ones WHO ALREADY SEEN the message…
-- It should be the latest chat that has the typing effects be seen and the
-- ones who viewed the message already."
--
-- Everything needed was already recorded. `channel_reads` holds one
-- `last_read_at` per person per conversation and has been written on every
-- open for months. What was missing is any way to READ somebody else's: the
-- policy on that table is `user_id = auth.uid()`, so the interface could only
-- ever know about you.
--
-- ── §17 FIRST: ADMINISTRATION IS NOT PARTICIPATION ────────────────────────
--
-- An administrator who may INSPECT a conversation is not in it. If their visit
-- counted as "seen", a partner would be told their message had been read by
-- somebody who is not part of the conversation and cannot reply to it — which
-- is worse than telling them nothing.
--
-- The screen already avoided this by not calling `mark_channel_read` on an
-- audit row. That was a rule living in a component, and a receipt list is only
-- worth showing if it is true regardless of which screen wrote the row. So the
-- function now refuses it outright.

create or replace function public.mark_channel_read(
  p_channel uuid, p_at timestamptz default now())
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  /* Reading for administration is not reading. Silent rather than an error:
     the caller did nothing wrong, and an auditor opening a conversation should
     not see a failure — it simply leaves no trace, which is the point. */
  if not public.channel_visible(p_channel) then
    return;
  end if;

  insert into public.channel_reads (channel_id, user_id, last_read_at)
  values (p_channel, auth.uid(), p_at)
  on conflict (channel_id, user_id) do update
    /* Never moves backwards. Opening an old conversation in a second tab must
       not resurrect messages the person has already dealt with. */
    set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at);
end $$;

comment on function public.mark_channel_read(uuid, timestamptz) is
  'Records that the caller has read a conversation up to a point. Does nothing for somebody who may only AUDIT it — administration is not participation (§17), and a read receipt naming an auditor would be worse than none.';

-- ── The receipts ───────────────────────────────────────────────────────────

create or replace function public.channel_seen_by(p_channel uuid)
returns table (user_id uuid, name text, last_read_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.user_id,
         coalesce(nullif(trim(pr.full_name), ''), pr.email),
         r.last_read_at
    from public.channel_reads r
    join public.profiles pr on pr.id = r.user_id
   where r.channel_id = p_channel
     and r.user_id <> auth.uid()
     /* You see receipts for a conversation you are IN. An auditor gets an
        empty list, not the reading habits of everybody in it. */
     and public.channel_visible(p_channel)
   order by r.last_read_at desc
$$;

comment on function public.channel_seen_by(uuid) is
  'Who has read this conversation, and how far. Excludes the caller, and returns nothing to somebody who may only audit the conversation. Auditors never appear in it either, because mark_channel_read does not record them.';

revoke all on function public.channel_seen_by(uuid) from public, anon;
grant execute on function public.channel_seen_by(uuid) to authenticated;
