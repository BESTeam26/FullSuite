-- =============================================================================
-- The clock moves the work, so nobody has to remember.
--
-- Dee: "Do not rely on somebody checking a dashboard and moving these
-- manually." Three deterministic transitions, and only three — automation
-- where the rule is certain, and a human where it is a judgement:
--
--   ONBOARDING       a follow-up that runs out schedules the next one, up to
--                    three. After the third, the client is flagged for a Team
--                    Lead and NOTHING further is created. Never deleted,
--                    never archived, never a silent fourth attempt.
--
--   PROCESSING       unresolved past its escalation window becomes Priority
--                    Processing. Overdue at three days and escalated at five
--                    are different facts, and the entry date is preserved so
--                    the five days count from when the client actually
--                    started waiting.
--
--   WAITING          the 30-day dispute clock runs out and the file returns
--                    to review, UNASSIGNED, so the Team Lead rebalances. It is
--                    never handed back to the previous processor.
--
-- Runs hourly on pg_cron beside the sweeps already there. An hour is fine: no
-- rule here is finer-grained than a day, and a sweep that runs every minute is
-- a sweep whose cost nobody notices until it matters.
-- =============================================================================

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

    -- A repeating follow-up: next attempt, or a person.
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

    -- A waiting clock that has run out returns as actionable, unassigned.
    elsif v_policy.on_expiry_status is not null then
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

    -- Unresolved long enough to be a different state, not merely a late one.
    elsif v_policy.escalate_after_hours is not null
      and r.opened_at + make_interval(hours => v_policy.escalate_after_hours) <= now()
      and r.status is distinct from v_policy.escalate_to_status then
      update public.client_department_statuses
         set status = v_policy.escalate_to_status
             /* opened_at deliberately NOT reset: the five days count from when
                the client actually started waiting, and escalating must not
                erase how long that has been. */
       where client_id = r.client_id and department = r.department;
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

select cron.schedule('sla-sweep', '20 * * * *', 'select public.sla_sweep()');
