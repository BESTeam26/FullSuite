-- The Agent ID backfill Dee approved on 2026-09-20, after reviewing the
-- before/after mapping in full.
--
--     [FIRST INITIAL][LAST INITIAL][MMDDYY]-[PERMANENT NUMBER]
--
-- Numbers are allocated by canonical hire date, oldest first, with the
-- membership id as the tie-break — and then they are FIXED. From here the
-- number belongs to the person: correcting a hire date rewrites only the
-- date segment, and nobody else moves.
--
-- Nobody without a canonical hire date is given one. Archie Carlos, Alliana
-- Catcha and the Tech Support login keep no Agent ID until Dee supplies
-- their real start dates; the interface shows them as a setup exception
-- rather than inventing a date from when their account happened to be made.
--
-- Two passes because the code is unique per agency: clear, then write.

do $$
declare v_agency uuid; n integer := 0; r record;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  perform set_config('bes.employee_code_recompute', 'on', true);

  update public.agency_memberships m set employee_code = null, agent_number = null
    from public.profiles p
   where p.id = m.user_id and m.agency_id = v_agency and coalesce(p.is_fixture, false) = false;

  for r in
    select m.id from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.agency_id = v_agency and coalesce(p.is_fixture, false) = false and m.hired_on is not null
     order by m.hired_on, m.id
  loop
    n := n + 1;
    update public.agency_memberships m
       set agent_number = n,
           employee_code = public.agent_id_for(m.user_id, m.hired_on, n)
     where m.id = r.id;
  end loop;

  perform set_config('bes.employee_code_recompute', 'off', true);
  raise notice 'Agent IDs issued: %', n;
end $$;

/* The proof, in the migration itself: no duplicates, and nobody without a
   hire date carries an ID. A failure here rolls the backfill back. */
do $$
declare v_dupe int; v_invented int;
begin
  select count(*) into v_dupe from (
    select employee_code from public.agency_memberships
     where employee_code is not null group by agency_id, employee_code having count(*) > 1) d;
  if v_dupe > 0 then raise exception 'Backfill produced % duplicate Agent IDs', v_dupe; end if;
  select count(*) into v_invented from public.agency_memberships m join public.profiles p on p.id = m.user_id
   where coalesce(p.is_fixture, false) = false and m.hired_on is null and m.employee_code is not null;
  if v_invented > 0 then raise exception '% people have an Agent ID with no hire date', v_invented; end if;
end $$;
