-- Payroll scope comes from the seat, never from the admin role (Dee,
-- 2026-10-01, correcting 20261001013000 the same day):
--
--   "Do not treat agency_admin as Executive. Agency Admin is an access role,
--    not an organizational management level. Executive / organization-wide
--    payroll scope must come from the person's actual management seat or
--    explicit executive capability."
--
--   Team Lead                     → own team's agent payroll
--   Department Lead               → own department (department_manager seat)
--   Division Lead                 → own division (division_manager seat)
--   Chief Operations / Executive  → organization-wide (chief_operations seat,
--                                   or the explicit payroll capability — which
--                                   an owner holds by definition)
--   Agent                         → own released payroll only
--
-- Placement is `managed_teams()`: the teams the caller leads plus every team
-- in a department or division they hold a seat for. Nothing here reads
-- `is_admin_of`, `is_manager_of`, `has_operations_scope` (which folds the
-- admin role in) or `managed_people()` (whose workforce-record branch also
-- folds the admin role in). An admin with no seat and no team has no payroll.
--
-- The BES side is untouched: the column revokes, the three *_internal views,
-- the settlement view and the managing-partner guard in
-- set_compensation_arrangement all still answer to compensation.bes_cost.view.

/* A live chief_operations seat — and only that. `has_operations_scope()` is
   not used here because it also answers true for the admin role. */
create or replace function public.holds_operations_seat(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.management_seats s
     where s.user_id = auth.uid() and s.agency_id = p_agency and s.seat = 'chief_operations'
       and public.seat_is_live(s.effective_from, s.effective_to))
$$;

create or replace function public.payroll_people()
returns table(user_id uuid)
language sql stable security definer set search_path = public as $$
  /* Organization-wide: the explicit payroll capability or the operations seat. */
  select m.user_id
    from public.agency_memberships m
   where m.status = 'active'
     and (public.reads_payroll_of(m.agency_id) or public.holds_operations_seat(m.agency_id))
  union
  /* Placement: the people on the teams the caller leads or holds a seat over.
     Never the caller — their own pay is the released-payslip self branch. */
  select tm.user_id
    from public.team_memberships tm
   where tm.user_id <> auth.uid()
     and tm.team_id in (select public.managed_teams())
$$;

create or replace function public.has_payroll_scope(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff_of(p_agency)
     and (public.reads_payroll_of(p_agency)
          or public.holds_operations_seat(p_agency)
          or exists (select 1 from public.managed_teams()))
$$;

create or replace function public.manages_agent_payroll_of(p_agency uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff_of(p_agency)
     and (public.reads_payroll_of(p_agency)
          or public.holds_operations_seat(p_agency)
          or exists (select 1 from public.team_memberships tm
                      where tm.user_id = p_user and tm.user_id <> auth.uid()
                        and tm.team_id in (select public.managed_teams())))
$$;

grant execute on function public.holds_operations_seat(uuid) to authenticated;
