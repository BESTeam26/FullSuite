-- 0347 — Division gets you into the building, not into every room.
--
-- ---------------------------------------------------------------------------
-- DEE'S CORRECTION, 2026-09-13
--
-- The Phase 3 matrix showed one real-world delta: Ivan gained two generic
-- `work_items` belonging to Team Daniel and Team Ally — other departments'
-- work, reached purely because he and they are both inside CreditOps.
--
-- I recommended keeping it. Dee narrowed it, and she is right:
--
--   "Division membership should NOT mean: can read every work item anywhere
--    inside this division. That would start blurring the exact hierarchy you
--    just simplified."
--
-- The Main Client List is a DELIBERATE exception — CreditOps staff should be
-- able to report on any client when another department is unavailable — and
-- that exception must not silently become the rule for every record. It lives
-- in `creditops_directory_visible()` (0343), where it is visible and named,
-- and it is unaffected by this change.
--
-- ── WHAT DIVISION IS STILL FOR ─────────────────────────────────────────────
--
--   · module / operational-area access
--   · directory rules where explicitly defined
--   · determining organizational placement
--
-- ── WHAT NOW CARRIES GENERIC OPERATIONAL WORK ──────────────────────────────
--
--   · the record is in one of YOUR departments
--   · the record is on one of YOUR teams
--   · the record is assigned to YOU
--   · you lead the team that holds it
--   · you are an admin (line 1) or hold a management capability
--
-- The union of real memberships, never the division they happen to sit in.
-- ---------------------------------------------------------------------------
create or replace function public.in_scope_next(
  p_agency uuid,
  p_division public.fulfillment_service,
  p_team uuid,
  p_assignee uuid default null,
  p_creator uuid default null)
returns boolean
language sql stable security definer set search_path = public as $function$
  /* Owner and admin reach every record in their OWN agency. Unchanged. */
  select public.is_admin_of(p_agency)

  /* The record is assigned to you. Unchanged, and this is the honest meaning
     of the `assigned` scope that never had a branch. */
  or (p_assignee is not null and p_assignee = auth.uid())

  /* NO DIVISION BRANCH.
     `p_division` is still accepted — the signature is fixed, and 25 callers
     pass it — but it no longer grants on its own. Division says which building
     you are in; it does not open every room in it (Dee, 2026-09-13). */

  /* The record's team sits in a department you belong to. */
  or (p_team is not null and exists (
        select 1 from public.teams t
         where t.id = p_team and t.agency_id = p_agency and t.archived_at is null
           and t.department_id in (select public.my_departments())))

  /* Or the record's team is simply one of yours. */
  or (p_team is not null and exists (
        select 1 from public.team_memberships tm
          join public.teams t on t.id = tm.team_id
         where tm.team_id = p_team and tm.user_id = auth.uid()
           and t.agency_id = p_agency and t.archived_at is null))

  /* Supervision: the team must be this agency's own. Unchanged, and correctly
     narrow — leading the Complaints team is not leading CreditOps. */
  or (p_team is not null
      and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = p_agency)
      and public.is_team_lead_of(p_team))
$function$;

comment on function public.in_scope_next(uuid, public.fulfillment_service, uuid, uuid, uuid) is
  'PHASE 3 CANDIDATE. Called by nothing. Generic operational work needs a department, a team, an assignment or a lead relationship — never the division alone (0347).';
