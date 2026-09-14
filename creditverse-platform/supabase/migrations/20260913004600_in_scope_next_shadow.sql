-- 0346 — Phase 3, step one: the candidate, wired to NOTHING.
--
-- ---------------------------------------------------------------------------
-- A SHADOW, SO THE MATRIX IS MEASURED AND NOT PREDICTED
--
-- Dee, 2026-09-13: "Before changing in_scope(), show the exact old-vs-new
-- behaviour matrix… If the matrix shows any surprising widening or narrowing,
-- stop before deploying."
--
-- The only honest way to produce that matrix is to run both functions over the
-- same inputs as the same people. So `in_scope_next` is deployed with the
-- identical signature and called by NO policy and NO function. It changes
-- nothing. It exists to be compared, and it is dropped or promoted once the
-- comparison is read.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT
--
-- Unchanged, branch for branch:
--   · is_admin_of(p_agency)          — admins, first, as before
--   · p_assignee = auth.uid()        — a record assigned to you. This IS what
--                                      the broken `assigned` enum meant, and
--                                      it has always run unconditionally
--   · is_team_lead_of(p_team)        — supervision
--
-- Derived instead of read from the enum:
--   · division    was `scope='division'` matched against `scope_division`
--                 now  p_division ∈ my_divisions()
--   · department  was `scope='department'` matched against scope_department_id
--                 now  the record's team's department ∈ my_departments()
--   · team        was `scope='team'`, which ALREADY read team_memberships
--                 now  the same read, without the enum gate in front of it
--
-- Dropped, both with zero current holders — reported, not smuggled:
--   · `agency`    always-true. Every holder today is an agency_admin, so
--                 line 1 already carries them. A NON-admin holding it would
--                 lose everything; there are none.
--   · `self`      creator access. Making `p_creator = auth.uid()`
--                 unconditional would be defensible — you made it, you can see
--                 it — but it is a WIDENING, and Dee said not to widen because
--                 the new model is cleaner. So it is omitted rather than
--                 promoted, and flagged for her decision.
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

  /* The record's division is one you work in — derived from live team
     membership rather than declared on the membership row. Somebody on two
     teams is in two divisions, which the enum could never express. */
  or (p_division is not null
      and p_division = any (array(select public.my_divisions())))

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

  /* Supervision: the team must be this agency's own. Unchanged. */
  or (p_team is not null
      and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = p_agency)
      and public.is_team_lead_of(p_team))
$function$;
revoke execute on function public.in_scope_next(uuid, public.fulfillment_service, uuid, uuid, uuid) from public, anon;
grant execute on function public.in_scope_next(uuid, public.fulfillment_service, uuid, uuid, uuid) to authenticated;

comment on function public.in_scope_next(uuid, public.fulfillment_service, uuid, uuid, uuid) is
  'PHASE 3 CANDIDATE. Called by nothing. Deployed only so the old-vs-new matrix can be measured as real users over real inputs rather than predicted (0346). Promote or drop once the matrix is read.';
