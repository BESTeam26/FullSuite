----------------------------------------------------------------------
-- 0233  Two new role values, and nothing else.
--
-- Dee's permanent access model (2026-09-08): application security roles are
-- AGENCY ADMIN / AGENCY USER and ORGANIZATION ADMIN / ORGANIZATION USER —
-- like GHL's agency/sub-account admin and user. Manager, team lead, agent,
-- processor and the rest remain POSITIONS and organizational structure, not
-- security authority.
--
-- This migration only adds the enum values. Postgres refuses to ADD VALUE and
-- USE the value in one transaction, so the data migration is 0234. The old
-- values stay in the type — enum values cannot be dropped, and rows in
-- history tables may still carry them — but after 0234 no ACTIVE membership
-- uses them and no rule grants anything by them.
----------------------------------------------------------------------

alter type public.agency_role add value if not exists 'agency_user';
alter type public.org_role    add value if not exists 'org_user';
