-- Test clients never reach a real person's queue.
--
-- Found 2026-10-03 while running the security matrix: the hourly sweep that
-- gives unclaimed CreditOps work an owner (creditops_assign_unclaimed, cron
-- 'sla-sweep' at :20) chose from every unarchived client, test fixtures
-- included, and the picker chooses only real staff. On 2026-10-02 07:20 it
-- put "[TEST] Cleo Chan" (Complaints) in Archie Carlos's queue and
-- "[TEST] Alice Archer" (Support) in Nico Angelo Garcia's.
--
-- The sweep now skips fixture clients, and those two rows are released —
-- back to unassigned, the state they were in before the sweep, recorded as a
-- system release. Fixture clients exist only for the security matrix, which
-- runs inside rolled-back transactions; nothing real is unassigned here.
-- Dee, 2026-09-30: "test/fixture accounts can NEVER receive production work"
-- — this is the same rule in the other direction.
--
-- Cost impact: none.

begin;

CREATE OR REPLACE FUNCTION public.creditops_assign_unclaimed()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_pick record;
  v_assigned int := 0;
  v_gaps jsonb := '{}'::jsonb;
begin
  for r in
    select s.client_id, s.department, c.agency_id, c.outsourcing_group_id
      from public.client_department_statuses s
      join public.fulfillment_clients c on c.id = s.client_id
     where s.assignee_id is null
       and public.creditops_status_is_actionable(s.department, s.status)
       and c.archived_at is null
       and not c.is_fixture  -- test clients never reach a real person's queue
     order by
       (c.status::text = 'Prio Processing') desc,
       coalesce(s.manual_due_at, s.system_due_at) asc nulls last,
       s.opened_at asc
  loop
    select * into v_pick
      from public.creditops_pick_assignee_explained(
             r.department, r.agency_id, r.outsourcing_group_id, r.client_id);

    if v_pick.user_id is null then
      v_gaps := jsonb_set(v_gaps, array[r.department::text],
                          to_jsonb(coalesce((v_gaps ->> r.department::text)::int, 0) + 1));
      continue;
    end if;

    update public.client_department_statuses
       set assignee_id = v_pick.user_id,
           assigned_at = now(),
           assignment_method = 'automatic',
           assignment_reason = v_pick.reason
     where client_id = r.client_id and department = r.department
       and assignee_id is null;

    v_assigned := v_assigned + 1;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'unstaffed_departments', v_gaps);
end $function$;

update public.client_department_statuses s
   set assignee_id = null, assigned_at = now(), assignment_method = null,
       assignment_reason = 'Released: a test client is never assigned to real staff'
  from public.fulfillment_clients c, public.profiles p
 where c.id = s.client_id and c.is_fixture
   and p.id = s.assignee_id and not coalesce(p.is_fixture, false);

commit;
