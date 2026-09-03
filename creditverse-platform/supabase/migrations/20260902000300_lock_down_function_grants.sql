-- =============================================================================
-- BES Platform — Migration 0003: revoke function EXECUTE from anon
-- =============================================================================
-- Found by the live smoke test: an ANONYMOUS caller could POST to
-- /rest/v1/rpc/log_audit and get 204. Migration 0001 revoked that function from
-- PUBLIC and granted it to `authenticated`, but Supabase's default privileges on
-- the public schema also grant EXECUTE to the `anon` role, so the revoke did not
-- cover it. Unauthenticated audit-log writes are a log-poisoning vector.
--
-- Fix: explicitly revoke EXECUTE from `anon` on every function in public, then
-- re-grant only to `authenticated`. bootstrap_agency_owner stays service-role
-- only. Belt and braces: also set default privileges so functions added later
-- do not silently become anon-callable.
-- =============================================================================

-- 1. Nothing in public is callable by an unauthenticated visitor.
revoke execute on all functions in schema public from anon;

-- 2. Re-grant the ones a signed-in user legitimately needs.
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

-- 3. Service-role only. Never reachable from a browser.
revoke all on function public.bootstrap_agency_owner(citext, citext) from public, anon, authenticated;

-- 4. Future functions default to authenticated-only.
alter default privileges in schema public revoke execute on functions from anon;

-- 5. Tables: anon gets nothing. Every policy is `to authenticated` anyway, but
--    removing the grant means a missing policy cannot become a data leak.
revoke all on all tables in schema public from anon;
