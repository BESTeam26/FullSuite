-- A sent round waits thirty days, unassigned, then comes back for review.
--
-- Dee, 2026-09-22, on the credit status list:
--
--   "Too many redundant credit statuses. In dispute Mailed and round sent
--    awaiting results are the same, I need only the Actual Round 1-10 Sent a
--    that's automatically the waiting status. Remove assignee for these
--    status and automatically set their next due date to 30 days. Then After
--    30 days, sent their next status to Results available for review and
--    assign to the support team. Delete Ready for reimport/ Credit update as
--    this is duplicate."
--
-- ── TWO OF THE FOUR WERE ALREADY TRUE ─────────────────────────────────────
--
-- Every `Round N Sent` already routes as `kind = 'waiting'`, and the waiting
-- branch of `creditops_route_client` already clears the assignee
-- (`assignment_method = 'system_waiting_unassign'`). Nothing to change there;
-- recorded so nobody "fixes" it twice.
--
-- ── WHAT WAS MISSING: THE CLOCK ───────────────────────────────────────────
--
-- The only Dispute SLA policy was keyed on the status `Mailed`, which is not
-- in the Dispute vocabulary and which nothing writes. So a sent round had no
-- due date at all and `sla_sweep` never looked at it. The policy is re-keyed
-- onto `ROUND SENT - AWAITING RESULTS`, the status every `Round N Sent`
-- actually opens, at 720 hours.
--
-- ── AND WHERE IT LANDS ────────────────────────────────────────────────────
--
-- `sla_sweep` hard-coded the client status it returns to —
-- 'Ready for Reimport / Review' — and deliberately left the file unassigned
-- "so the Team Lead can rebalance". Dee wants a different destination and
-- wants it picked up, so the destination becomes configuration:
-- `on_expiry_client_status` and `on_expiry_assign`. Both default to today's
-- behaviour, so the Onboarding and Complaints policies are untouched.
--
-- The sweep does NOT move the department row to Support itself. Moving a row
-- between departments would collide with the Support row most of these
-- clients already have — `client_department_statuses` is keyed on
-- (client, department). Instead it sets the CLIENT status, and the routing
-- trigger does what it always does: `Results Available for Review` is already
-- mapped to Support with entry `READY FOR REIMPORT`, and the department's own
-- assignment mode picks the person. One engine, not a second hand-rolled move.

alter table public.sla_policies
  add column if not exists on_expiry_client_status public.fulfillment_client_status,
  add column if not exists on_expiry_assign boolean not null default false;

comment on column public.sla_policies.on_expiry_client_status is
  'The CLIENT status to set when the clock runs out. Null keeps the historical default, Ready for Reimport / Review (Dee, 2026-09-22).';
comment on column public.sla_policies.on_expiry_assign is
  'True lets the routing engine assign the file on expiry. False returns it unassigned for a lead to rebalance, which is the older behaviour.';

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
         routing trigger place it — see the header. */
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
             /* Unassigned unless the policy says the destination should pick
                it up; the routing trigger then assigns from the department. */
             assigned_agent_id = case when v_policy.on_expiry_assign then assigned_agent_id else null end,
             updated_at = now()
       where id = r.client_id;

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

-- ── The policy itself ─────────────────────────────────────────────────────
/* `Mailed` is not a Dispute status and nothing writes it, so the row was
   configuration for a state that cannot occur. Replaced, per agency, rather
   than a second row added beside it. */
delete from public.sla_policies where department = 'Dispute' and status = 'Mailed';

insert into public.sla_policies
  (agency_id, department, status, hours, waiting, label,
   on_expiry_status, on_expiry_department, on_expiry_client_status, on_expiry_assign)
select a.id, 'Dispute', 'ROUND SENT - AWAITING RESULTS', 720, true,
       'A sent round waits 30 days for the bureaus, then comes back for review',
       null, null, 'Results Available for Review', true
  from public.agencies a
on conflict do nothing;
