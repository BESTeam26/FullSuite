-- =============================================================================
-- One `creditops_route_client`, not two.
--
-- The previous migration added a second parameter WITH A DEFAULT, which
-- created an overload rather than replacing the function. Postgres then
-- refused every call from the triggers — "function is not unique" — and with
-- it every client insert and every status change.
--
-- Caught immediately by the acceptance probe, which is the whole reason it
-- runs against the live database rather than a mock. Live for under a minute.
--
-- The single-argument form is dropped; the trigger that used it now passes the
-- previous status explicitly.
-- =============================================================================

drop function if exists public.creditops_route_client(uuid);

/* The insert path has no previous status — the client did not have one. */
create or replace function public.creditops_route_on_insert()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  perform public.creditops_route_client(new.id, null);
  return null;
end $function$;
revoke execute on function public.creditops_route_on_insert() from public, anon, authenticated;

create or replace function public.creditops_backfill_routing()
returns table (clients int, departments_opened int, still_unassigned int)
language plpgsql security definer set search_path = public as $function$
declare
  v_client uuid; v_before int; v_after int;
begin
  if not public.agency_can('ops.manage') then
    raise exception 'Managing operations is required to backfill routing' using errcode = '42501';
  end if;
  select count(*) into v_before from public.client_department_statuses;
  clients := 0;
  for v_client in
    select id from public.fulfillment_clients
     where archived_at is null and coalesce(lifecycle, 'active') = 'active'
     order by created_at
  loop
    perform public.creditops_route_client(v_client, null);
    clients := clients + 1;
  end loop;
  select count(*) into v_after from public.client_department_statuses;
  departments_opened := v_after - v_before;
  select count(*) into still_unassigned from public.creditops_assignment_required;
  return next;
end $function$;
revoke execute on function public.creditops_backfill_routing() from public, anon;
grant execute on function public.creditops_backfill_routing() to authenticated;
