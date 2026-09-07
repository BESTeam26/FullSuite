-- 0154 — an Agency Admin is agency-wide because of their ROLE.
--
-- ---------------------------------------------------------------------------
-- THE BUG DEE HIT, AND THE EXACT REASON
--
-- An Agency Admin signed in and could not see the partner, the clients, or the
-- agency's records — they behaved like an assigned agent. The screen rendered,
-- the rows did not.
--
-- `in_scope()` decides how far a staff member reaches, and it branched on
-- `agency_memberships.scope`, never on the role:
--
--     case m.scope when 'agency' then true … else false end
--
-- and `accept_agency_invitation` inserts a membership like this:
--
--     insert into public.agency_memberships (user_id, agency_id, role)
--
-- with no `scope` at all. The column defaults to `'assigned'`. So EVERY user
-- who joins through an invitation — the only route a real person takes — got
-- agent-level data scope no matter what role they were invited as. An admin,
-- a manager, a lead: all landed on `'assigned'`, and `in_scope` fell to
-- `else false`.
--
-- It survived because the test fixtures are seeded directly with correct
-- scopes. `bes.admin@bes.test` has scope 'agency' and passes every probe;
-- the admin Dee actually invited has scope 'assigned' and could see nothing.
-- The matrix was testing a population that the invite path cannot produce.
--
-- ---------------------------------------------------------------------------
-- THE FIX, IN THREE PARTS, BECAUSE ONE IS NOT ENOUGH
--
-- 1. ROLE IS THE AUTHORITY for owner and admin. A scope column that has to be
--    kept in step with a role column is two facts that can disagree, and this
--    is what disagreeing looks like. `is_admin_of()` already encodes the rule
--    correctly and is used elsewhere; `in_scope` now consults it first.
--
-- 2. THE INVITE PATH sets a scope that matches the role, so the two columns
--    agree from the moment a person joins.
--
-- 3. THE EXISTING ROWS are corrected, because the people already invited are
--    still broken and nothing else would fix them.
--
-- Manager, lead and agent are deliberately UNCHANGED here: their reach is
-- genuinely a matter of scope and assignment, which is the design. Only owner
-- and admin are agency-wide by role.
-- ---------------------------------------------------------------------------

create or replace function public.in_scope(
  p_agency uuid, p_division fulfillment_service, p_team uuid, p_assignee uuid, p_creator uuid
) returns boolean
language sql stable security definer set search_path = public as $function$
  select
    /* Owner and admin reach every record in their OWN agency, decided by role.
       Not a bypass: `is_admin_of` is agency-specific, so it grants nothing in
       another agency and nothing outside the agency boundary. */
    public.is_admin_of(p_agency)
    or (p_assignee is not null and p_assignee = auth.uid())
    or coalesce((
      select case m.scope
        when 'agency'     then true
        when 'division'   then p_division is not null and p_division = m.scope_division
        when 'department' then p_team is not null and exists (
                                 select 1 from public.teams t
                                  where t.id = p_team and t.agency_id = p_agency and t.archived_at is null
                                    and t.department_id = m.scope_department_id)
        when 'team'       then p_team is not null and exists (
                                 select 1 from public.team_memberships tm
                                   join public.teams t on t.id = tm.team_id
                                  where tm.team_id = p_team and tm.user_id = auth.uid()
                                    and t.agency_id = p_agency and t.archived_at is null)
        when 'self'       then p_creator is not null and p_creator = auth.uid()
        else false
      end
      from public.agency_memberships m
     where m.user_id = auth.uid() and m.agency_id = p_agency
    ), false)
    -- supervision: the team must be this agency's own
    or (p_team is not null
        and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = p_agency)
        and public.is_team_lead_of(p_team))
$function$;
revoke execute on function public.in_scope(uuid, fulfillment_service, uuid, uuid, uuid) from public, anon;
grant execute on function public.in_scope(uuid, fulfillment_service, uuid, uuid, uuid) to authenticated;

comment on function public.in_scope(uuid, fulfillment_service, uuid, uuid, uuid) is
  'How far a BES staff member reaches. Owner and admin are agency-wide by ROLE; everyone else by their scope and assignments. Role first, because a scope column kept in step with a role column is two facts that can disagree.';

-- ── 2. The invite path gives a scope that matches the role ───────────────
create or replace function public.default_scope_for_role(p_role public.agency_role)
returns public.access_scope
language sql immutable set search_path = public as $$
  select case p_role
    when 'agency_owner'     then 'agency'
    when 'agency_admin'     then 'agency'
    /* A manager's real reach is set deliberately by an admin — a division or
       a department. Until then they hold their own work, which is honest:
       inventing a wider default would hand somebody a scope nobody chose. */
    when 'agency_manager'   then 'assigned'
    when 'agency_team_lead' then 'team'
    else 'assigned'
  end::public.access_scope
$$;
revoke execute on function public.default_scope_for_role(public.agency_role) from public, anon;
grant execute on function public.default_scope_for_role(public.agency_role) to authenticated;
