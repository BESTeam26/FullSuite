-- =============================================================================
-- The three things an agent actually does, as one click each.
--
-- Dee: "Agents should make business actions, not manage database fields...
-- They should not manually enter four fields."
--
-- Each of these records the anchor, and the trigger on
-- `client_department_statuses` does the rest: computes the due date from the
-- policy, clears the processing agent if the new state is a waiting one, and
-- refreshes the client's own due date. The agent chooses nothing about SLA
-- type, timer kind or calculation source, because none of that is a decision
-- anybody working a file should be making.
--
-- A separate door for corrections: `set_department_due_override` is the Team
-- Lead's "Adjust Dates / SLA". It preserves the system date beside the
-- override and records who and why, so an override never destroys the logic it
-- replaces.
-- =============================================================================

/** May this caller work this client's queues at all? */
create or replace function public.may_work_client(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.fulfillment_clients fc
     where fc.id = p_client
       and public.is_staff_of(fc.agency_id)
       and public.agency_can('creditops.clients.edit')
       and (fc.outsourcing_group_id is null or public.can_see_partner(fc.outsourcing_group_id))
  )
$function$;
revoke execute on function public.may_work_client(uuid) from public, anon;
grant execute on function public.may_work_client(uuid) to authenticated;

/** Put a client into a department queue, and let the rules do the rest. */
create or replace function public.enter_department_queue(
  p_client uuid, p_department public.fulfillment_department, p_status text,
  p_opened_at timestamptz default null)
returns timestamptz
language plpgsql security definer set search_path = public as $function$
declare v_due timestamptz;
begin
  if not public.may_work_client(p_client) then
    raise exception 'You cannot work this client' using errcode = '42501';
  end if;

  insert into public.client_department_statuses (client_id, department, status, opened_at)
  values (p_client, p_department, p_status, coalesce(p_opened_at, now()))
  on conflict (client_id, department) do update
    set status = excluded.status,
        /* A caller-supplied moment is a correction being applied; without one
           the trigger restarts the clock at now(). */
        opened_at = coalesce(p_opened_at, public.client_department_statuses.opened_at);

  select coalesce(manual_due_at, system_due_at) into v_due
    from public.client_department_statuses
   where client_id = p_client and department = p_department;
  return v_due;
end $function$;
revoke execute on function public.enter_department_queue(uuid, public.fulfillment_department, text, timestamptz) from public, anon;
grant execute on function public.enter_department_queue(uuid, public.fulfillment_department, text, timestamptz) to authenticated;

/**
 * Mark as Mailed.
 *
 * One click: the mailed date is recorded, the file moves to waiting, the due
 * date becomes mailed + 30 days, and the processing agent is cleared by the
 * trigger. Nothing about the partner, the team or the Lead Account Manager
 * moves — only the temporary operational assignment.
 */
create or replace function public.mark_client_mailed(
  p_client uuid, p_mailed_at timestamptz default null)
returns timestamptz
language plpgsql security definer set search_path = public as $function$
declare v_due timestamptz; v_when timestamptz := coalesce(p_mailed_at, now());
begin
  if not public.may_work_client(p_client) then
    raise exception 'You cannot work this client' using errcode = '42501';
  end if;

  update public.fulfillment_clients
     set status = 'In Dispute', updated_at = now()
   where id = p_client;

  v_due := public.enter_department_queue(p_client, 'Dispute', 'Mailed', v_when);

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail,
     field, new_value, visibility)
  select fc.agency_id, 'client', p_client::text, auth.uid(),
         coalesce(pr.full_name, pr.email, 'BES'),
         'Marked as mailed',
         'Letters mailed ' || to_char(v_when, 'Mon DD, YYYY')
           || '. Back for reimport by ' || to_char(v_due, 'Mon DD, YYYY') || '.',
         'mailed_at', to_char(v_when, 'YYYY-MM-DD'), 'bes_internal'
    from public.fulfillment_clients fc
    left join public.profiles pr on pr.id = auth.uid()
   where fc.id = p_client;

  return v_due;
end $function$;
revoke execute on function public.mark_client_mailed(uuid, timestamptz) from public, anon;
grant execute on function public.mark_client_mailed(uuid, timestamptz) to authenticated;

/** Open a support case: 24 hours from now, by policy. */
create or replace function public.open_support_case(p_client uuid, p_status text default 'Needs Response')
returns timestamptz
language sql security definer set search_path = public as $function$
  select public.enter_department_queue(p_client, 'Support', p_status, now())
$function$;
revoke execute on function public.open_support_case(uuid, text) from public, anon;
grant execute on function public.open_support_case(uuid, text) to authenticated;

/** Open complaints work: 5 days from now, by policy. */
create or replace function public.open_complaint(p_client uuid, p_status text)
returns timestamptz
language plpgsql security definer set search_path = public as $function$
begin
  if p_status not in ('FTC Needed', 'CFPB Needed', 'For Complaints') then
    raise exception 'Choose FTC Needed, CFPB Needed or For Complaints' using errcode = '22023';
  end if;
  return public.enter_department_queue(p_client, 'Complaints', p_status, now());
end $function$;
revoke execute on function public.open_complaint(uuid, text) from public, anon;
grant execute on function public.open_complaint(uuid, text) to authenticated;

-- ── The Team Lead's correction door ─────────────────────────────────────────
/**
 * Adjust Dates / SLA. Needs `ops.manage` — an agent works their files, they do
 * not rewrite SLA policy. The system's own date is preserved beside the
 * override, so the original logic is never destroyed and Follow the system
 * remains possible.
 */
create or replace function public.set_department_due_override(
  p_client uuid, p_department public.fulfillment_department,
  p_due timestamptz, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_system timestamptz;
begin
  select fc.agency_id into v_agency from public.fulfillment_clients fc where fc.id = p_client;
  if v_agency is null then raise exception 'No such client' using errcode = '22023'; end if;
  if not (public.is_staff_of(v_agency) and public.agency_can('ops.manage')) then
    raise exception 'Adjusting a due date requires operational management' using errcode = '42501';
  end if;

  select system_due_at into v_system from public.client_department_statuses
   where client_id = p_client and department = p_department;

  update public.client_department_statuses
     set manual_due_at = p_due, manual_due_by = auth.uid(),
         manual_due_set_at = now(), manual_due_reason = p_reason
   where client_id = p_client and department = p_department;
  if not found then raise exception 'That client is not in this queue' using errcode = 'P0002'; end if;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail,
     field, previous_value, new_value, visibility)
  select v_agency, 'client', p_client::text, auth.uid(),
         coalesce(pr.full_name, pr.email, 'BES'), 'Due date overridden',
         coalesce(nullif(btrim(p_reason), ''), 'No reason given')
           || ' The system date (' || coalesce(to_char(v_system, 'Mon DD'), 'none') || ') is kept.',
         'due_at', to_char(v_system, 'YYYY-MM-DD'), to_char(p_due, 'YYYY-MM-DD'), 'bes_internal'
    from public.profiles pr where pr.id = auth.uid();
end $function$;
revoke execute on function public.set_department_due_override(uuid, public.fulfillment_department, timestamptz, text) from public, anon;
grant execute on function public.set_department_due_override(uuid, public.fulfillment_department, timestamptz, text) to authenticated;

/** Back to the calculated date. */
create or replace function public.clear_department_due_override(
  p_client uuid, p_department public.fulfillment_department)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid;
begin
  select fc.agency_id into v_agency from public.fulfillment_clients fc where fc.id = p_client;
  if not (public.is_staff_of(v_agency) and public.agency_can('ops.manage')) then
    raise exception 'Adjusting a due date requires operational management' using errcode = '42501';
  end if;
  update public.client_department_statuses
     set manual_due_at = null, manual_due_by = null,
         manual_due_set_at = null, manual_due_reason = null
   where client_id = p_client and department = p_department;
end $function$;
revoke execute on function public.clear_department_due_override(uuid, public.fulfillment_department) from public, anon;
grant execute on function public.clear_department_due_override(uuid, public.fulfillment_department) to authenticated;
