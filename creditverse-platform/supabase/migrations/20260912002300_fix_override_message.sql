-- A stray character got into the override refusal message. The text a person
-- reads when they are stopped has to be clean.
create or replace function public.creditops_finalize_checklist(
  p_client uuid,
  p_department public.fulfillment_department,
  p_override_reason text default null
) returns text[]
language plpgsql security definer set search_path = public as $function$
declare
  v_outstanding text[];
  v_done text[];
  v_who text;
  c public.fulfillment_clients%rowtype;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null or not public.is_staff_of(c.agency_id) then
    raise exception 'Client not visible' using errcode = '42501';
  end if;

  select outstanding_required, completed into v_outstanding, v_done
    from public.creditops_completion_state(p_client, p_department);

  if coalesce(array_length(v_outstanding, 1), 0) > 0 then
    if nullif(btrim(coalesce(p_override_reason, '')), '') is null then
      raise exception 'Required work is not finished: %. Finish it, or report a blocker.',
        array_to_string(v_outstanding, ', ') using errcode = '22023';
    end if;
    if not public.agency_can('ops.manage') then
      raise exception 'Only a Team Lead or manager can complete work with required steps outstanding'
        using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_who from public.profiles where id = auth.uid();
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values
      (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(), v_who,
       'Completed with required work outstanding',
       array_to_string(v_outstanding, ', ') || ' — ' || btrim(p_override_reason),
       'checklist_override', array_to_string(v_outstanding, ', '), 'overridden', 'bes_internal');
  end if;

  update public.client_work_checklist
     set finalized_at = now()
   where client_id = p_client and department = p_department and done and finalized_at is null;

  return v_done;
end $function$;
revoke execute on function public.creditops_finalize_checklist(uuid, public.fulfillment_department, text) from public, anon;
grant execute on function public.creditops_finalize_checklist(uuid, public.fulfillment_department, text) to authenticated;
