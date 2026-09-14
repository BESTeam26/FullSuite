-- 0343 — Phase 2: the CreditOps Main Client List is a directory, not work.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
--
-- Ivan is on the Complaints team, holds `creditops.clients.view`, and saw an
-- EMPTY Main Client List. So would every CreditOps agent the moment they
-- accepted their invitation — eight people, none of whom could have worked.
--
-- The cause was a modelling error, not a wrong value. `fulfillment_clients_select`
-- gates the directory with `in_scope(...)`, which is a PER-RECORD WORK test:
-- is this row in your division / department / team, or assigned to you? A
-- directory is none of those things. Measured against Ivan:
--
--     scope=assigned    list=0     scope=division   list=18
--     scope=team        list=0     scope=agency     list=18
--     scope=department  list=0
--
-- Setting every agent to `division` would have made the symptom disappear by
-- widening eight people's access to all CreditOps work. Dee refused that
-- (2026-09-13, §7): "That fixes the immediate empty-list symptom but keeps the
-- authorization model overloaded."
--
-- ── DEE'S RULE, IMPLEMENTED LITERALLY ──────────────────────────────────────
--
--   "All authorized CreditOps users may see the Main Client List. That should
--    come from CreditOps division access + creditops.clients.view. NOT from
--    Partner assignment, NOT from department assignment, NOT from team
--    assignment."
--
-- So the directory gets its own predicate, added as an OR branch. This can
-- only REVEAL the shared list to authorized CreditOps staff; it removes
-- nothing from anybody, which is what makes Phase 2 safe to ship mid-UAT.
--
-- Department queues keep `in_scope`. They are work, and work stays narrow.
-- ---------------------------------------------------------------------------

-- ── Where somebody works, derived rather than declared ──────────────────
--
-- The organizational hierarchy already exists end to end, and
-- `divisions.service` is the same `fulfillment_service` type the authorization
-- layer already speaks:
--
--   team_memberships → teams.department_id → departments.division_id → divisions.service
--
-- Deriving beats storing here: a person moved between teams is placed
-- correctly by that one act, with nothing to remember to update afterwards,
-- and somebody on two teams is in two divisions rather than in whichever one
-- an enum happened to record.
create or replace function public.my_divisions()
returns setof public.fulfillment_service
language sql stable security definer set search_path = public as $function$
  select distinct dv.service
    from public.team_memberships tm
    join public.teams t       on t.id = tm.team_id and t.archived_at is null
    join public.departments dp on dp.id = t.department_id and dp.archived_at is null
    join public.divisions dv   on dv.id = dp.division_id and dv.archived_at is null
   where tm.user_id = auth.uid()
$function$;
revoke execute on function public.my_divisions() from public, anon;
grant execute on function public.my_divisions() to authenticated;

comment on function public.my_divisions() is
  'The divisions the caller works in, derived from live team membership. Never stored: moving somebody between teams places them, with nothing left to update afterwards (0343).';

create or replace function public.my_departments()
returns setof uuid
language sql stable security definer set search_path = public as $function$
  select distinct t.department_id
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
   where tm.user_id = auth.uid() and t.department_id is not null
$function$;
revoke execute on function public.my_departments() from public, anon;
grant execute on function public.my_departments() to authenticated;

comment on function public.my_departments() is
  'The departments the caller belongs to, derived from live team membership. The canonical answer to "what is MY department" (0343).';

-- ── The directory rule ──────────────────────────────────────────────────
create or replace function public.creditops_directory_visible(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select public.is_admin_of(p_agency)
      or (
        'creditops' = any (array(select public.my_divisions()))
        and public.agency_can('creditops.clients.view')
      )
$function$;
revoke execute on function public.creditops_directory_visible(uuid) from public, anon;
grant execute on function public.creditops_directory_visible(uuid) to authenticated;

comment on function public.creditops_directory_visible(uuid) is
  'Who may READ the shared CreditOps client directory: division placement plus the capability, and nothing else. Deliberately broader than department work — a Complaints agent must be able to look up a client Dispute is working and say where it is, without being able to work it (Dee, §5).';

-- ── One OR branch. Nothing else about this policy changes. ──────────────
drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients
  for select to authenticated
  using (
    (
      outsourcing_group_id is not null
      and public.bes_holds_partner(outsourcing_group_id)
      and public.agency_can('partners.view')
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service,
                          team_id, assigned_agent_id, created_by)
    )
    or (
      public.bes_may_fulfil(organization_id, outsourcing_group_id,
                            'creditops'::public.fulfillment_service)
      and public.in_scope(agency_id, 'creditops'::public.fulfillment_service,
                          team_id, assigned_agent_id, created_by)
    )
    /* The shared directory (0343). Reading a client is not working one:
       INSERT and UPDATE are untouched and still require `in_scope`. */
    or public.creditops_directory_visible(agency_id)
  );

comment on policy fulfillment_clients_select on public.fulfillment_clients is
  'Read. Two per-record work branches, plus the shared CreditOps directory — which is division placement plus capability, never partner, department, team or assignee (Dee, 2026-09-13, §5).';
