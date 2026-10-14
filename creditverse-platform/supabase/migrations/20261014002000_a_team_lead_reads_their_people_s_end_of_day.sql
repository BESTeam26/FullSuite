-- A team lead reads their people's End of Day submissions.
--
-- GO_LIVE_STATUS.md, NEEDS FIX (2026-10-01): "A Team Lead who holds neither
-- ops.manage nor a seat cannot read their agents' eod_submissions rows
-- directly (eod_submissions_select is self or is_manager_of); the rollup
-- function still serves them. No real lead is in that position today."
--
-- Rule 20c gives a Team Lead People & Teams › End of Day "over the teams they
-- lead", and that screen (fetchTeamEod) reads eod_submissions directly — so
-- the day the first plain lead is appointed, their Team EOD table is empty
-- with no error. Rule 20b: a relationship, never a rank. Fixed before it
-- bites, in the data layer, not by hiding the screen.
--
-- Who may read a submission, after this:
--   the person themself                              (unchanged)
--   management authority — is_manager_of()           (unchanged)
--   anybody whose placement reaches the person — managed_people(): a lead of
--     a team they sit on, a department or division seat, the Managing
--     Partner's workforce administration
--   the direct team-lead relationship, spelled out as well, because
--     managed_people() excludes fixture profiles by design and the matrix's
--     fixture lead must prove the rule (same shape as 20261001014000).
--
-- Both new branches are uncorrelated subqueries: Postgres evaluates each once
-- per statement and hashes it, so a day's roster costs one lookup, not one
-- per row (the lesson of the 2026-10-02 bell fix). The UPDATE policy is
-- untouched: returning a report for clarification stays with management
-- until Dee says a lead may do it.

drop policy if exists eod_submissions_select on public.eod_submissions;
create policy eod_submissions_select on public.eod_submissions for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (
      employee_id = auth.uid()
      or public.is_manager_of(agency_id)
      or employee_id in (select mp.user_id from public.managed_people() mp)
      or employee_id in (
        select member_m.user_id
          from public.team_memberships lead_m
          join public.team_memberships member_m on member_m.team_id = lead_m.team_id
         where lead_m.user_id = auth.uid() and lead_m.is_lead
      )
    )
  );
