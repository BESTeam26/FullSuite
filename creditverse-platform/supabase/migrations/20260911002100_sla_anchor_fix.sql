-- =============================================================================
-- Two corrections found by the acceptance probes.
--
-- 1. THE ANCHOR WAS BEING CLOBBERED. The trigger set `opened_at := now()`
--    whenever the status changed, which threw away the date the caller had
--    just supplied. So "mailed on 1 September" recorded 11 September and the
--    due date came out ten days late — the exact class of error this engine
--    exists to remove. It now restarts the clock only when the caller did NOT
--    say when: an explicit moment is a correction being applied, and a bare
--    status change is work beginning now.
--
-- 2. THE UNASSIGN NOTE WAS DUPLICATE. Clearing the agent already writes an
--    "Assignee changed" entry, from the activity trigger that logs every
--    assignee change. Adding a second row for the same fact gave the timeline
--    two entries for one event, and two records of one truth is the thing this
--    codebase keeps refusing elsewhere. The clearing still happens and is
--    still on the record — through the trigger that owns that job.
-- =============================================================================

create or replace function public.department_status_sla()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_prev_agent uuid;
begin
  select fc.agency_id, fc.assigned_agent_id
    into v_agency, v_prev_agent
    from public.fulfillment_clients fc where fc.id = new.client_id;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.opened_at is not distinct from old.opened_at then
    /* The status moved and nobody said when, so the clock starts now. An
       explicit opened_at survives: that is a correction being applied. */
    new.opened_at := now();
    new.manual_due_at := null;
    new.manual_due_by := null;
    new.manual_due_set_at := null;
    new.manual_due_reason := null;
  end if;

  new.system_due_at := public.compute_department_due(
    v_agency, new.department, new.status, new.opened_at);

  /* A waiting stage holds no agent: nobody should carry work for thirty days
     that they cannot act on. The partner, the team and the Lead Account
     Manager are untouched — only the temporary operational assignment, and
     the activity trigger on that table records the change. */
  if public.department_is_waiting(v_agency, new.department, new.status)
     and v_prev_agent is not null then
    update public.fulfillment_clients
       set assigned_agent_id = null, updated_at = now()
     where id = new.client_id;
  end if;

  return new;
end $function$;
