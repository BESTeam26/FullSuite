-- 0341 — a TalentOps task is visible to the people on that account.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT THE PROBE FOUND
--
-- `work_items_select` gates agency work on `in_scope(agency, division, team,
-- assignee, creator)` — the CreditOps scoping model, where work reaches you by
-- division, department, team, or by being assigned to you by name.
--
-- Alliana's membership scope is `assigned`. So a task sitting in her own
-- partner's TalentOps backlog, not yet assigned to anybody, was invisible to
-- her — which makes a shared backlog impossible: nobody can pick up work they
-- cannot see, and the first thing a dedicated EA does each morning is exactly
-- that.
--
-- ── WHY THIS IS THE SMALL FIX AND NOT A NEW MODEL ──────────────────────────
--
-- The policy already carries this exact shape for the other module with the
-- same problem: `or may_reach_marketing(workspace_id, false)` is a top-level
-- branch, added because marketing staff work across a workspace rather than
-- down a division. TalentOps is the same situation with a stricter rule, and
-- gets the sibling branch.
--
-- Nothing widens. `may_reach_talentops()` already requires BES staff, the
-- `talentops.view` (or `talentops.tasks.manage`) capability, a live TalentOps
-- workspace, AND `can_see_partner()` on its partner — so this reaches exactly
-- the accounts somebody was made responsible for, and no others. Every other
-- module's rows are untouched: the branch returns false for any workspace
-- whose module is not `talentops`.
-- ---------------------------------------------------------------------------

drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
  using (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, false, assigned_to))
    and (
      (
        public.is_staff_of(agency_id)
        and (scope = 'AGENCY'::work_scope or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by)
      )
      or (scope = 'ORGANIZATION'::work_scope and public.org_scope_allows(organization_id, assigned_to))
      or (
        scope = 'AGENCY'::work_scope
        and subject_organization_id is not null
        and division = 'bes_crm'::fulfillment_service
        and public.is_org_admin(subject_organization_id)
        and public.org_entitled(subject_organization_id, 'crm')
      )
      or public.may_reach_marketing(workspace_id, false)
      /* The account's own people, who are not managers and are not meant to
         be, and whose backlog is the point of the screen. */
      or public.may_reach_talentops(workspace_id, false)
    )
  );

comment on policy work_items_select on public.work_items is
  'Who may read a work item. The two module branches (marketing, talentops) exist because those modules scope work by WORKSPACE rather than by division — and the TalentOps one additionally requires partner assignment, so one EA never reaches another EA''s account (0341).';
