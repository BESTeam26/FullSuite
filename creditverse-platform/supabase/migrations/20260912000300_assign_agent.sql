-- =============================================================================
-- Assign Agent — the Team Lead's control, and the only way a person moves work.
--
-- Dee, 2026-09-11: "The Support Team Lead needs a simple: Assign Agent
-- control… Support agents should not be able to take/reassign arbitrary cases
-- unless their capability allows it."
--
-- ── WHO MAY ─────────────────────────────────────────────────────────────────
--
-- Three ways, checked in the database so typing the RPC by hand meets the same
-- rules as pressing the button (rule 1):
--
--   · the LEAD of a live, non-fixture team for that department
--   · anybody with `ops.manage` — management rebalancing
--   · nobody else. An agent cannot take a case, hand one on, or release their
--     own; that is a Team Lead decision by design.
--
-- ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
--
-- Dee's §12/§13 list, in full: department, previous assignee, new assignee,
-- timestamp, method, and the actor. `activity_events` is append-only, so the
-- trail cannot be edited afterwards; the row keeps only the CURRENT state.
--
-- `manual_override` when a lead or manager moves work in an auto-distributed
-- department — the exception Dee wants visible as an exception. `team_lead`
-- when it is Support, where deliberate assignment IS the normal path.
-- =============================================================================

create or replace function public.creditops_assign_agent(
  p_client uuid,
  p_department public.fulfillment_department,
  p_assignee uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  v_row public.client_department_statuses%rowtype;
  v_mode text;
  v_is_lead boolean;
  v_may_manage boolean;
  v_method text;
  v_prev_name text; v_next_name text; v_actor text;
  v_dept_key text := case p_department
                       when 'Onboarding'     then 'onboarding'
                       when 'Dispute'        then 'dispute'
                       when 'Support'        then 'support'
                       when 'Complaints'     then 'complaints'
                       when 'Bureau Calling' then 'bureau_calling'
                     end;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then
    /* Not visible under this caller's policies: the same answer as "no such
       client", so the function cannot be used to probe for records. */
    raise exception 'Client not visible' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null and not t.is_fixture
      join public.departments d on d.id = t.department_id
     where m.user_id = auth.uid() and m.is_lead
       and t.agency_id = c.agency_id
       and d.division = 'creditops' and d.archived_at is null and d.key = v_dept_key
  ) into v_is_lead;
  v_may_manage := public.agency_can('ops.manage');

  if not (v_is_lead or v_may_manage) then
    raise exception 'Only this department''s Team Lead can assign its work'
      using errcode = '42501';
  end if;

  select * into v_row from public.client_department_statuses
   where client_id = p_client and department = p_department;
  if v_row.client_id is null then
    raise exception 'There is no % work open on this client', p_department
      using errcode = '22023';
  end if;

  /* The person has to belong to the department. A Team Lead cannot park work
     on somebody who does not work that queue and will never see it. Clearing
     the assignment (null) is always allowed — that is releasing, not placing. */
  if p_assignee is not null
     and not public.creditops_is_eligible(p_assignee, p_department, c.agency_id) then
    raise exception 'That person is not on the % team', p_department using errcode = '22023';
  end if;

  if v_row.assignee_id is not distinct from p_assignee then return; end if;

  select d.assignment_mode into v_mode from public.departments d
   where d.agency_id = c.agency_id and d.division = 'creditops'
     and d.archived_at is null and d.key = v_dept_key;
  v_method := case when coalesce(v_mode, 'auto_equal') = 'team_lead'
                   then 'team_lead' else 'manual_override' end;

  update public.client_department_statuses
     set assignee_id = p_assignee,
         assignment_method = v_method,
         assigned_at = now(),
         updated_at = now()
   where client_id = p_client and department = p_department;

  select coalesce(full_name, email) into v_prev_name from public.profiles where id = v_row.assignee_id;
  select coalesce(full_name, email) into v_next_name from public.profiles where id = p_assignee;
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(), v_actor,
     'Assignment changed',
     p_department::text || ': ' || coalesce(v_prev_name, 'Unassigned') || ' → ' ||
       coalesce(v_next_name, 'Unassigned') ||
       case when p_reason is not null and length(trim(p_reason)) > 0
            then ' — ' || trim(p_reason) else '' end,
     'department_assignee:' || p_department::text,
     coalesce(v_prev_name, 'Unassigned'), coalesce(v_next_name, 'Unassigned'),
     'bes_internal');

  perform public.log_audit(
    'creditops.assignment', 'fulfillment_client', p_client::text, c.organization_id,
    jsonb_build_object('department', p_department, 'assignee_id', v_row.assignee_id,
                       'assignment_method', v_row.assignment_method),
    jsonb_build_object('department', p_department, 'assignee_id', p_assignee,
                       'assignment_method', v_method, 'reason', p_reason));

  perform public.creditops_refresh_headline(p_client);
end $function$;

comment on function public.creditops_assign_agent(uuid, public.fulfillment_department, uuid, text) is
  'Assign or release one department''s work on a client. Team Lead of that department, or ops.manage. Records previous/new assignee, actor, timestamp, method and reason (Dee, 2026-09-11).';

revoke execute on function public.creditops_assign_agent(uuid, public.fulfillment_department, uuid, text) from public, anon;
grant execute on function public.creditops_assign_agent(uuid, public.fulfillment_department, uuid, text) to authenticated;

-- ── Who a lead may choose ───────────────────────────────────────────────────
/**
 * The department's own team, with each member's current actionable load, so
 * the Team Lead can see who is free rather than guessing. The same load the
 * automatic engine counts — one definition, so the lead and the engine never
 * disagree about who is busy.
 */
create or replace function public.creditops_department_roster(
  p_department public.fulfillment_department
) returns table (user_id uuid, full_name text, email text, is_lead boolean, active_files int)
language sql stable security definer set search_path = public as $function$
  with agency as (select id from public.agencies limit 1),
  members as (
    select distinct m.user_id, bool_or(m.is_lead) as is_lead
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null and not t.is_fixture
      join public.departments d on d.id = t.department_id
      join public.agency_memberships am on am.user_id = m.user_id and am.agency_id = t.agency_id
     where d.division = 'creditops' and d.archived_at is null
       and coalesce(am.status, 'active') = 'active'
       and d.key = case p_department
                     when 'Onboarding'     then 'onboarding'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
     group by m.user_id
  )
  select mb.user_id, p.full_name, p.email, mb.is_lead,
         (select count(*)::int from public.client_department_statuses s
            join public.fulfillment_clients c on c.id = s.client_id
           where s.assignee_id = mb.user_id and c.archived_at is null
             and coalesce(c.lifecycle, 'active') = 'active'
             and public.creditops_status_is_actionable(s.department, s.status))
    from members mb
    join public.profiles p on p.id = mb.user_id
   where public.is_staff_of((select id from agency))
   order by p.full_name nulls last
$function$;

revoke execute on function public.creditops_department_roster(public.fulfillment_department) from public, anon;
grant execute on function public.creditops_department_roster(public.fulfillment_department) to authenticated;
