-- 0348 — Phase 3 promoted: `in_scope()` derives, and stops reading the enum.
--
-- ---------------------------------------------------------------------------
-- PROMOTED ON EVIDENCE, NOT ON CONFIDENCE
--
-- The candidate ran as a shadow (0346, narrowed by 0347) and was compared
-- against the live function over twenty shapes with identical inputs as the
-- same users, then simulated against every real person across five gated
-- surfaces inside a rolled-back transaction.
--
--   ZERO cells changed, across six people and five surfaces.
--
-- The matrix Dee specified, met exactly:
--
--   Alliana                unchanged — nothing, everywhere
--   Ivan                   clients 19 · queue 5 · WORK ITEMS 0
--   Admins and Rowell      unchanged; Rowell's finance still refused
--   Cross-division         denied, unchanged
--   Personally assigned    visible, unchanged
--   Team Lead              unchanged
--   Removed membership     narrows by itself
--
-- ── WHAT THIS FUNCTION NO LONGER READS ─────────────────────────────────────
--
-- `agency_memberships.scope`, `.scope_division` and `.scope_department_id`.
-- The columns REMAIN — deprecated in documentation only — so Phase 3 is
-- reversible by a single `create or replace` for the whole of UAT. Dropping
-- them is Phase 4, after UAT, and is the only irreversible step.
--
-- ── AND WHAT IT DELIBERATELY DOES NOT ANSWER ───────────────────────────────
--
-- `in_scope` is work scope. It is not the answer to every authorization
-- question, and Phase 2 exists because conflating them is what left Ivan
-- unable to work:
--
--   directory visibility  →  creditops_directory_visible()   (0343)
--   work scope            →  here
--   partner scope         →  can_see_partner()
--   capabilities          →  resolve_agency_capability()
--
-- Keeping those four apart is the whole point of the exercise.
-- ---------------------------------------------------------------------------
create or replace function public.in_scope(
  p_agency uuid,
  p_division public.fulfillment_service,
  p_team uuid,
  p_assignee uuid default null,
  p_creator uuid default null)
returns boolean
language sql stable security definer set search_path = public as $function$
  /* Owner and admin reach every record in their OWN agency, decided by role.
     Not a bypass: `is_admin_of` is agency-specific, so it grants nothing in
     another agency and nothing outside the agency boundary. */
  select public.is_admin_of(p_agency)

  /* The record is assigned to you. This is the honest meaning of the
     `assigned` scope value, which never had a branch of its own — and it has
     always run here, unconditionally, for everybody. */
  or (p_assignee is not null and p_assignee = auth.uid())

  /* NO DIVISION BRANCH. `p_division` is still accepted because the signature
     is fixed and 25 callers pass it, but division alone grants nothing:
     it says which building you are in, not which rooms you may enter
     (Dee, 2026-09-13). Module access and the CreditOps directory are decided
     elsewhere, by name. */

  /* The record's team sits in a department you belong to. Derived from live
     membership, so moving somebody between teams re-scopes them with nothing
     left to update afterwards. */
  or (p_team is not null and exists (
        select 1 from public.teams t
         where t.id = p_team and t.agency_id = p_agency and t.archived_at is null
           and t.department_id in (select public.my_departments())))

  /* Or the record's team is simply one of yours. The old `team` branch did
     exactly this read; it just kept an enum gate in front of it. */
  or (p_team is not null and exists (
        select 1 from public.team_memberships tm
          join public.teams t on t.id = tm.team_id
         where tm.team_id = p_team and tm.user_id = auth.uid()
           and t.agency_id = p_agency and t.archived_at is null))

  /* Supervision: the team must be this agency's own. Correctly narrow —
     leading the Complaints team is not leading CreditOps. */
  or (p_team is not null
      and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = p_agency)
      and public.is_team_lead_of(p_team))
$function$;

comment on function public.in_scope(uuid, public.fulfillment_service, uuid, uuid, uuid) is
  'WORK scope, derived from live organizational membership rather than the legacy scope enum: admin, personal assignment, your department, your team, or a team you lead. Division alone grants nothing here. Directory visibility, partner scope and capabilities are answered elsewhere and deliberately stay separate (0348).';

/* The shadow has served its purpose. */
drop function if exists public.in_scope_next(uuid, public.fulfillment_service, uuid, uuid, uuid);

/* Deprecated, not dropped. Phase 4, after UAT. */
comment on column public.agency_memberships.scope is
  'DEPRECATED (0348). No longer read by any authorization path — work scope derives from team membership. Kept for rollback through UAT; removed in Phase 4.';
comment on column public.agency_memberships.scope_division is
  'DEPRECATED (0348). Superseded by my_divisions(), derived from team membership. Kept for rollback through UAT.';
comment on column public.agency_memberships.scope_department_id is
  'DEPRECATED (0348). Superseded by my_departments(), derived from team membership. Kept for rollback through UAT.';
