-- Ready for Processing closes Onboarding and clears every blocker on the file.
--
-- Dee, 2026-10-15, on Leslie Caudillo Zamora's file (credit status Ready for
-- Round 1, Current Work still "Onboarding · INCOMPLETE ONBOARDING"): "THIS IS
-- CONFUSING. Set a rule that once the client is set to Ready for Processing
-- or Ready for Round 1, remove all blockers and move the status from
-- Onboarding Incomplete to Onboarding completed or issue resolved. Ready for
-- Processing is a trigger that everything is resolved and we close all other
-- tasks' blockers for the client file."
--
-- The engine already has the shape: a credit status may name the department
-- it CLOSES (creditops_status_routing.closes_department — the Dispute
-- reimport uses it). Onboarding never had that rule, so the Onboarding row
-- stayed open and actionable after the file moved on, in both queues at
-- once. Two rows and one word fix the rule; the function gets two corrections
-- it needed anyway:
--
--   1. Ready for Processing, Ready for Round 1 and Prio Processing CLOSE
--      Onboarding (rows in the routing table, not code).
--   2. A closed department takes ITS OWN closed status
--      (creditops_closed_status_for: Onboarding → ONBOARDING READY FOR
--      ROUND 1, Dispute → COMPLETED) instead of the literal 'COMPLETED', which
--      is not in Onboarding's vocabulary; and a row already closed is left
--      alone (the skip list had the retired spelling only).
--   3. Those three statuses also CLEAR EVERY BLOCKER on the file — Dee's
--      "everything is resolved" — as a flag on the routing row
--      (clears_blockers), with one activity event per cleared blocker so the
--      history says who reported it and that the file's readiness cleared it.
--
-- Support, Complaints and Bureau Calling rows are NOT closed by this: the
-- queue doctrine (CLAUDE.md §23) keeps a department live while it has real
-- work, and Dee's rule names Onboarding. Say so if that should change.
--
-- Backfill: files already in one of the three statuses with an open
-- Onboarding row (four on 2026-10-15, Leslie among them) are closed the same
-- way, through the same function, so history is written the same way.
--
-- Cost impact: none.

alter table public.creditops_status_routing
  add column if not exists clears_blockers boolean not null default false;
comment on column public.creditops_status_routing.clears_blockers is
  'Entering this status clears every blocker on the file: readiness means everything is resolved (Dee, 2026-10-15).';

update public.creditops_status_routing
   set closes_department = 'Onboarding', clears_blockers = true
 where status in ('Ready for Processing', 'Ready for Round 1', 'Prio Processing');

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

/* Files already past onboarding with the Onboarding row still open: run the
   same rule through the same function, so history is written the same way. */
do $$
declare r record; v_n int := 0;
begin
  for r in
    select c.id
      from public.fulfillment_clients c
      join public.client_department_statuses s on s.client_id = c.id and s.department = 'Onboarding'
     where c.archived_at is null
       and c.status in ('Ready for Processing', 'Ready for Round 1', 'Prio Processing')
       and public.creditops_status_is_actionable('Onboarding', s.status)
  loop
    perform public.creditops_route_client(r.id, null);
    v_n := v_n + 1;
  end loop;
  raise notice 'Onboarding closed on % files already ready for processing', v_n;
end $$;
