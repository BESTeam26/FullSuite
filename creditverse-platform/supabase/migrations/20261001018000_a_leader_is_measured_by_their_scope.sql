-- A leader is measured by their scope (Dee, 2026-10-01):
--
--   "Team leads and department leads and division leads overall performance
--    are the combination and average of their team or scope of leadership
--    plus attendance performance as well — they keep their own attendance
--    records but they will be measured based on their designated team,
--    department or division performance."
--
-- The arithmetic lives in the deterministic engine (performance-metrics.ts,
-- `leaderScore`): Quality, Output and Compliance are the average of the
-- people in the leader's scope; Attendance stays the leader's own. This
-- function answers the one question the engine cannot derive on its own —
-- WHO is in whose scope — from the placement the platform already has:
--
--   team lead           → the other members of the teams they lead
--   department_manager  → everyone on a team in that department (and its
--                         child departments)
--   division_manager    → everyone on a team in a department of that division
--   chief_operations    → everyone
--
-- Only people the workforce engine measures count on either side (active,
-- workforce_managed, not a fixture), and the leader is never in their own
-- scope. The viewer receives only leaders and members they may already see
-- (managed_people() plus themselves) — this names relationships, never
-- somebody outside the viewer's reach.

create or replace function public.leadership_scopes()
returns table(leader_id uuid, member_id uuid)
language sql stable security definer set search_path = public as $$
  with measured as (
    select m.user_id
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.status = 'active'
       and m.workforce_managed
       and coalesce(p.is_fixture, false) = false
  ),
  led as (
    select lead.user_id as leader_id, tm.user_id as member_id
      from public.team_memberships lead
      join public.teams t on t.id = lead.team_id and t.archived_at is null
      join public.team_memberships tm on tm.team_id = t.id
     where lead.is_lead and tm.user_id <> lead.user_id
  ),
  seated as (
    select s.user_id as leader_id, tm.user_id as member_id
      from public.management_seats s
      join public.teams t on t.archived_at is null and (
             (s.seat = 'department_manager' and t.department_id in (
                select d.id from public.departments d
                 where d.archived_at is null
                   and (d.id = s.department_id or d.parent_department_id = s.department_id)))
          or (s.seat = 'division_manager' and t.department_id in (
                select d.id from public.departments d
                 where d.archived_at is null and d.division_id = s.division_id))
          or (s.seat = 'chief_operations'))
      join public.team_memberships tm on tm.team_id = t.id
     where public.seat_is_live(s.effective_from, s.effective_to)
       and tm.user_id <> s.user_id
  ),
  visible as (
    select user_id from public.managed_people()
    union select auth.uid()
  )
  select distinct x.leader_id, x.member_id
    from (select * from led union select * from seated) x
    join measured l on l.user_id = x.leader_id
    join measured m on m.user_id = x.member_id
   where x.leader_id in (select user_id from visible)
     and x.member_id in (select user_id from visible)
$$;

grant execute on function public.leadership_scopes() to authenticated;
