-- Dee, 2026-09-20: "everyone that has no start date, make them Sept 01 2026."
-- The three the roster did not cover — Archie Carlos, Alliana Catcha and the
-- Tech Support login. They take the numbers after the fifteen already issued,
-- because a permanent agent number is never reshuffled once given.
do $$
declare v_agency uuid; n integer; r record;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  select coalesce(max(agent_number), 0) into n from public.agency_memberships
   where agency_id = v_agency and agent_number is not null and agent_number < 900;
  perform set_config('bes.employee_code_recompute', 'on', true);
  for r in
    select m.id from public.agency_memberships m join public.profiles p on p.id = m.user_id
     where m.agency_id = v_agency and coalesce(p.is_fixture, false) = false and m.hired_on is null
     order by m.created_at, m.id
  loop
    n := n + 1;
    update public.agency_memberships m
       set hired_on = date '2026-09-01', agent_number = n,
           employee_code = public.agent_id_for(m.user_id, date '2026-09-01', n)
     where m.id = r.id;
  end loop;
  perform set_config('bes.employee_code_recompute', 'off', true);
end $$;
do $$
declare v_missing int; v_dupe int;
begin
  select count(*) into v_missing from public.agency_memberships m join public.profiles p on p.id = m.user_id
   where coalesce(p.is_fixture, false) = false and m.employee_code is null;
  if v_missing > 0 then raise exception '% team members still have no Agent ID', v_missing; end if;
  select count(*) into v_dupe from (select employee_code from public.agency_memberships
    where employee_code is not null group by agency_id, employee_code having count(*) > 1) d;
  if v_dupe > 0 then raise exception '% duplicate Agent IDs', v_dupe; end if;
end $$;
