-- =============================================================================
-- Applying the route: department ownership, then the department's policy.
--
-- Dee's two-step, kept two steps: "Department Assignment → Which team owns the
-- work? Agent Assignment → Which individual owns the actionable file?"
--
-- ── THE FOUR OUTCOMES ───────────────────────────────────────────────────────
--
--   actionable      open the department's row, then apply its assignment mode
--   waiting         open the row, clear the individual — the clock is somebody
--                   else's and the file must leave My Work
--   partner_action  no BES department, no BES assignee, a Partner item
--   terminal        nothing to route; touch nothing
--
-- ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
--
-- · It writes ONLY the department the status routes to. Support stays open
--   while Dispute waits (Dee, §8) because nothing here reads or clears another
--   department's row.
-- · It does not re-assign a file that already has a valid, eligible assignee
--   working it. Dee: "Do not churn assignments unnecessarily."
-- · It never falls back to an admin, a Team Lead or the previous agent when a
--   department is empty. The file stays Assignment Required.
-- · It fires on the status column alone, so a note, a phone number, a document
--   or a view changes nothing.
-- =============================================================================

-- ── Is this assignee still a valid choice? ──────────────────────────────────
/**
 * Somebody already holding the file keeps it — but only while they are still
 * on the department's team and still active. A person who left the team keeps
 * their existing work (Dee, §11: membership changes affect FUTURE assignment,
 * and existing work is never silently redistributed); this is asked only when
 * the engine is about to assign, to decide whether it needs to.
 */
create or replace function public.creditops_is_eligible(
  p_user uuid, p_department public.fulfillment_department, p_agency uuid
) returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null
      join public.departments d on d.id = t.department_id
      join public.agency_memberships am on am.user_id = m.user_id and am.agency_id = p_agency
     where m.user_id = p_user
       and t.agency_id = p_agency
       and d.division = 'creditops' and d.archived_at is null
       and d.key = case p_department
                     when 'Onboarding'     then 'onboarding'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
       and coalesce(am.status, 'active') = 'active'
  )
$function$;

-- ── The headline assignee ───────────────────────────────────────────────────
/**
 * `fulfillment_clients.assigned_agent_id` is a SUMMARY. The authority is
 * `client_department_statuses.assignee_id`, one per department, and this must
 * never overwrite one department's ownership with another's (Dee, §9).
 *
 * So it is derived, never written by hand:
 *
 *   the primary department's assignee, when the primary work has one
 *   else the only actionable assignee, when exactly one department has one
 *   else nobody — waiting, partner-owned, Support-unassigned, or genuinely
 *        several at once, where naming one would be a lie about the others
 *
 * "Primary" is the department the client's current credit status routes to:
 * the work the file is actually about right now.
 */
create or replace function public.creditops_refresh_headline(p_client uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_primary public.fulfillment_department;
  v_headline uuid;
  v_count int;
begin
  select r.department into v_primary
    from public.fulfillment_clients c
    join public.creditops_status_routing r on r.status = c.status
   where c.id = p_client;

  if v_primary is not null then
    select s.assignee_id into v_headline
      from public.client_department_statuses s
     where s.client_id = p_client and s.department = v_primary
       and s.assignee_id is not null
       and public.creditops_status_is_actionable(s.department, s.status);
  end if;

  if v_headline is null then
    select count(*), min(s.assignee_id) into v_count, v_headline
      from public.client_department_statuses s
     where s.client_id = p_client and s.assignee_id is not null
       and public.creditops_status_is_actionable(s.department, s.status);
    /* Several actionable owners and no primary among them: the summary says
       nobody rather than picking one and hiding the rest. The queues and the
       client file show every department's own assignee. */
    if v_count <> 1 then v_headline := null; end if;
  end if;

  update public.fulfillment_clients
     set assigned_agent_id = v_headline
   where id = p_client and assigned_agent_id is distinct from v_headline;
end $function$;
revoke execute on function public.creditops_refresh_headline(uuid) from public, anon, authenticated;

-- ── The engine ──────────────────────────────────────────────────────────────
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

  /* Archived, completed or cancelled files are not routed anywhere. */
  if coalesce(c.lifecycle, 'active') <> 'active' or c.archived_at is not null then
    return;
  end if;

  select * into r from public.creditops_status_routing where status = c.status;
  if not found then
    /* Dee: "If routing genuinely cannot be determined: keep it Unassigned,
       flag Routing Review Required… Do not silently guess." Every status in
       the enum is mapped today, so this is the guard for one added later. */
    perform public.log_audit('creditops.routing_unmapped', 'fulfillment_client', p_client::text,
      c.organization_id, null, jsonb_build_object('status', c.status));
    return;
  end if;

  if r.kind = 'terminal' then
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;

  if r.kind = 'partner_action' then
    /* No BES department row is opened and none is closed: the internal work
       that was already open stays exactly as it is, and simply has no BES
       owner while the partner holds the file. */
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
    /* Locked business rule: the 30-day wait has no internal assignee, and the
       previous processor is released rather than left holding a file they
       cannot act on. History is in activity_events; nothing is erased. */
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

  /* Already being worked by somebody who is still on the team? Leave it.
     Re-picking here is the churn Dee ruled out — a priority change or a
     re-entry into the same department must not move the file. */
  if v_existing.client_id is not null
     and v_existing.assignee_id is not null
     and public.creditops_status_is_actionable(v_existing.department, v_existing.status)
     and public.creditops_is_eligible(v_existing.assignee_id, r.department, c.agency_id)
  then
    v_keep := true;
  end if;

  if v_keep then
    v_pick := v_existing.assignee_id;
  elsif v_mode = 'team_lead' then
    /* Client Success / Support. The department owns it; the Team Lead decides
       who. Unassigned here is the expected state, not a failure. */
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
    set /* An open department keeps the status it had reached; re-entering must
           not knock a file mid-way through back to its entry status. */
        status = case
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
  'Route one client: responsible department from creditops_status_routing, then that department''s assignment_mode. Never closes another department''s work, never re-picks a valid assignee, never falls back to an admin (Dee, 2026-09-11).';
revoke execute on function public.creditops_route_client(uuid) from public, anon;
grant execute on function public.creditops_route_client(uuid) to authenticated;

-- ── When it runs ────────────────────────────────────────────────────────────
/**
 * `UPDATE OF status` and nothing else.
 *
 * Dee, §10: adding a note, changing a phone number, uploading a document or
 * viewing the client must not touch assignment. A column-scoped trigger is how
 * that is guaranteed rather than remembered.
 */
create or replace function public.creditops_route_on_status()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.status is distinct from old.status then
    perform public.creditops_route_client(new.id);
  end if;
  return null;
end $function$;
revoke execute on function public.creditops_route_on_status() from public, anon, authenticated;

drop trigger if exists fulfillment_clients_route on public.fulfillment_clients;
create trigger fulfillment_clients_route
  after update of status on public.fulfillment_clients
  for each row execute function public.creditops_route_on_status();

/* A new client is routed the moment it exists, so intake does not need to
   know the rules either. */
create or replace function public.creditops_route_on_insert()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  perform public.creditops_route_client(new.id);
  return null;
end $function$;
revoke execute on function public.creditops_route_on_insert() from public, anon, authenticated;

drop trigger if exists fulfillment_clients_route_insert on public.fulfillment_clients;
create trigger fulfillment_clients_route_insert
  after insert on public.fulfillment_clients
  for each row execute function public.creditops_route_on_insert();

-- ── Assignment Required ─────────────────────────────────────────────────────
/**
 * Actionable department work in an auto-distributed department with nobody on
 * it. Dee: "This must be an explicit exception state."
 *
 * Support is excluded by construction: its mode is `team_lead`, so unassigned
 * there is the normal course of business and must not read as an engine
 * failure.
 */
create or replace view public.creditops_assignment_required as
  select s.client_id, c.name as client_name, c.agency_id, c.organization_id,
         c.outsourcing_group_id, s.department, s.status,
         coalesce(s.manual_due_at, s.system_due_at) as due_at,
         s.updated_at
    from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id
    join public.departments d
      on d.agency_id = c.agency_id and d.division = 'creditops' and d.archived_at is null
     and d.key = case s.department
                   when 'Onboarding'     then 'onboarding'
                   when 'Dispute'        then 'dispute'
                   when 'Support'        then 'support'
                   when 'Complaints'     then 'complaints'
                   when 'Bureau Calling' then 'bureau_calling'
                 end
   where s.assignee_id is null
     and d.assignment_mode = 'auto_equal'
     and coalesce(c.lifecycle, 'active') = 'active'
     and c.archived_at is null
     and public.creditops_status_is_actionable(s.department, s.status);

comment on view public.creditops_assignment_required is
  'Actionable files an auto-distributed department could not place — an empty team, or a routing gap. Surfaced in the department queue, the Attention Center and the Team Lead view rather than quietly assigned to somebody (Dee, 2026-09-11). Support is absent by design: its unassigned files are waiting for its Team Lead.';

grant select on public.creditops_assignment_required to authenticated;
