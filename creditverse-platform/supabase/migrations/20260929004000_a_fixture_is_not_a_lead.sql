-- A fixture is not a lead.
--
-- Found by verifying 20260929003000 at every rung: Allyssa's and Daniel's
-- department reports routed to "[TEST] Cora Manager (BES Manager)", and the
-- CreditOps division report named her as its lead.
--
-- Cora is the division-manager persona of the RLS security matrix. She holds
-- a real `division_manager` seat on CreditOps so the matrix can prove what a
-- division manager may and may not see. That is correct and must stay. What
-- is not correct is a real person's end-of-day report being addressed to her
-- inbox because the seat lookup did not ask whether the seat-holder is a
-- fixture.
--
-- Every real list in this system excludes fixtures — the client list, the
-- partner list, the roster, `managed_people()`. Seat resolution for routing
-- and for the report's "lead" line now does too. With Cora excluded,
-- CreditOps has NO live division manager, so a department report there is
-- `unrouted` and goes to support with the reason attached — which is the
-- truth, and the thing Dee needs to know.
--
-- Cost impact: none.

begin;

create or replace function public.eod_route_up_for(p_employee uuid)
returns table(lead_id uuid, team_id uuid, team_name text, reason text, level text, scope_id uuid)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_agency uuid;
  v_team   record;
  v_dept   record;
  v_div    record;
  v_exec   uuid;
begin
  select m.agency_id into v_agency
    from public.agency_memberships m where m.user_id = p_employee and m.status = 'active' limit 1;

  select s.division_id, dv.name into v_div
    from public.management_seats s
    join public.divisions dv on dv.id = s.division_id and dv.archived_at is null
   where s.user_id = p_employee and s.seat = 'division_manager'
     and public.seat_is_live(s.effective_from, s.effective_to)
   order by s.effective_from desc limit 1;
  if v_div.division_id is not null then
    select s.user_id into v_exec
      from public.management_seats s
      join public.profiles p on p.id = s.user_id and coalesce(p.is_fixture, false) = false
     where s.agency_id = v_agency and s.seat in ('chief_operations', 'managing_partner')
       and s.user_id <> p_employee
       and public.seat_is_live(s.effective_from, s.effective_to)
     order by case s.seat when 'chief_operations' then 0 else 1 end limit 1;
    return query select v_exec, null::uuid, v_div.name,
                        case when v_exec is null then 'unrouted' else 'executive' end,
                        'division', v_div.division_id;
    return;
  end if;

  select s.department_id, d.name, d.division_id into v_dept
    from public.management_seats s
    join public.departments d on d.id = s.department_id and d.archived_at is null
   where s.user_id = p_employee and s.seat = 'department_manager'
     and public.seat_is_live(s.effective_from, s.effective_to)
   order by s.effective_from desc limit 1;
  if v_dept.department_id is not null then
    return query
      select s.user_id, null::uuid, v_dept.name,
             case when s.user_id is null then 'unrouted' else 'division_lead' end,
             'department', v_dept.department_id
        from (select null::uuid as user_id) z
        left join lateral (
          select s2.user_id from public.management_seats s2
            join public.profiles p on p.id = s2.user_id and coalesce(p.is_fixture, false) = false
           where s2.division_id = v_dept.division_id and s2.seat = 'division_manager'
             and s2.user_id <> p_employee
             and public.seat_is_live(s2.effective_from, s2.effective_to)
           order by s2.effective_from desc limit 1) s on true;
    return;
  end if;

  select t.id, t.name, t.department_id into v_team
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null and not t.is_fixture
   where tm.user_id = p_employee and tm.is_lead
   order by t.name limit 1;
  if v_team.id is not null then
    return query
      select s.user_id, v_team.id, v_team.name,
             case when s.user_id is null then 'unrouted' else 'department_lead' end,
             'team', v_team.id
        from (select null::uuid as user_id) z
        left join lateral (
          select s2.user_id from public.management_seats s2
            join public.profiles p on p.id = s2.user_id and coalesce(p.is_fixture, false) = false
           where s2.department_id = v_team.department_id and s2.seat = 'department_manager'
             and s2.user_id <> p_employee
             and public.seat_is_live(s2.effective_from, s2.effective_to)
           order by s2.effective_from desc limit 1) s on true;
    return;
  end if;

  return query
    select r.lead_id, r.team_id, r.team_name, r.reason, null::text, null::uuid
      from public.eod_route_for(p_employee) r;
end $$;

/* The report's own "lead" line, same rule. Only the three seat lookups
   change; the function is restated because it cannot be patched in place. */
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(oid) into v_src
    from pg_proc where proname = 'eod_report' and pronamespace = 'public'::regnamespace;

  /* Each seat lookup gains a fixture-excluding join. Guarded: if the text
     is not exactly as expected, stop rather than rewrite blind. */
  if (length(v_src) - length(replace(v_src, 'from public.management_seats s', '')))
       / length('from public.management_seats s') <> 3 then
    raise exception 'eod_report: expected exactly 3 seat lookups, refusing to patch blind';
  end if;

  v_new := replace(v_src,
    'from public.management_seats s',
    'from public.management_seats s join public.profiles sp_p on sp_p.id = s.user_id and coalesce(sp_p.is_fixture, false) = false');
  execute v_new;
end $$;

commit;
