-- =============================================================================
-- Automatic assignment FILLS A GAP. It never replaces a person.
--
-- Surfaced by the backfill. The engine kept an existing assignee only while
-- that person was still on the department's team; otherwise it re-picked. With
-- the five CreditOps teams still empty, running the backfill over the live
-- clients would have cleared every assignee ClickUp brought across — Jezel,
-- Daniel, Karla, the lot — because nobody is "eligible" yet.
--
-- That is not a backfill problem to work around. It is the wrong rule, and
-- Dee had already written the right one twice:
--
--   §10 "Automatic assignment should happen when: actionable work enters a
--        department… an actionable record is Unassigned and requires
--        assignment."
--   §11 "Do NOT automatically steal/reassign their existing work just because
--        membership changes."
--
-- So the rule is simply: if actionable work already has an owner, the engine
-- leaves it alone. Moving it is a person's decision — a Team Lead reassigning,
-- or management rebalancing — and those are audited overrides.
--
-- The deliberate clears are untouched: a waiting stage and partner ownership
-- still release the individual, because in both the person genuinely cannot
-- act and must not be carrying the file in My Work.
-- =============================================================================

create or replace function public.creditops_route_client(p_client uuid)
returns void language plpgsql security definer set search_path = public as $function$
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

  if coalesce(c.lifecycle, 'active') <> 'active' or c.archived_at is not null then
    return;
  end if;

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
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;

  select * into v_existing from public.client_department_statuses
   where client_id = p_client and department = r.department;

  if r.kind = 'waiting' then
    insert into public.client_department_statuses (client_id, department, status, assignee_id, assignment_method, assigned_at)
    values (p_client, r.department, r.entry_status, null, 'system_waiting_unassign', now())
    on conflict (client_id, department) do update
      set status = excluded.status,
          assignee_id = null,
          assignment_method = 'system_waiting_unassign',
          assigned_at = now(),
          updated_at = now();
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;

  -- ── actionable ────────────────────────────────────────────────────────────
  select d.assignment_mode into v_mode
    from public.departments d
   where d.agency_id = c.agency_id and d.division = 'creditops' and d.archived_at is null
     and d.key = case r.department
                   when 'Onboarding'     then 'onboarding'
                   when 'Dispute'        then 'dispute'
                   when 'Support'        then 'support'
                   when 'Complaints'     then 'complaints'
                   when 'Bureau Calling' then 'bureau_calling'
                 end;
  v_mode := coalesce(v_mode, 'auto_equal');

  /* SOMEBODY ALREADY HAS IT → they keep it.
     Not "somebody eligible already has it". The engine fills gaps; it does not
     re-open settled ownership, and it must never quietly take a file off the
     person working it because a team roster changed (Dee, §10 and §11). */
  if v_existing.client_id is not null
     and v_existing.assignee_id is not null
     and public.creditops_status_is_actionable(v_existing.department, v_existing.status)
  then
    v_keep := true;
  end if;

  if v_keep then
    v_pick := v_existing.assignee_id;
  elsif v_mode = 'team_lead' then
    v_pick := null;
  else
    v_pick := public.creditops_pick_assignee(r.department, c.agency_id);
  end if;

  insert into public.client_department_statuses (client_id, department, status, assignee_id, assignment_method, assigned_at)
  values (p_client, r.department, r.entry_status, v_pick,
          case when v_keep then v_existing.assignment_method
               when v_mode = 'team_lead' then 'team_lead'
               when v_pick is null then null
               else 'automatic' end,
          case when v_keep then v_existing.assigned_at else now() end)
  on conflict (client_id, department) do update
    set status = case
          when public.creditops_status_is_actionable(public.client_department_statuses.department,
                                                     public.client_department_statuses.status)
          then public.client_department_statuses.status
          else excluded.status end,
        assignee_id = excluded.assignee_id,
        assignment_method = excluded.assignment_method,
        assigned_at = excluded.assigned_at,
        updated_at = now();

  perform public.creditops_refresh_headline(p_client);
end $function$;

comment on function public.creditops_route_client(uuid) is
  'Route one client: responsible department from creditops_status_routing, then that department''s assignment_mode. Fills unassigned actionable work only — an existing owner is never replaced automatically. Never closes another department''s work, never falls back to an admin (Dee, 2026-09-11/12).';

-- ── The backfill ────────────────────────────────────────────────────────────
/**
 * Bring every existing CreditOps client under the engine, once.
 *
 * These files predate routing: their departments and assignees are whatever
 * ClickUp carried over or a person typed. This puts them under the same rules
 * WITHOUT manufacturing anything — the rule above means an imported assignee
 * survives untouched, and an empty team leaves the file Assignment Required
 * rather than landing on an admin.
 *
 * Idempotent: routing is a function of the client's current status, so running
 * it twice produces the same rows. Returns what it touched so the caller can
 * report honestly instead of claiming a number.
 */
create or replace function public.creditops_backfill_routing()
returns table (clients int, departments_opened int, still_unassigned int)
language plpgsql security definer set search_path = public as $function$
declare
  v_client uuid;
  v_before int;
  v_after int;
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
    perform public.creditops_route_client(v_client);
    clients := clients + 1;
  end loop;

  select count(*) into v_after from public.client_department_statuses;
  departments_opened := v_after - v_before;
  select count(*) into still_unassigned from public.creditops_assignment_required;
  return next;
end $function$;

revoke execute on function public.creditops_backfill_routing() from public, anon;
grant execute on function public.creditops_backfill_routing() to authenticated;
