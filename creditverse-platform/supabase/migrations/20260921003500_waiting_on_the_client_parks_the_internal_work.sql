-- Waiting on the client parks the internal work. It does not finish it.
--
-- Dee's doctrine, case 4: "For Client Confirmation → internal actionable queue
-- hidden, client portal action visible."
--
-- This is an EXPLICIT transition rule, which is the only kind she allows. It
-- is not the generic "another department opened, so close the last one" she
-- rejected — that suppressed work nobody was waiting on. Here BES is
-- genuinely waiting on somebody outside the building, so no internal queue
-- should be holding the file at all.
--
-- Parked, never completed. `WAITING ON CLIENT` is open, keeps the department
-- row and its history, and is not actionable. The same shape as ROUND SENT -
-- AWAITING RESULTS, where the clock is the bureau's rather than the client's.
--
-- Coming back is `resolve_client_action`: it restores the origin status, which
-- re-runs routing and reopens the origin department at its entry status.

create or replace function public.client_confirmation_raises_portal_action() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_action uuid;
begin
  if new.status = 'For Client Confirmation' and old.status is distinct from new.status then
    v_action := public.raise_client_action(
      new.id, 'client_confirmation',
      'Please confirm so we can continue',
      'Your file is paused until you confirm. Once you do, we pick it straight back up.',
      old.status);

    /* Every department that still thought it had work now knows it is waiting
       on the client. Unassigned too: holding an assignment on a file nobody
       inside BES can move is how a workload looks busier than it is. */
    update public.client_department_statuses
       set status = 'WAITING ON CLIENT', assignee_id = null,
           assignment_method = 'system_waiting_unassign', assigned_at = now(), updated_at = now()
     where client_id = new.id
       and public.creditops_status_is_actionable(department, status);
  end if;
  return null;
end $function$;

comment on function public.client_confirmation_raises_portal_action() is
  'For Client Confirmation raises the portal action and parks every actionable department at WAITING ON CLIENT — open, unassigned, not completed (Dee, 2026-09-21, case 4).';
