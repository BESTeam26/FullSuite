-- On expiry, the file is handed to somebody — not left for a lead to notice.
--
-- 20260922006000 set the client status on expiry and let the routing trigger
-- open the destination department, which it did. Nobody was assigned, though,
-- because Client Success runs `assignment_mode = 'team_lead'`: a human picks.
-- That is a deliberate setting for work a lead distributes, and flipping the
-- whole department to auto would change every other route into Support.
--
-- Dee asked for this one hop specifically: *"After 30 days, sent their next
-- status to Results available for review and assign to the support team."* So
-- `on_expiry_assign` does what its name says and assigns for this transition
-- only, using the same least-loaded picker the auto departments use.
--
-- It assigns whichever department the routing actually opened, and only where
-- the row is unassigned and has real work — so it can never take a file off
-- somebody who already has it, and it never assigns a finished or waiting row.
-- If the destination team has nobody on it the picker returns null and the
-- file stays unassigned, which is the honest outcome rather than a fabricated
-- owner.

create or replace function public.sla_sweep() returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  r record; v_policy public.sla_policies;
  v_followups int := 0; v_flagged int := 0; v_escalated int := 0; v_returned int := 0;
  v_next public.fulfillment_client_status;
begin
  for r in
    select d.*, fc.agency_id, fc.name
      from public.client_department_statuses d
      join public.fulfillment_clients fc on fc.id = d.client_id
     where fc.archived_at is null
       and coalesce(d.manual_due_at, d.system_due_at) is not null
       and coalesce(d.manual_due_at, d.system_due_at) <= now()
       and not d.needs_lead_review
  loop
    v_policy := public.sla_policy_for(r.agency_id, r.department, r.status);

    if v_policy.max_cycles is not null then
      if r.cycle_number < v_policy.max_cycles then
        update public.client_department_statuses
           set cycle_number = r.cycle_number + 1, opened_at = now()
         where client_id = r.client_id and department = r.department;
        v_followups := v_followups + 1;
      else
        update public.client_department_statuses
           set needs_lead_review = true
         where client_id = r.client_id and department = r.department;
        insert into public.activity_events
          (agency_id, entity_type, entity_id, actor_name, action, detail, visibility)
        values (r.agency_id, 'client', r.client_id::text, 'BES',
                'Onboarding follow-up exhausted',
                coalesce(r.name, 'This client') || ' has had all '
                  || v_policy.max_cycles || ' onboarding follow-ups with no result. '
                  || 'A Team Lead decides what happens next — nothing has been archived.',
                'bes_internal');
        v_flagged := v_flagged + 1;
      end if;

    elsif v_policy.on_expiry_status is not null or v_policy.on_expiry_client_status is not null then
      v_next := coalesce(v_policy.on_expiry_client_status, 'Ready for Reimport / Review');

      /* Only when the policy names a department status. A policy that names
         only a CLIENT status leaves the department row alone and lets the
         routing trigger place it. */
      if v_policy.on_expiry_status is not null then
        /* A new state genuinely begins here, so the clock SHOULD restart. */
        update public.client_department_statuses
           set status = v_policy.on_expiry_status,
               department = coalesce(v_policy.on_expiry_department, r.department),
               opened_at = now(), cycle_number = 1
         where client_id = r.client_id and department = r.department;
      end if;

      update public.fulfillment_clients
         set status = v_next,
             assigned_agent_id = case when v_policy.on_expiry_assign then assigned_agent_id else null end,
             updated_at = now()
       where id = r.client_id;

      /* The routing trigger has now opened the destination. Give it an owner
         where the policy says so, even in a department a lead normally
         assigns by hand — this hop is the system's, not a lead's. */
      if v_policy.on_expiry_assign then
        update public.client_department_statuses s
           set assignee_id = public.creditops_pick_assignee(s.department, r.agency_id),
               assignment_method = 'sla_expiry',
               assigned_at = now()
         where s.client_id = r.client_id
           and s.assignee_id is null
           and public.creditops_status_is_actionable(s.department, s.status)
           and public.creditops_pick_assignee(s.department, r.agency_id) is not null;
      end if;

      insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_name, action, detail, visibility)
      values (r.agency_id, 'client', r.client_id::text, 'BES', 'Back for review',
              'The ' || (coalesce(v_policy.hours, 720) / 24) || '-day wait is up. Moved to '
                || v_next || case when v_policy.on_expiry_assign
                                  then ' and passed to the team that works it.'
                                  else ' unassigned so the Team Lead can rebalance.' end,
              'bes_internal');
      v_returned := v_returned + 1;

    elsif v_policy.escalate_after_hours is not null
      and r.opened_at + make_interval(hours => v_policy.escalate_after_hours) <= now()
      and r.status is distinct from v_policy.escalate_to_status then
      perform set_config('bes.sla_keep_anchor', 'on', true);
      update public.client_department_statuses
         set status = v_policy.escalate_to_status
       where client_id = r.client_id and department = r.department;
      perform set_config('bes.sla_keep_anchor', 'off', true);

      insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_name, action, detail,
         field, previous_value, new_value, visibility)
      values (r.agency_id, 'client', r.client_id::text, 'BES', 'Escalated to priority',
              coalesce(r.name, 'This client') || ' has been unresolved since '
                || to_char(r.opened_at, 'Mon DD') || '.',
              'work_status', r.status, v_policy.escalate_to_status, 'bes_internal');
      v_escalated := v_escalated + 1;
    end if;
  end loop;

  return jsonb_build_object('follow_ups', v_followups, 'flagged_for_lead', v_flagged,
                            'escalated', v_escalated, 'returned_for_review', v_returned);
end $function$;
