-- A policy is permission to see rows. A GRANT is permission to touch the table.
--
-- `saved_messages` shipped with three correct RLS policies and no INSERT or
-- DELETE grant, so every save came back
--
--   42501: permission denied for table saved_messages
--
-- which reads like an authorization refusal and is nothing of the kind. RLS had
-- not been consulted yet; Postgres refused at the grant layer first.
--
-- This repository already learned the other half of this lesson in 0003/0004 —
-- that a table can be reachable through TWO independent grants, Supabase's to
-- `anon` and Postgres's default to `PUBLIC`, so revoking one leaves the door
-- open. The same split is why a policy alone is not access: the two layers are
-- independent in both directions.
--
-- Matched to the siblings rather than invented: `message_reactions` and
-- `message_pins` each hold exactly DELETE, INSERT, SELECT for `authenticated`
-- and nothing at all for `anon`.

grant select, insert, delete on public.saved_messages to authenticated;

/* Belt and braces, and cheap. Saving a message is a signed-in act; nothing
   anonymous has any business here through either grant path. */
revoke all on public.saved_messages from anon;
revoke all on public.saved_messages from public;
