-- Alert when a STAFFED queue has nobody today. Do not alert about a queue that
-- was never staffed.
--
-- 20260923015000 alerted on any queue with work and no eligible agent. Tested
-- against live data and it told SEVEN PEOPLE about Bureau Calling — which Dee
-- has already said is "the 4th but it's not active yet". Twenty-four hours
-- later it would tell them again, and the day after.
--
-- That is how a channel gets ignored, and the cost is not the noise itself:
-- it is that the alert which DOES matter arrives in a stream people have
-- learned to skim.
--
-- ── THE TWO CASES ARE DIFFERENT QUESTIONS ─────────────────────────────────
--
--   NO TEAM AT ALL     a department nobody has built yet. A standing fact,
--                      true until somebody changes it, and already visible in
--                      `creditops_coverage()` as `no_agent_at_all` — which is
--                      exactly the "⚠ No active Bureau Calling agents" the
--                      spec asks to display. A dashboard line, not a daily
--                      interruption.
--
--   STAFFED, NOBODY    a department with a live team where everyone is on
--   AVAILABLE          leave, off shift, or deactivated. This is a SURPRISE.
--                      It was covered yesterday and is not covered today, and
--                      somebody has to move work or the SLA is missed. Worth
--                      interrupting a lead for.
--
-- The spec's step 6 — "if nobody qualifies, leave it Unassigned and alert the
-- Team Lead" — is satisfied by the second. The first still leaves the work
-- unassigned and never reassigns it elsewhere; it is only the notification
-- that is withheld, because the standing version of that fact has a better
-- home.
--
-- Cost impact: reduces it. Bureau Calling alone was seven notification rows a
-- day for a condition Dee already knows about.

do $$
declare
  v_def text := pg_get_functiondef('public.creditops_alert_uncovered()'::regprocedure);
  v_old text := '       and public.creditops_pick_assignee(s.department, c.agency_id, c.outsourcing_group_id) is null
     group by s.department, c.agency_id';
  v_new text := '       and public.creditops_pick_assignee(s.department, c.agency_id, c.outsourcing_group_id) is null
       /* Only a queue somebody has actually staffed. A department with no live
          team is an unbuilt queue, reported by creditops_coverage() as a
          standing fact rather than pushed daily (2026-09-23). */
       and exists (
         select 1
           from public.teams t
           join public.departments d on d.id = t.department_id
          where t.archived_at is null
            and t.agency_id = c.agency_id
            and d.division = ''creditops''
            and d.archived_at is null
            and exists (select 1 from public.team_memberships tm where tm.team_id = t.id)
            and d.key = case s.department
                          when ''Onboarding''     then ''support''
                          when ''Dispute''        then ''dispute''
                          when ''Support''        then ''support''
                          when ''Complaints''     then ''complaints''
                          when ''Bureau Calling'' then ''bureau_calling''
                        end
       )
     group by s.department, c.agency_id';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'creditops_alert_uncovered does not select gaps as expected — read it before replacing it';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

/* Bureau Calling must go quiet, and must still be VISIBLE in the coverage
   read — silencing it everywhere would be worse than the noise. */
do $$
declare v_alerts int; v_visible boolean;
begin
  select public.creditops_alert_uncovered() into v_alerts;
  if v_alerts > 0 then
    raise exception 'still alerting on an unstaffed queue: % notifications', v_alerts;
  end if;

  select bool_or(no_agent_at_all) into v_visible
    from public.creditops_coverage() where department = 'Bureau Calling';
  if not coalesce(v_visible, false) then
    raise exception 'Bureau Calling has gone quiet AND invisible — the coverage read must still show it';
  end if;
end $$;
