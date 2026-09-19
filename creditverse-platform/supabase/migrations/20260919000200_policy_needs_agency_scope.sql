-- A division manager must not reprice the whole company.
--
-- Dee's standing rule, 2026-09-19 (CLAUDE.md §20b): "always consider all those
-- views… agent, team lead, Division manager, executive… every single time."
--
-- 20260919000100 gated `attendance_policy` updates on `is_manager_of`, which
-- answers "has management authority" — NOT "over everything". A division
-- manager holds `ops.manage` with `scope_division` set, and would have been
-- able to change the penalty for a late, the quarterly baseline and the reward
-- thresholds for every person in BES, including divisions they cannot even
-- see. Caught by applying the rule to my own migration an hour after writing
-- it down.
--
-- The policy is COMPANY-WIDE, so changing it needs company-wide authority:
-- an admin, or `ops.manage` held at `agency` scope. Reading it stays open to
-- every employee — a score you cannot check the rules against is a score you
-- have to take on trust.

create or replace function public.may_set_agency_policy(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.agency_memberships m
     where m.user_id = auth.uid()
       and m.agency_id = p_agency
       and m.status = 'active'
       and (
         /* An executive: the admin role carries agency scope by definition. */
         m.role = 'agency_admin'
         /* Or somebody explicitly granted management AT agency scope. A
            division-scoped manager is deliberately excluded. */
         or (m.scope = 'agency' and public.agency_can('ops.manage'))
       )
  )
$function$;

comment on function public.may_set_agency_policy(uuid) is
  'Company-wide settings authority: an admin, or ops.manage held at AGENCY scope. A division- or team-scoped manager has management authority over their own people and none over policy that prices everybody (CLAUDE.md §20b).';

revoke all on function public.may_set_agency_policy(uuid) from public, anon;
grant execute on function public.may_set_agency_policy(uuid) to authenticated;

drop policy if exists attendance_policy_update on public.attendance_policy;
create policy attendance_policy_update on public.attendance_policy
  for update to authenticated
  using (public.may_set_agency_policy(agency_id))
  with check (public.may_set_agency_policy(agency_id));
