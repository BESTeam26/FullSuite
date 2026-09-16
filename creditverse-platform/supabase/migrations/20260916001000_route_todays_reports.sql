-- Fill in routing for reports submitted TODAY, and only today.
--
-- The routing trigger fires on the transition INTO submitted, so reports
-- submitted before it existed carry none. Four of those were submitted today.
--
-- TODAY ONLY, deliberately. Resolving a lead now and writing it onto a report
-- from last week would be inventing a fact about a day whose team membership
-- may have been different — rule 4, "historical attribution must not change".
-- A report submitted today was submitted under exactly the membership this
-- resolves against, so filling it is recording what was true, not guessing.
--
-- Older reports keep `routing_reason` null, which the interface reads as
-- "not recorded" rather than as any claim about who should have reviewed them.

/* The lateral lives in a CTE: an UPDATE ... FROM may not reference its own
   target table from the FROM list, so `eod_route_for(e.employee_id)` has to be
   resolved before the update rather than inside it. */
with resolved as (
  select e.id, r.lead_id, r.team_id, r.reason
    from public.eod_submissions e
    cross join lateral public.eod_route_for(e.employee_id) r
   where e.work_date = current_date
     and e.submitted_at is not null
     and e.routing_reason is null
)
update public.eod_submissions e
   set routed_to      = resolved.lead_id,
       routed_team_id = resolved.team_id,
       routing_reason = resolved.reason
  from resolved
 where resolved.id = e.id;
