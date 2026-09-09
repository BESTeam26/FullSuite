-- The base shape-check on invitations predates partners: it required every
-- 'external' invitation to carry an organization and an external role, which
-- made a partner portal invitation (partner + contact, NO organization —
-- model 3's whole point) structurally impossible. 0145 added the partner
-- columns and their own check, but never widened this one — which is exactly
-- why no invite pipe could ever have worked.
--
-- Every existing row still passes: agency and organization branches are
-- unchanged, and old external rows keep the organization+role branch.
alter table public.invitations drop constraint invitations_check;
alter table public.invitations add constraint invitations_check check (
     (kind = 'agency'       and agency_id is not null       and agency_role is not null)
  or (kind = 'organization' and organization_id is not null and org_role is not null)
  -- an external invitation is EITHER a partner portal one (no organization)…
  or (kind = 'external' and partner_group_id is not null and partner_contact_id is not null
      and agency_id is not null and organization_id is null)
  -- …or the original organization-scoped external shape.
  or (kind = 'external' and organization_id is not null and external_role is not null)
);
