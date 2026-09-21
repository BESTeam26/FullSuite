-- Routing "For Client Confirmation", and the three states kept apart.
--
-- Dee's doctrine names three things that must never collapse into one:
--
--   actionable internally   BES has work now
--   waiting externally      BES is waiting on a bureau or the client
--   completed               the work is finished
--
-- `WAITING ON CLIENT` joins the department statuses that are OPEN but whose
-- clock belongs to somebody else — beside ROUND SENT - AWAITING RESULTS,
-- which is the bureau's clock. Neither is Completed. Both leave the active
-- queue and both keep their department row and its history.

insert into public.creditops_status_routing (status, department, kind, entry_status, note)
values ('For Client Confirmation', 'Support', 'waiting', 'WAITING ON CLIENT',
        'Waiting on the client. Raises a portal action; the file returns to its origin status when they answer.')
on conflict (status) do update
  set department = excluded.department, kind = excluded.kind,
      entry_status = excluded.entry_status, note = excluded.note;

/* The department status is open, but the clock is the client's. */
create or replace function public.creditops_status_is_actionable(p_department fulfillment_department, p_status text)
returns boolean language sql immutable set search_path = public as $function$
  select upper(trim(p_status)) not in (
    -- closed: nothing open for this department
    'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
    'SUPPORT RESOLVED', 'OB READY FOR R1', 'PARTNER ENDORSED',
    'COMPLETED', 'ARCHIVED / INACTIVE',
    -- open, but the clock belongs to somebody else
    'ROUND SENT - AWAITING RESULTS', 'WAITING FOR PARTNER APPROVAL',
    'WAITING CLIENT RESPONSE', 'WAITING ON CLIENT', 'CM AWAITING RESPONSE',
    'MONITORING PENDING', 'DOCS PENDING'
  )
$function$;

/**
 * Setting the status to "For Client Confirmation" raises the portal action.
 *
 * The PREVIOUS status is what the file returns to, which only a trigger knows
 * — by the time anything else looks, the status has already changed. Same
 * reason `creditops_route_on_status` passes the old status along.
 */
create or replace function public.client_confirmation_raises_portal_action() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if new.status = 'For Client Confirmation' and old.status is distinct from new.status then
    perform public.raise_client_action(
      new.id, 'client_confirmation',
      'Please confirm so we can continue',
      'Your file is paused until you confirm. Once you do, we pick it straight back up.',
      old.status);
  end if;
  return null;
end $function$;

drop trigger if exists fulfillment_clients_client_confirmation on public.fulfillment_clients;
create trigger fulfillment_clients_client_confirmation
  after update of status on public.fulfillment_clients
  for each row execute function public.client_confirmation_raises_portal_action();

comment on trigger fulfillment_clients_client_confirmation on public.fulfillment_clients is
  'For Client Confirmation raises the client-portal action, carrying the PREVIOUS status as where to resume (Dee, 2026-09-21).';
