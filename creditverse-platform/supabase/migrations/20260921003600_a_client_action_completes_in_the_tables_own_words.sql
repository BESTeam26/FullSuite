-- The action completes; the WORK does not.
--
-- `resolve_client_action` invented a status of 'responded' where the table
-- already had open / completed / cancelled / changes_requested. A sixth word
-- for a thing already named is how two vocabularies start.
--
-- 'completed' here means the CLIENT completed the thing they were asked to do.
-- That is a different object from a department status, where Dee's doctrine
-- forbids using Completed to clear a queue. The action really is finished when
-- the client answers; the credit work resumes at its origin status, which is
-- the opposite of finished.

create or replace function public.resolve_client_action(p_action uuid, p_response text default null)
returns jsonb
language plpgsql security definer set search_path = public as $function$
declare a public.partner_action_items%rowtype; v_is_client boolean; v_resumed text;
begin
  select * into a from public.partner_action_items where id = p_action;
  if a.id is null then raise exception 'No such action' using errcode = '42501'; end if;
  if a.audience <> 'client' then raise exception 'That is a partner action' using errcode = '22023'; end if;

  select exists (select 1 from public.fulfillment_clients fc
                   join public.clients cl on cl.id = fc.client_id
                  where fc.id = a.fulfillment_client_id and cl.portal_user_id = auth.uid())
    into v_is_client;
  if not (v_is_client or public.is_staff_of(a.agency_id)) then
    raise exception 'Not yours to answer' using errcode = '42501';
  end if;
  if a.status <> 'open' then
    /* Answering twice is a double click, not an error. */
    return jsonb_build_object('already', true, 'resumed', a.origin_status);
  end if;

  update public.partner_action_items
     set status = 'completed', responded_by = auth.uid(), responded_at = now(),
         response = p_response, updated_at = now()
   where id = p_action;

  /* Back to where it came from. Restoring the status re-runs the routing
     trigger, which reopens the origin department at its entry status — which
     is why nobody has to go hunting for the file (Dee, case 8). */
  if a.origin_status is not null then
    update public.fulfillment_clients set status = a.origin_status where id = a.fulfillment_client_id;
    v_resumed := a.origin_status::text;
  end if;

  perform public.log_audit('client.action_resolved', 'client_action', p_action::text,
    null, null, jsonb_build_object('resumed_to', v_resumed, 'by_client', v_is_client));
  return jsonb_build_object('already', false, 'resumed', v_resumed);
end $function$;
revoke all on function public.resolve_client_action(uuid, text) from public, anon;
grant execute on function public.resolve_client_action(uuid, text) to authenticated;
