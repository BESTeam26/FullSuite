-- The CreditOps teams can see the partner they are already working.
--
-- Two things had to be true for Tiffany Hunter's 71 clients to reach the
-- people meant to work them, and neither was:
--
--   1. a LIVE engagement          — paused since 2026-09-11 (fixed in 014000)
--   2. a partner ASSIGNMENT       — only Bryan Breva, who is an administrator
--                                   and would see it either way
--
-- So `can_see_partner()` was false for every CreditOps agent, and Jet and
-- Ivan could open 5 clients each instead of 71 — only the ones the automatic
-- assignment had put directly in their hands. The engine had already decided
-- these people work this partner; the record saying so did not exist.
--
-- ── WHY TEAMS AND NOT NAMES ───────────────────────────────────────────────
--
-- Dee has named individual owners where she wants them — "Credit by Nainoa is
-- with Allyssa and Jet", "Vanquish is with Jet for support" — and for the
-- rest she said the work spreads across the department. She has not named an
-- owner for Approve with Tiff, so this does not invent one. It assigns the
-- partner to the three live CreditOps TEAMS, which is the smallest grant that
-- lets the division work the files:
--
--   · every member of those teams can see the partner
--   · WHICH client each person gets is still the assignment engine's answer,
--     narrowed by department, workload, continuity and partner batching
--   · naming an individual owner later is an ordinary partner assignment and
--     does not need this removed
--
-- Onboarding is included because its status routes through Client Success,
-- and Bureau Calling is not: it has no staff (rule 24, and
-- `creditops_unstaffed_departments()` returns exactly it).
--
-- Reversing this is one UPDATE setting `ended_on`; nothing else depends on it.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_agency uuid;
  v_group uuid;
  v_owner uuid;
  t record;
  v_added int := 0;
begin
  select id into v_group from public.outsourcing_groups where name = 'Approve with Tiff';
  if v_group is null then raise exception 'no partner called Approve with Tiff'; end if;
  select agency_id into v_agency from public.outsourcing_groups where id = v_group;
  select user_id into v_owner from public.agency_memberships
   where agency_id = v_agency and is_owner and status = 'active'
     and exists (select 1 from public.profiles p
                  where p.id = user_id and coalesce(p.is_fixture, false) = false)
   limit 1;

  for t in
    select tm.id, tm.name from public.teams tm
     join public.departments d on d.id = tm.department_id
    where tm.agency_id = v_agency and tm.archived_at is null
      and d.division = 'creditops' and d.archived_at is null
      and d.key in ('dispute', 'support', 'complaints')
  loop
    if not exists (
      select 1 from public.partner_assignments a
       where a.group_id = v_group and a.team_id = t.id and a.ended_on is null
    ) then
      insert into public.partner_assignments
        (agency_id, group_id, team_id, assignment_role, started_on, created_by, notes)
      values (v_agency, v_group, t.id, 'assigned', current_date, v_owner,
              'Division-wide while no individual owner is named (2026-09-24).');
      v_added := v_added + 1;
    end if;
  end loop;

  raise notice 'assigned the partner to % CreditOps team(s)', v_added;
end $$;

commit;
