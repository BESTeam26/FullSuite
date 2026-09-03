-- =============================================================================
-- BES Platform — Migration 0004: revoke function EXECUTE from PUBLIC
-- =============================================================================
-- Migration 0003 revoked EXECUTE from the `anon` role, but Postgres grants
-- EXECUTE to PUBLIC on every newly created function, and `anon` is a member of
-- PUBLIC. So helpers such as is_agency_staff() and my_org_ids() still answered
-- unauthenticated callers (returning false / [] — no data leak, but they should
-- not be reachable at all, and a future helper might be less careful).
--
-- Revoke from PUBLIC, then re-grant only to `authenticated`.
-- =============================================================================

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

grant execute on function public.current_agency_role()               to authenticated;
grant execute on function public.is_agency_staff()                   to authenticated;
grant execute on function public.is_agency_admin()                   to authenticated;
grant execute on function public.is_agency_manager_or_above()        to authenticated;
grant execute on function public.is_org_member(uuid)                 to authenticated;
grant execute on function public.org_role_for(uuid)                  to authenticated;
grant execute on function public.is_org_admin(uuid)                  to authenticated;
grant execute on function public.is_external_member(uuid)            to authenticated;
grant execute on function public.can_view_org(uuid)                  to authenticated;
grant execute on function public.shares_scope_with(uuid)             to authenticated;
grant execute on function public.my_org_ids()                        to authenticated;
grant execute on function public.log_audit(text, text, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.can_view_work(public.work_scope, uuid, uuid)    to authenticated;
grant execute on function public.can_write_work(public.work_scope, uuid)         to authenticated;
grant execute on function public.assignable_profiles(public.work_scope, uuid)    to authenticated;

-- Trigger functions run as the table owner, not the caller; no grant needed.
revoke all on function public.bootstrap_agency_owner(citext, citext) from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
