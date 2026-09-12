-- =============================================================================
-- A fixture team must never be handed a real client's work.
--
-- Caught by running the backfill and reading the result rather than the count.
-- Seven live files were assigned to `[TEST] Eli Credit`, `[TEST] Dev Lead` and
-- `[TEST] Gus Restricted`, because `[TEST] Team A` and `[TEST] Team B` carry a
-- CreditOps `department_id` and the picker asked only "is this person on a team
-- for this department".
--
-- The engine was right about the question and wrong about the population.
-- Fixture rows exist so the RLS matrix can probe authorization from a known
-- starting point; they are not staff, nobody reads their queue, and work
-- parked on them is work nobody is doing. `teams.is_fixture` already marks
-- them — it simply was not consulted.
--
-- ── UNDOING THE SEVEN ───────────────────────────────────────────────────────
--
-- Reversed precisely, not by clearing assignees in bulk: only rows this
-- backfill wrote (`assignment_method = 'automatic'`) whose assignee is a
-- fixture-team member. A human assignment to any of these accounts, or an
-- imported one, is left exactly where it is — undoing my own mistake must not
-- also undo somebody else's decision.
-- =============================================================================

create or replace function public.creditops_pick_assignee(
  p_department public.fulfillment_department,
  p_agency uuid
) returns uuid
language sql stable security definer set search_path = public as $function$
  with eligible as (
    select distinct m.user_id
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null
      join public.departments d on d.id = t.department_id
      join public.agency_memberships am
        on am.user_id = m.user_id and am.agency_id = p_agency
     where t.agency_id = p_agency
       /* Fixtures are scaffolding for the security probes. They never receive
          real work, however correctly they are filed. */
       and not t.is_fixture
       and d.division = 'creditops'
       and d.archived_at is null
       and d.key = case p_department
                     when 'Onboarding'     then 'onboarding'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
       and coalesce(am.status, 'active') = 'active'
  ), load as (
    select e.user_id,
           (select count(*)
              from public.client_department_statuses s
              join public.fulfillment_clients c on c.id = s.client_id
             where s.assignee_id = e.user_id
               and coalesce(c.lifecycle, 'active') = 'active'
               and c.archived_at is null
               and public.creditops_status_is_actionable(s.department, s.status)
           ) as active_files,
           (select max(s2.assigned_at)
              from public.client_department_statuses s2
             where s2.assignee_id = e.user_id and s2.department = p_department
           ) as last_given
      from eligible e
  )
  select user_id from load
   order by active_files asc, last_given asc nulls first, user_id asc
   limit 1
$function$;

create or replace function public.creditops_is_eligible(
  p_user uuid, p_department public.fulfillment_department, p_agency uuid
) returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null and not t.is_fixture
      join public.departments d on d.id = t.department_id
      join public.agency_memberships am on am.user_id = m.user_id and am.agency_id = p_agency
     where m.user_id = p_user
       and t.agency_id = p_agency
       and d.division = 'creditops' and d.archived_at is null
       and d.key = case p_department
                     when 'Onboarding'     then 'onboarding'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
       and coalesce(am.status, 'active') = 'active'
  )
$function$;

-- ── Release the seven ───────────────────────────────────────────────────────
update public.client_department_statuses s
   set assignee_id = null, assignment_method = null, updated_at = now()
  from public.fulfillment_clients c
 where c.id = s.client_id
   and c.is_fixture = false
   and s.assignment_method = 'automatic'
   and exists (
     select 1 from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.is_fixture
     where m.user_id = s.assignee_id
   );

/* The headline summaries follow the rows they summarise. */
do $$
declare v uuid;
begin
  for v in select id from public.fulfillment_clients where archived_at is null and coalesce(lifecycle,'active') = 'active'
  loop
    perform public.creditops_refresh_headline(v);
  end loop;
end $$;
