-- Emoji reactions never worked. Not once, for anybody.
--
-- Dee, 2026-09-16, from real use: "Emojis and other functions of the chat is
-- not working / communication."
--
-- WHAT WAS WRONG
--
-- `message_reactions.user_id` is NOT NULL and had no default. The client sends
--
--   sb.from("message_reactions").insert({ message_id, emoji })
--
-- with no `user_id`, exactly as it sends every other insert in the codebase.
-- The RLS check is
--
--   with check (user_id = auth.uid() and ...)
--
-- and a NULL `user_id` makes that comparison NULL, which is not TRUE, so the
-- row was refused — 42501, every single time, for every user. Production holds
-- 27 messages and ZERO reactions, which is the symptom read straight off the
-- table.
--
-- WHY THE DATABASE IS THE RIGHT PLACE TO FIX IT
--
-- This column is the odd one out, not the client. Thirty-one tables in this
-- schema give their actor column `default auth.uid()` — including
-- `message_pins.pinned_by`, the sibling written in the same migration and
-- called from the same file by an insert with the same shape. That is why
-- pinning works and reacting did not.
--
-- So the client is written the way every other call site is written, and the
-- convention is what is missing here. Adding the default fixes the portal's
-- reaction button and the agency one together, and any future caller, rather
-- than teaching one call site to compensate for one irregular column.
--
-- The security property is unchanged: the RLS check still demands
-- `user_id = auth.uid()`. A caller that passes somebody else's id is still
-- refused — the default only fills in the caller's own id when they omit it,
-- which is the only value the policy would have accepted anyway.

alter table public.message_reactions
  alter column user_id set default auth.uid();

comment on column public.message_reactions.user_id is
  'Who reacted. Defaults to auth.uid() like every other actor column in this schema, because the RLS check demands it equals auth.uid() and the client does not send it.';
