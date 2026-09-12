-- =============================================================================
-- Escalating must not erase how long somebody has been waiting.
--
-- Dee: "Preserve the original queue-entry date so the system knows how long
-- the client has actually been waiting. Do not reset the 5-day clock simply
-- because someone opens the client or changes the assignee."
--
-- The sweep's comment claimed it did not reset the anchor. The trigger
-- overrode it: any status change with no new `opened_at` restarts the clock,
-- and an escalation is a status change. So a client escalated at day five came
-- out reading day zero — the system forgetting the very fact that caused the
-- escalation.
--
-- An escalation is the SAME queue cycle continuing under a louder name, not a
-- new entry. There is no value the sweep could pass to say that, because
-- passing the old anchor is indistinguishable from passing nothing. So it says
-- so directly, with a transaction-local setting the trigger reads — the
-- standard way for a system action to declare itself without adding a column
-- that only one caller ever sets.
-- =============================================================================

create or replace function public.department_status_sla()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_prev_agent uuid;
begin
  select fc.agency_id, fc.assigned_agent_id
    into v_agency, v_prev_agent
    from public.fulfillment_clients fc where fc.id = new.client_id;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.opened_at is not distinct from old.opened_at
     /* An escalation continues the cycle it escalated; only a genuinely new
        workflow entry restarts the clock. */
     and coalesce(current_setting('bes.sla_keep_anchor', true), '') <> 'on' then
    new.opened_at := now();
    new.manual_due_at := null;
    new.manual_due_by := null;
    new.manual_due_set_at := null;
    new.manual_due_reason := null;
  end if;

  new.system_due_at := public.compute_department_due(
    v_agency, new.department, new.status, new.opened_at);

  if public.department_is_waiting(v_agency, new.department, new.status)
     and v_prev_agent is not null then
    update public.fulfillment_clients
       set assigned_agent_id = null, updated_at = now()
     where id = new.client_id;
  end if;

  return new;
end $function$;

create or replace function public.sla_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $function$
declare
  r record; v_policy public.sla_policies;
  v_followups int := 0; v_flagged int := 0; v_escalated int := 0; v_returned int := 0;
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

    elsif v_policy.on_expiry_status is not null then
      /* A new state genuinely begins here, so the clock SHOULD restart. */
      update public.client_department_statuses
         set status = v_policy.on_expiry_status,
             department = coalesce(v_policy.on_expiry_department, r.department),
             opened_at = now(), cycle_number = 1
       where client_id = r.client_id and department = r.department;
      update public.fulfillment_clients
         set status = 'Ready for Reimport / Review', assigned_agent_id = null, updated_at = now()
       where id = r.client_id;
      insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_name, action, detail, visibility)
      values (r.agency_id, 'client', r.client_id::text, 'BES', 'Back for review',
              'The 30-day wait is up. Returned unassigned so the Team Lead can rebalance.',
              'bes_internal');
      v_returned := v_returned + 1;

    elsif v_policy.escalate_after_hours is not null
      and r.opened_at + make_interval(hours => v_policy.escalate_after_hours) <= now()
      and r.status is distinct from v_policy.escalate_to_status then
      /* The same cycle, escalated. The anchor is the point. */
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
revoke execute on function public.sla_sweep() from public, anon, authenticated;
