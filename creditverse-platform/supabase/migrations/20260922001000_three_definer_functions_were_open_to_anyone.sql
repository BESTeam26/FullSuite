-- Three SECURITY DEFINER functions could be called without signing in.
--
-- Found 2026-09-22 while auditing what controls CreditOps actions, which is
-- the trap CLAUDE.md rule 1 records from migrations 0003/0004: a function is
-- reachable through TWO independent grants — Supabase's grant to `anon` and
-- Postgres's default grant to PUBLIC — and revoking one leaves the door open.
-- These three still had the PUBLIC grant.
--
--   creditops_route_client(uuid, status)  re-derives a client's department
--     placement. SECURITY DEFINER, so Row Level Security does not apply: any
--     caller holding or guessing a client id could clear assignees, raise
--     portal actions and churn the audit trail on a file they cannot read.
--   eod_email_dispatch()                  sends the End of Day mail. An
--     anonymous caller could trigger a send, which is both unwanted mail and
--     real money (rule 22: messaging is its own cost bucket).
--   attendance_reward_dispatch()          writes the daily reward sweep.
--
-- None of the three is called from a browser. `creditops_route_client` is
-- called by `creditops_route_on_status`, `creditops_route_on_insert`,
-- `creditops_backfill_routing` and `lift_partner_suspension` — all triggers
-- or maintenance running inside the database — and the other two by pg_cron
-- through pg_net. A trigger runs as the statement's own role and a cron job
-- runs as postgres, so neither needs a grant to `authenticated` at all.
--
-- Default to deny (rule 1): nothing is granted back that nothing calls.

revoke execute on function public.creditops_route_client(uuid, public.fulfillment_client_status)
  from public, anon, authenticated;
revoke execute on function public.eod_email_dispatch() from public, anon, authenticated;
revoke execute on function public.attendance_reward_dispatch() from public, anon, authenticated;

comment on function public.creditops_route_client(uuid, public.fulfillment_client_status) is
  'Re-derives department placement from the client''s status. Internal: called by the routing triggers, never by a client. Not executable by anon or authenticated (2026-09-22).';
