-- =============================================================================
-- Changing a work status must not unassign the person doing the work.
--
-- `set_client_department_status(client, department, status, assignee, note)`
-- takes the assignee as an OPTIONAL argument and then wrote it unconditionally:
--
--   on conflict ... do update set assignee_id = excluded.assignee_id
--
-- So every caller that changed only the status — which is every caller that
-- exists, and now the inline Work Status cell in the Main Client List — passed
-- null and silently cleared the assignment. Nothing in the interface said so,
-- and the row's own activity entry records the status change, not the erasure,
-- so the work would simply stop being anybody's.
--
-- Omitting the argument now means "leave the assignee alone", which is what
-- every caller already meant. Assigning and releasing are deliberate acts with
-- their own writers (`updateClientAssignee`, and the SLA's release-on-waiting)
-- — this function's job is the status.
-- =============================================================================

create or replace function public.set_client_department_status(
  p_client uuid, p_department public.fulfillment_department, p_status text, p_assignee uuid default null, p_note text default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  c        public.fulfillment_clients%rowtype;
  v_prev   text;
  v_status text := upper(trim(p_status));
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  if not (v_status = any (public.creditops_department_statuses(p_department))) then
    raise exception 'Unknown status % for %', p_status, p_department using errcode = '22023';
  end if;
  select status into v_prev from public.client_department_statuses where client_id = p_client and department = p_department;

  insert into public.client_department_statuses (client_id, department, status, assignee_id)
  values (p_client, p_department, v_status, p_assignee)
  on conflict (client_id, department) do update
    set status = excluded.status,
        /* Only when one was supplied. A status change is not an assignment
           change, and this argument's default is "no opinion", not "nobody". */
        assignee_id = coalesce(excluded.assignee_id, public.client_department_statuses.assignee_id),
        updated_at = now();

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(),
          'Department status', coalesce(p_note, p_department::text || ' → ' || v_status), 'department:' || p_department::text, v_prev, v_status,
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $$;

revoke execute on function public.set_client_department_status(uuid, public.fulfillment_department, text, uuid, text) from public, anon;
grant execute on function public.set_client_department_status(uuid, public.fulfillment_department, text, uuid, text) to authenticated;
