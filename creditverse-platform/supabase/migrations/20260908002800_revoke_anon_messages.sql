-- 0205 — Belt and braces on anon, and a correction to what a probe seemed to say.
--
-- ---------------------------------------------------------------------------
-- WHAT THE PROBE REPORTED, AND WHAT WAS ACTUALLY TRUE
--
-- A new matrix probe read `information_schema.role_table_grants` and found
-- `anon` holding SELECT, INSERT and UPDATE on a table called `messages`. That
-- reads like the 0003/0004 trap the project rules record — two independent
-- grants, one revoked and one forgotten — and it is worth chasing every time.
--
-- It was NOT that. The grantor was `supabase_realtime_admin`, and the table
-- was `realtime.messages` — Supabase's own internal table, which has nothing
-- to do with this product's conversations. `public.messages` was already
-- clean: its ACL holds postgres, authenticated and service_role and no anon.
--
-- The bug was in the probe, which matched on `table_name` without
-- `table_schema = 'public'`. It is fixed there, and this note exists so the
-- next person to read a migration called "revoke anon messages" is not left
-- believing the product once exposed its messages anonymously. It did not.
--
-- The statements below are kept rather than deleted. They are idempotent
-- no-ops against the current state, they cost nothing, and they make the
-- intent explicit for every table Communication owns — which is the half of
-- 0003/0004's lesson that does still apply: state it, then verify it live.
-- ---------------------------------------------------------------------------

revoke all on public.messages from anon;
revoke all on public.channels, public.channel_members, public.channel_shares from anon;
revoke all on public.channel_teams, public.channel_reads from anon;
revoke all on public.message_reactions, public.message_pins from anon;
revoke all on public.meetings, public.agency_meeting_providers from anon;
revoke all on public.communication_blocked_terms, public.agency_communication_settings from anon;
