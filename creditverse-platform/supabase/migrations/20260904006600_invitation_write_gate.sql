-- 0088 — an invitation is written only by the function that judges it.
--
-- Found by the authorization matrix (phase 37): a BES admin could INSERT
-- directly into `invitations` with `kind = 'agency'` and
-- `agency_role = 'agency_owner'`, then accept it with their own address —
-- promoting themselves past the rule `invite_agency_member` enforces, that
-- only an owner creates another owner. The same door let an organization
-- admin write an invitation without the seat check and without the audit row
-- that `invite_team_member` writes.
--
-- The cause was one broad policy from the first tenancy migration:
--
--   create policy invitations_write on public.invitations for all
--     using  (is_agency_manager_or_above() or is_org_admin(organization_id))
--     with check (same)
--
-- `for all` covers INSERT and UPDATE as well as DELETE, and it asks only "are
-- you senior enough to invite *someone*" — never "may you grant *this* role,
-- into *this* agency, within your seats". Those questions are answered in
-- `invite_team_member` and `invite_agency_member`, which is where they belong
-- (rule 3: role + permission + scope + assignment, not a role-name check).
--
-- So the table now has no INSERT and no UPDATE policy at all. Both invite
-- functions and both accept functions are SECURITY DEFINER owned by postgres,
-- and the table is not FORCE ROW LEVEL SECURITY, so they continue to work
-- unchanged; a browser calling PostgREST directly is refused.
--
-- DELETE survives, narrowed to what cancelling actually needs: an
-- organization's own administrator (or BES management) may withdraw an
-- ORGANIZATION invitation. An agency invitation is withdrawn only through
-- `cancel_agency_invitation`, which checks agency owner/admin and writes the
-- audit row — a BES manager who is neither must not be able to delete it
-- behind that function's back.

drop policy if exists invitations_write on public.invitations;

create policy invitations_cancel on public.invitations for delete to authenticated
  using (
    organization_id is not null
    and kind <> 'agency'
    and (public.is_agency_manager_or_above() or public.is_org_admin(organization_id))
  );

comment on table public.invitations is
  'Invitations are created and accepted only through invite_team_member, invite_agency_member, accept_invitation and accept_agency_invitation — there is deliberately no INSERT or UPDATE policy. Direct DELETE is allowed only for an organization invitation being cancelled; an agency invitation goes through cancel_agency_invitation.';
