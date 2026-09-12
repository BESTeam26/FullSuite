-- =============================================================================
-- A department queue is the department's OWN work. Nothing else.
--
-- Dee, 2026-09-12, with a screenshot proving it: the Global Complaints &
-- Mailing Queue was listing clients whose statuses were `In Dispute`, `Ready
-- for Reimport / Review` and `Onboarding` — none of which is complaints work.
--
-- ── THE CAUSE ───────────────────────────────────────────────────────────────
--
-- Every queue was `clients.filter(spec.filterFn)` over the CLIENT'S OVERALL
-- CREDIT STATUS, in React. Complaints' predicate was literally `() => true`,
-- so it showed every client BES had. Bureau Calling's was the same. The other
-- three matched lists of credit statuses that had drifted from the real
-- vocabulary years of statuses ago.
--
-- This is the "hard-coded in React" Dee ruled out when the routing engine was
-- built, and it survived because the engine changed where work is ASSIGNED
-- without changing where queues are READ.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
--
--   STATUS TRIGGERS ROUTING
--   ROUTING CREATES OR TRANSITIONS DEPARTMENT WORK
--   DEPARTMENT WORK DETERMINES QUEUE MEMBERSHIP
--
-- So membership is one open `client_department_statuses` row for THAT
-- department, and the queue never interprets the credit status again. A client
-- who is `In Dispute` with an open `FTC Needed` complaints row appears in
-- Complaints because the complaints work exists — not because of the status.
-- The same client with no complaints row does not appear, whatever the status
-- says.
--
-- Concurrency survives, because it is what the rows say: two open department
-- rows put the client in two queues, which is correct and was always the
-- intent of one-row-per-department.
-- =============================================================================

create or replace view public.creditops_department_queue as
  select
    s.client_id,
    s.department,
    /* THE DEPARTMENT'S OWN status. The queue column showed the client's
       overall credit status here, which is how "In Dispute" appeared as a
       Complaints queue status (Dee, 2026-09-12). */
    s.status                                   as work_status,
    c.status                                   as credit_status,
    c.name                                     as client_name,
    c.email                                    as client_email,
    c.phone                                    as client_phone,
    c.public_id                                as client_public_id,
    c.round,
    c.agency_id,
    c.organization_id,
    c.outsourcing_group_id,
    coalesce(o.name, g.name)                   as partner_name,
    coalesce(c.organization_id, c.outsourcing_group_id) as partner_scope_id,
    s.assignee_id,
    coalesce(p.full_name, p.email)             as assignee_name,
    s.assignment_method,
    coalesce(s.manual_due_at, s.system_due_at) as due_at,
    s.blocked_reason,
    s.updated_at,
    /* Three states, one definition, shared with the assignment engine and
       My Work so no two surfaces can disagree about what "actionable" means. */
    public.creditops_status_is_actionable(s.department, s.status) as actionable,
    (not public.creditops_status_is_actionable(s.department, s.status)) as waiting
    from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
    left join public.profiles p on p.id = s.assignee_id
   where coalesce(c.lifecycle, 'active') = 'active'
     and c.archived_at is null
     /* Resolved and completed department work leaves the queue and keeps its
        history; it is simply no longer anybody's to do. */
     and upper(btrim(s.status)) not in (
       'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
       'SUPPORT RESOLVED', 'OB READY FOR R1', 'PARTNER ENDORSED',
       'COMPLETED', 'ARCHIVED / INACTIVE'
     );

alter view public.creditops_department_queue set (security_invoker = true);

comment on view public.creditops_department_queue is
  'Open department work, one row per (client, department) — the canonical membership of every Global CreditOps queue. Queue membership NEVER comes from the client''s overall credit status; status triggers routing, routing creates department work, department work determines the queue (Dee, 2026-09-12).';

grant select on public.creditops_department_queue to authenticated;

-- ── The sequential handoff Dee specified ────────────────────────────────────
/**
 * `Ready For Reimport / Credit Update` is owned by Client Success / Support,
 * and the Dispute waiting work it follows has to STOP — otherwise the same
 * sequential step has two owners, which is exactly what Dee ruled out.
 *
 * Stored as a row rather than written into the engine, because it is the only
 * transition that legitimately closes another department's work and the
 * general rule remains "routing never closes what it did not open". Making it
 * data keeps that rule intact and makes the exception visible.
 *
 * Dispute closes at COMPLETED: at the thirty-day mark the round is finished
 * and the results are what Support is about to review. DEE — say the word if
 * a different closing status is right.
 */
alter table public.creditops_status_routing
  add column if not exists closes_department public.fulfillment_department;

comment on column public.creditops_status_routing.closes_department is
  'The department whose work this status ENDS, for a sequential handoff. Only the reimport statuses set it: routing otherwise never closes work it did not open (Dee, 2026-09-12).';

update public.creditops_status_routing
   set closes_department = 'Dispute'
 where status in ('Ready for Reimport / Review', 'Ready For Reimport/ Credit Update', 'READY FOR REIMPORT');

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
    perform public.raise_partner_action(p_client, 'partner_confirmation', null, null);
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;

  /* The one sequential close, and only where a row says so. */
  if r.closes_department is not null then
    update public.client_department_statuses
       set status = 'COMPLETED', assignee_id = null,
           assignment_method = 'handoff', assigned_at = now(), updated_at = now()
     where client_id = p_client and department = r.closes_department
       and public.creditops_status_is_actionable(department, status);
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
