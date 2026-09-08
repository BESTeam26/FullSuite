-- 0204 — Two grants that should never have existed, and one default.
--
-- ---------------------------------------------------------------------------
-- THE GRANT I MISSED
--
-- 0202 wrote:
--
--     revoke all on public.agency_meeting_providers,
--                   public.agency_meeting_credentials, public.meetings
--       from public, anon;
--
-- and left `authenticated` holding SELECT on the credentials table — because
-- Supabase's default privileges grant it to `authenticated` on every new table
-- in `public`, and revoking from `public` and `anon` does not touch it.
--
-- This is the same two-independent-grants trap the project rules record from
-- migrations 0003/0004: "Revoking one leaves the door open. Verify against a
-- live database; a clean parse proves nothing." It was found by a probe
-- reading `information_schema.role_table_grants`, not by reading the SQL.
--
-- Nothing leaked: RLS is on and the table has no policy, so the select
-- returned zero rows to everybody. But a table holding OAuth refresh tokens
-- should not be one carelessly-added policy away from being readable, and the
-- grant is the thing that makes that possible.
-- ---------------------------------------------------------------------------

revoke all on public.agency_meeting_credentials from authenticated, anon, public;

comment on table public.agency_meeting_credentials is
  'OAuth tokens. `authenticated` holds NO privilege here — not select — and 0204 revoked the one Supabase''s default privileges had granted. A token the browser cannot request is a token the browser cannot leak.';

-- ── A channel attachment needs its agency (found by the same probe) ─────
--
-- `files.agency_id` has been NOT NULL since 0003. The client attach path did
-- not set it, so every attachment upload would have failed with 23502 the
-- first time anybody tried one. A default resolved from the caller's own
-- membership means the client never has to name it — and cannot name the
-- wrong one.
alter table public.files alter column agency_id set default public.my_agency_id();

comment on column public.files.agency_id is
  'The agency that owns the file. Defaulted from the caller''s own active membership so a client never supplies it — rule 16 applied to storage: an id from the browser may narrow a query, never widen one.';
