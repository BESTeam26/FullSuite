-- P-037: a new client's chosen agent survives routing.
--
-- Inserting a client WITH an assigned agent opened its first department row
-- unassigned (team-lead mode) or auto-picked somebody else, and
-- creditops_refresh_headline then set fulfillment_clients.assigned_agent_id
-- to that — the human's choice was silently erased. Found by the full gate
-- (phase 37 went 0:0) after New Client began routing to Client Success,
-- whose mode is team_lead; reproduced as Dee with a real agent. Rule: on
-- insert only, an explicit assignee seeds the first department record as a
-- manual_override. Generated from the live definition; one branch added.

CREATE OR REPLACE FUNCTION public.creditops_route_client(p_client uuid, p_previous_status fulfillment_client_status DEFAULT NULL::fulfillment_client_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.fulfillment_clients%rowtype;
  r public.creditops_status_routing%rowtype;
  v_mode text;
  v_existing public.client_department_statuses%rowtype;
  v_pick uuid;
  v_keep boolean := false;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then return; end if;
  if coalesce(c.lifecycle, 'active') <> 'active' or c.archived_at is not null then return; end if;

  select * into r from public.creditops_status_routing where status = c.status;
  if not found then
    perform public.log_audit('creditops.routing_unmapped', 'fulfillment_client', p_client::text,
      c.organization_id, null, jsonb_build_object('status', c.status));
    return;
  end if;

  if r.kind = 'terminal' then
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;

  if r.kind = 'partner_action' then
    update public.client_department_statuses
       set assignee_id = null, assignment_method = 'partner_action', assigned_at = now()
     where client_id = p_client and assignee_id is not null
       and public.creditops_status_is_actionable(department, status);
    perform public.raise_partner_action(p_client, 'partner_confirmation', null, null, p_previous_status);
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;

  /* Any OPEN row — waiting included, because waiting is when this fires. */
  if r.closes_department is not null then
    update public.client_department_statuses
       set status = 'COMPLETED', assignee_id = null,
           assignment_method = 'handoff', assigned_at = now(), updated_at = now()
     where client_id = p_client and department = r.closes_department
       and upper(btrim(status)) not in (
         'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
         'SUPPORT RESOLVED', 'OB READY FOR R1', 'PARTNER ENDORSED',
         'COMPLETED', 'ARCHIVED / INACTIVE');
  end if;

  select * into v_existing from public.client_department_statuses
   where client_id = p_client and department = r.department;

  if r.kind = 'waiting' then
    insert into public.client_department_statuses (client_id, department, status, assignee_id, assignment_method, assigned_at)
    values (p_client, r.department, r.entry_status, null, 'system_waiting_unassign', now())
    on conflict (client_id, department) do update
      set status = excluded.status, assignee_id = null,
          assignment_method = 'system_waiting_unassign', assigned_at = now(), updated_at = now();
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;

  select d.assignment_mode into v_mode
    from public.departments d
   where d.agency_id = c.agency_id and d.division = 'creditops' and d.archived_at is null
     and d.key = case r.department
                   when 'Onboarding' then 'onboarding' when 'Dispute' then 'dispute'
                   when 'Support' then 'support' when 'Complaints' then 'complaints'
                   when 'Bureau Calling' then 'bureau_calling' end;
  v_mode := coalesce(v_mode, 'auto_equal');

  if v_existing.client_id is not null and v_existing.assignee_id is not null
     and public.creditops_status_is_actionable(v_existing.department, v_existing.status)
  then v_keep := true; end if;

  if v_keep then v_pick := v_existing.assignee_id;
  /* A NEW file that arrives with an agent already named keeps that agent: a
     person chose, and a choice beats distribution — the same 'manual_override'
     the assignment menu writes. Routing on insert used to ignore the column,
     open the first department unassigned, and the headline refresh then
     erased the chosen agent (P-037, 2026-09-21). Only on insert: a later
     status change follows the department's own rule as before. */
  elsif p_previous_status is null and v_existing.client_id is null and c.assigned_agent_id is not null
     then v_pick := c.assigned_agent_id;
  elsif v_mode = 'team_lead' then v_pick := null;
  else v_pick := public.creditops_pick_assignee(r.department, c.agency_id);
  end if;

  insert into public.client_department_statuses (client_id, department, status, assignee_id, assignment_method, assigned_at)
  values (p_client, r.department, r.entry_status, v_pick,
          case when v_keep then v_existing.assignment_method
               when p_previous_status is null and v_existing.client_id is null and c.assigned_agent_id is not null then 'manual_override'
               when v_mode = 'team_lead' then 'team_lead'
               when v_pick is null then null else 'automatic' end,
          case when v_keep then v_existing.assigned_at else now() end)
  on conflict (client_id, department) do update
    set status = case
          when public.creditops_status_is_actionable(public.client_department_statuses.department,
                                                     public.client_department_statuses.status)
          then public.client_department_statuses.status else excluded.status end,
        assignee_id = excluded.assignee_id,
        assignment_method = excluded.assignment_method,
        assigned_at = excluded.assigned_at,
        updated_at = now();

  update public.partner_action_items
     set status = 'cancelled', cancelled_reason = 'The file moved on', updated_at = now()
   where fulfillment_client_id = p_client and status = 'open' and kind = 'partner_confirmation';

  perform public.creditops_refresh_headline(p_client);
end $function$;
