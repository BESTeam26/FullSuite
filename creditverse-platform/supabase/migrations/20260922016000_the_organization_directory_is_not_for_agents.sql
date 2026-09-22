-- Every BES agent could read every customer organization.
--
-- Dee, 2026-09-22, on the context switcher: *"these sub account is currently
-- showing to all my BES Agents, which should not be. because this Tenant Sub
-- accounts are not yet build for them… for now, They dont need access to
-- those."*
--
-- The switcher was already hidden from them — it asks the same question as the
-- Organizations door, which is admin-only. The DATA was not. `organizations`
-- allowed `is_staff_of(agency_id)`, so any of the sixteen agency users could
-- read all six organizations straight from the API. Hiding a control is
-- presentation, not protection (rule 1), and this is the second time that gap
-- has turned up this week.
--
-- It is also a rule 16 problem in its own right: BES staff status is not
-- access to a customer's tenancy. A SaaS subscription alone never grants BES
-- operational reach, and the agency-staff arm handed out the directory
-- regardless of whether any engagement existed.
--
-- ── WHAT BREAKS: NOTHING, CHECKED ─────────────────────────────────────────
--
-- Seven fulfillment clients are held by an organization and NO agent can see
-- any of them — verified per person before writing this. The two views that
-- read `organizations` (`creditops_department_queue`, `creditops_my_work`)
-- both LEFT JOIN it, so a row is never lost even if the name resolves to null.
--
-- ── WHAT A NON-ADMIN WOULD NEED LATER ─────────────────────────────────────
--
-- If somebody who is not an admin one day works an organization-held client,
-- the arm to add is a SCOPED one — a live engagement they are in scope for —
-- not a blanket return to `is_staff_of`. Written down so the next person
-- reaches for the narrow fix.

drop policy if exists organizations_select on public.organizations;

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    /* The people who run the platform and set up the tenancies. */
    public.is_admin_of(agency_id)
    /* An organization's own people, who see only their own. */
    or public.is_org_member(id)
  );

comment on table public.organizations is
  'Customer tenancies. Readable by agency admins and by the organization''s own members — NOT by agency staff at large (Dee, 2026-09-22): BES staff status is not access to a customer tenancy (rule 16).';
