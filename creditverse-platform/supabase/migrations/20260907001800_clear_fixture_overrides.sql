-- 0177 — the Access panel was listing the security suite's own users.
--
-- `fetchAgencyAccess` never filtered fixtures — only the roster did — so the
-- @bes.test accounts the RLS matrix runs as appeared in the Access panel
-- alongside real staff, and All Access was toggled on one of them. That wrote
-- twenty-three override rows against `bes.manager@bes.test`.
--
-- Two consequences, both real:
--
--   • the matrix's own probes seed overrides with a bare INSERT and started
--     failing on 23505, because a row was already there;
--   • the fixture manager's answers no longer came from role defaults, which
--     is what phase 56 exists to measure.
--
-- The rows are removed here — they are overrides on test accounts that the
-- suite seeds for itself inside rolled-back transactions — and the panel now
-- filters fixtures the way every other list does.
delete from public.agency_member_permissions
 where membership_id in (
   select m.id from public.agency_memberships m
     join public.profiles p on p.id = m.user_id
    where p.is_fixture
 );
