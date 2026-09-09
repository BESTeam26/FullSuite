-- =============================================================================
-- Module access ≠ module management (Dee, 2026-09-09, §59: release-blocking).
--
-- Three different capabilities, never collapsed:
--   MODULE ACCESS   — may enter the module and work assigned records
--   MODULE MGMT     — may manage broader team/department scope inside it
--   AGENCY ADMIN    — agency-level administrative authority
--
-- The database already keeps them apart: no policy anywhere requires
-- ops.manage for operational reads, and every operational table resolves rows
-- by scope + assignment (in_scope, can_see_partner, bes_holds_partner). What
-- was missing:
--
-- 1. TalentOps had no module-entry capability at all — the navigation could
--    only gate it behind management authority. `talentops.view` names the
--    door, matching the existing entry keys (creditops.clients.view,
--    crm.projects.view, fundingops.files.view — reused, not duplicated).
--
-- 2. The AGENT preset granted no partner context, but fulfillment_clients
--    reads require agency_can('partners.view') beneath the assignment scope —
--    so an assigned CreditOps agent held the module key and still saw zero
--    clients. The preset now grants partners.view and partners.files.view;
--    can_see_partner / bes_holds_partner still narrow both to ASSIGNED
--    partners only, so this widens nothing agency-wide (§8: an agent sees
--    assigned partners and the files their work requires — and nothing else).
--
-- Module keys themselves stay OUT of every preset: entering CreditOps or BES
-- CRM is a deliberate per-person grant (§46/47), so a CreditOps agent never
-- sees BES CRM merely by being an agent.
-- =============================================================================

insert into public.permission_keys (key, module, label, description, security_relevant, sort)
values ('talentops.view', 'TalentOps', 'Enter TalentOps',
        'May enter TalentOps and work assigned records. Management of teams and scope stays with ops.manage and admin.',
        true, 40)
on conflict (key) do nothing;

insert into public.agency_profile_permissions (profile, key, allowed) values
  ('agent', 'partners.view',       true),
  ('agent', 'partners.files.view', true)
on conflict (profile, key) do update set allowed = excluded.allowed;
