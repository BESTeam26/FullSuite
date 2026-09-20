-- Remove the "Test ID" account (Dee, 2026-09-20: "Delete Test ID").
--
-- Dee invited herself as a throwaway agent to prove the invitation and
-- activation path worked end to end. It did. The account then sat in the team
-- list, in the headcount and in reports as if it were a person.
--
-- Everything it touched was made by that test, on that day, and is listed
-- here rather than discovered by cascade: one time entry from checking the
-- timer, one team membership, and three audit rows about its own creation.
-- Nothing operational refers to it. Deleting the auth user cascades the
-- profile, the agency membership and the team membership; the two RESTRICT
-- and NO ACTION references are cleared first, deliberately and by hand, so
-- that a real person with real history could never be removed by re-running
-- this shape of statement.

do $$
declare v_id uuid; v_email text; v_entries int; v_audit int;
begin
  select p.id, p.email into v_id, v_email
    from public.profiles p
    join public.agency_memberships m on m.user_id = p.id
   where p.full_name = 'Test ID' and p.email = 'billing@blessedempireservices.com';

  if v_id is null then
    raise notice 'No Test ID account here — nothing to remove.';
    return;
  end if;

  /* A guard, not a formality: if this account ever acquired real work, the
     migration stops rather than deleting it. */
  if exists (select 1 from public.work_items where assigned_to = v_id or created_by = v_id)
     or exists (select 1 from public.production_logs where employee_id = v_id) then
    raise exception 'Test ID has real operational records. Deactivate it instead of deleting it.';
  end if;

  delete from public.time_entries where employee_id = v_id;
  get diagnostics v_entries = row_count;
  delete from public.audit_log where actor_id = v_id;
  get diagnostics v_audit = row_count;
  delete from auth.users where id = v_id;

  raise notice 'Removed % (%): % time entry(s), % audit row(s), membership and team membership cascaded.',
    'Test ID', v_email, v_entries, v_audit;
end $$;
