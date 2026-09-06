-- 0105 — record at write time whether a message came from BES.
--
-- Two problems, one fix.
--
-- THE BUG: the message list tried to work out "is this author BES staff?" with
-- a PostgREST embed from `messages` to `agency_memberships`. There is no such
-- relationship, so the request failed with 42703 — every channel would have
-- been an error page. Caught against the live API before shipping.
--
-- THE BETTER ANSWER: do not work it out at read time at all. Whether the
-- author was BES WHEN THEY WROTE IT is a fact about the message, and Dee's C4
-- requirement is that "historical BES participation remains attributable" —
-- so it must not change later. Someone who leaves the BES team must not
-- retroactively turn their old messages into organization messages, and
-- someone who joins must not retroactively claim messages they wrote as a
-- customer's employee.
--
-- Stamped once, on insert, by the row's own trigger. It is also faster: one
-- query with no join, instead of a join per page of messages (rule 14).

alter table public.messages
  add column if not exists author_is_bes boolean not null default false;

comment on column public.messages.author_is_bes is
  'Whether the author was BES staff at the moment of writing. Stamped on insert and never recalculated — attribution is a fact about the message, not about who the author is today.';

create or replace function public.stamp_message_authorship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_is_bes := exists (
    select 1 from public.agency_memberships m where m.user_id = new.author_id
  );
  return new;
end $$;
revoke all on function public.stamp_message_authorship() from public, anon, authenticated;

create trigger messages_stamp_authorship before insert on public.messages
  for each row execute function public.stamp_message_authorship();

/* Anything written before this migration, stamped once from today's memberships. */
update public.messages m
   set author_is_bes = exists (select 1 from public.agency_memberships a where a.user_id = m.author_id)
 where author_is_bes = false;
