-- "Endorsed to Client" is a credit status (part 2 of 2: what it does).
--
-- Dee, 2026-10-15: "Endorsed to client will remove the responsibility to the
-- team, and will show to client portal as their something needed action."
--
-- Twenty-three ClickUp files whose source status was "endorsed to client"
-- had been imported as Program Completed (lifecycle program_completed). They
-- are not complete; Dee saw Shanika Dessalines reading "Program Completed"
-- with no open work and could not reopen her. They move to the new status.
--
-- What the status does, through the one routing engine (creditops_route_client):
--   - a new routing kind, client_action: no BES department, no entry status;
--   - every open department row takes its department's own closed status
--     (assignment_method client_action), so the file leaves every queue and
--     every "my work" list; history stays;
--   - one client-audience action item (kind endorsed_to_client) is raised,
--     carrying the status the file came from, so a client answer brings the
--     file back through routing exactly as For Client Confirmation does;
--   - the client stays lifecycle active (not completed, not archived).
--
-- Cost impact: none.

begin;

alter table public.creditops_status_routing drop constraint if exists creditops_status_routing_kind_check;
alter table public.creditops_status_routing add constraint creditops_status_routing_kind_check
  check (kind = any (array['actionable','waiting','partner_action','client_action','terminal']));
alter table public.creditops_status_routing drop constraint if exists routing_department_matches_kind;
alter table public.creditops_status_routing add constraint routing_department_matches_kind
  check ((kind in ('actionable','waiting') and department is not null and entry_status is not null)
      or (kind = 'terminal' and entry_status is null)
      or (kind in ('partner_action','client_action') and department is null and entry_status is null));

alter table public.client_department_statuses drop constraint if exists client_department_statuses_assignment_method_check;
alter table public.client_department_statuses add constraint client_department_statuses_assignment_method_check
  check (assignment_method is null or assignment_method = any (array[
    'automatic','team_lead','manual_override','handoff','system_waiting_unassign','partner_action','client_action']));

alter table public.partner_action_items drop constraint if exists partner_action_items_kind_check;
alter table public.partner_action_items add constraint partner_action_items_kind_check
  check (kind = any (array['partner_confirmation','document_required','question','information_request',
                           'content_approval','campaign_approval','client_confirmation','monitoring_login',
                           'endorsed_to_client']));

insert into public.creditops_status_routing (status, department, kind, entry_status, note)
values ('Endorsed to Client', null, 'client_action', null,
        'Handed to the client: no BES department holds it, every open row closes, the client portal shows the action (Dee, 2026-10-15).')
on conflict (status) do update
  set department = excluded.department, kind = excluded.kind, entry_status = excluded.entry_status, note = excluded.note;

create or replace function public.creditops_route_client(
  p_client uuid,
  p_previous_status public.fulfillment_client_status default null
) returns void language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  r public.creditops_status_routing%rowtype;
  v_mode text;
  v_existing public.client_department_statuses%rowtype;
  v_pick uuid;
  v_keep boolean := false;
  b record;
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
  /* Endorsed to the client (Dee, 2026-10-15): "removes the responsibility
     from the team, and shows in the client portal as something they need to
     act on." Every open department row takes its department's own closed
     status — the file leaves every queue, history kept — and one client
     action is raised. When the client answers, the action's origin status
     brings the file back through this same function. */
  if r.kind = 'client_action' then
    update public.client_department_statuses
       set status = public.creditops_closed_status_for(department),
           assignee_id = null, assignment_method = 'client_action', assigned_at = now(), updated_at = now()
     where client_id = p_client
       and public.creditops_status_is_actionable(department, status);
    perform public.raise_client_action(p_client, 'endorsed_to_client',
      'Your file has been handed to you',
      'Blessed Empire Services has done what it can on this file for now. Please review it and tell us how you would like to continue.',
      p_previous_status);
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

  /* Readiness means everything is resolved: every blocker on the file goes,
     and the history says so, row by row (Dee, 2026-10-15). */
  if r.clears_blockers then
    for b in
      select s.department, s.blocked_reason, s.blocked_by
        from public.client_department_statuses s
       where s.client_id = p_client and s.blocked_reason is not null
    loop
      insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
      values (c.agency_id, 'fulfillment_client', p_client::text, auth.uid(),
              coalesce((select full_name from public.profiles where id = auth.uid()), 'System'),
              'Blocker cleared', 'blocker:' || b.department::text, b.blocked_reason,
              'Cleared: the file is ' || c.status::text, 'bes_internal');
    end loop;
    update public.client_department_statuses
       set blocked_reason = null, blocked_by = null, blocked_at = null, updated_at = now()
     where client_id = p_client and blocked_reason is not null;
  end if;

  /* Any OPEN row of the department this status closes — actionable or
     waiting — takes that department's own closed status. A row already
     closed keeps the moment it finished. */
  if r.closes_department is not null then
    update public.client_department_statuses
       set status = public.creditops_closed_status_for(r.closes_department),
           assignee_id = null, assignment_method = 'handoff', assigned_at = now(), updated_at = now()
     where client_id = p_client and department = r.closes_department
       and upper(btrim(status)) not in (
         'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
         'SUPPORT RESOLVED', 'OB READY FOR R1', 'ONBOARDING READY FOR ROUND 1', 'PARTNER ENDORSED',
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
  elsif v_mode = 'team_lead' then v_pick := null;
  else v_pick := public.creditops_pick_assignee(r.department, c.agency_id);
  end if;
  insert into public.client_department_statuses (client_id, department, status, assignee_id, assignment_method, assigned_at)
  values (p_client, r.department, r.entry_status, v_pick,
          case when v_keep then v_existing.assignment_method
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

/* The twenty-three. Through the status column, so the routing trigger does
   exactly what it will do for the next one; the lifecycle trigger reopens
   them. Their origin is unknown (Program Completed was the import's guess),
   so the raised action is flagged for routing review rather than pointing
   the client's answer back at "Program Completed". */
do $$
declare v_n int;
begin
  update public.fulfillment_clients
     set status = 'Endorsed to Client'
   where archived_at is null
     and status = 'Program Completed'
     and source_status = 'endorsed to client';
  get diagnostics v_n = row_count;
  update public.partner_action_items a
     set origin_status = null, origin_department = null, needs_routing_review = true
    from public.fulfillment_clients c
   where c.id = a.fulfillment_client_id and a.kind = 'endorsed_to_client' and a.status = 'open'
     and c.source_status = 'endorsed to client' and a.origin_status = 'Program Completed';
  raise notice 'Endorsed to Client: % files moved off Program Completed', v_n;
end $$;

commit;
