-- Who may see a person's workforce records — with DIVISION scope honoured.
--
-- CLAUDE.md §20b, Dee, 2026-09-19: a Division Manager "sees reward
-- status/exceptions within division scope". The reward, correction and
-- sweep-exception policies all said `is_manager_of(agency_id)`, which answers
-- "has management authority" — not "over everybody". A manager scoped to one
-- division would have seen every reward in BES. Same hole as the policy table
-- yesterday, same fix: one predicate, written once, that knows about scope.
--
--   self                       always
--   lead of one of their teams the relationship, not a rank
--   management at AGENCY scope everybody
--   management at DIVISION     people whose team sits in that division
--   management at DEPARTMENT   people on a team in that department

create or replace function public.may_view_workforce_record(p_agency uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_user = auth.uid()
    or exists (
      select 1 from public.team_memberships lead_m
        join public.team_memberships member_m on member_m.team_id = lead_m.team_id
       where lead_m.user_id = auth.uid() and lead_m.is_lead and member_m.user_id = p_user)
    or exists (
      select 1 from public.agency_memberships me
       where me.user_id = auth.uid() and me.agency_id = p_agency and me.status = 'active'
         and (me.role = 'agency_admin' or public.agency_can('ops.manage'))
         and (
           me.scope = 'agency'
           or (me.scope = 'division' and exists (
                 select 1 from public.team_memberships tm
                   join public.teams t on t.id = tm.team_id and t.archived_at is null
                   join public.departments d on d.id = t.department_id
                  where tm.user_id = p_user and d.division::text = me.scope_division::text))
           or (me.scope = 'department' and exists (
                 select 1 from public.team_memberships tm
                   join public.teams t on t.id = tm.team_id and t.archived_at is null
                  where tm.user_id = p_user and t.department_id = me.scope_department_id))
           /* No `team` branch: `agency_memberships` carries scope_division and
              scope_department_id but no team column. The first draft invented
              `scope_team_id` — READ from the table, not assumed from the enum.
              A team-scoped manager reaches people through the lead
              relationship above. */
         ))
$function$;

comment on function public.may_view_workforce_record(uuid, uuid) is
  'One answer to "may I see this person''s time, attendance, corrections and rewards": self, a lead of their team, or management within its own scope. Division-scoped management sees its division, never the company (§20b).';

revoke all on function public.may_view_workforce_record(uuid, uuid) from public, anon;
grant execute on function public.may_view_workforce_record(uuid, uuid) to authenticated;

drop policy if exists reward_credits_select on public.reward_credits;
create policy reward_credits_select on public.reward_credits
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id));

drop policy if exists reward_sweep_exceptions_select on public.reward_sweep_exceptions;
create policy reward_sweep_exceptions_select on public.reward_sweep_exceptions
  for select to authenticated
  using (public.is_staff_of(agency_id)
         and (user_id is null and public.is_manager_of(agency_id)
              or public.may_view_workforce_record(agency_id, user_id)));

drop policy if exists attendance_corrections_select on public.attendance_corrections;
create policy attendance_corrections_select on public.attendance_corrections
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id));
