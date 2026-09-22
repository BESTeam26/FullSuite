-- The expiry hop assigned every unassigned row on the client, not just its own.
--
-- 20260922007000 handed the file to somebody after the thirty-day wait, and
-- wrote the assignment as "any unassigned actionable row for this client".
-- That is wider than the hop. On 2026-09-22 it gave Jared Torres Acevedo's
-- COMPLAINTS row — `CFPB NEEDED`, unrelated to the round coming back — to a
-- Complaints agent, at the same moment it correctly gave the Support row to a
-- Support agent.
--
-- Complaints assigns from its own queue when its own work is picked up. A
-- round returning from the bureaus is not that moment, and quietly putting
-- somebody's name on unrelated work makes the load figures wrong and the
-- audit trail misleading.
--
-- The hop now assigns only the department the CLIENT STATUS routes to — the
-- one it just opened — read from `creditops_status_routing` rather than
-- guessed from what happens to be unassigned.

create or replace function public.sla_sweep() returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  r record; v_policy public.sla_policies;
  v_followups int := 0; v_flagged int := 0; v_escalated int := 0; v_returned int := 0;
  v_next public.fulfillment_client_status;
  v_dest public.fulfillment_department;
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

      /* Only the department this status routes to — the one the trigger just
         opened. Anything else on the client belongs to its own queue. */
      if v_policy.on_expiry_assign then
        select rt.department into v_dest
          from public.creditops_status_routing rt where rt.status = v_next;

        if v_dest is not null then
          update public.client_department_statuses s
             set assignee_id = public.creditops_pick_assignee(v_dest, r.agency_id),
                 assignment_method = 'automatic',
                 assigned_at = now()
           where s.client_id = r.client_id
             and s.department = v_dest
             and s.assignee_id is null
             and public.creditops_status_is_actionable(s.department, s.status)
             and public.creditops_pick_assignee(v_dest, r.agency_id) is not null;
        end if;
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

/* Put back the one row it should not have taken. It was unassigned before,
   and Complaints assigns from its own queue. */
update public.client_department_statuses s
   set assignee_id = null, assignment_method = null, assigned_at = null
  from public.fulfillment_clients c
 where c.id = s.client_id
   and s.department = 'Complaints'
   and s.assignment_method = 'automatic'
   and s.assigned_at > now() - interval '1 day'
   and c.status = 'Ready for Credit Review';
