-- Whoever holds the work can open the file, and a handoff records itself
-- while its author can still see it (Dee, 2026-10-02: "fix the handoffs").
--
-- Found in the 2026-10-01 full review (matrix phase 62, the P-013 check):
--
--   handoff_client_departments() runs with the caller's own rights. Opening a
--   destination department fires creditops_refresh_headline(), which
--   re-derives the client's headline assignee from the department assignees
--   (since 2026-09-28). When the destination has nobody yet, the headline
--   becomes NULL, the agent loses the "assigned to me" path to the client,
--   and the function's own "Handed off" activity entry is then refused by
--   row security — the whole handoff fails with 42501.
--
--   Underneath that: an agent who holds a DEPARTMENT of a client (its
--   assignee) could not open the client at all unless another path (the
--   partner directory) happened to let them. P-013's rule — "a person cannot
--   be given a file they cannot open" — was enforced for the headline only.
--   Measured live: every real assignee sees the directory today, so no real
--   person was refused; two test files had been routed to real people (Nico,
--   Paul) on 2026-09-23 and are released below.
--
-- 1. The client rule gains one arm: the assignee of any of the client's
--    department rows may read the client. Hoisted (creditops_my_assigned_
--    pairs(), already a definer set) so it costs one indexed lookup per
--    query, not one per row. fulfillment_client_readable() gains the same arm;
--    matrix phase 47 proves the two still agree.
-- 2. The handoff validates every destination first, writes its one "Handed
--    off" entry, then opens the departments — all in one transaction, so a
--    later failure still undoes the entry (§30's "only what happened" holds).
-- 3. Test files are never real work: the two automatic assignments of
--    fixture clients to real people are cleared, with the reason recorded.

create index if not exists client_department_statuses_assignee_idx
  on public.client_department_statuses (assignee_id) where assignee_id is not null;

drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients for select to authenticated
  using (
    (client_id in (select public.my_client_ids()))
    or ((assigned_agent_id = (select auth.uid())) and public.is_staff_of(agency_id))
    /* P-013 for departments: whoever holds the work can open the file. */
    or (id in (select a.client_id from public.creditops_my_assigned_pairs() a))
    or ((outsourcing_group_id is not null)
        and (outsourcing_group_id in (select public.creditops_visible_group_ids()))
        and ((agency_id in (select public.creditops_directory_agency_ids()))
             or ((select public.agency_can('partners.view'))
                 and (select public.creditops_any_reach())
                 and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))))
    or ((outsourcing_group_id is null) and (organization_id is not null)
        and public.bes_may_fulfil(organization_id, null::uuid, 'creditops'::public.fulfillment_service)
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))
    or ((outsourcing_group_id is null) and (organization_id is null)
        and public.is_staff_of(agency_id)
        and public.in_scope(agency_id, 'creditops'::public.fulfillment_service, team_id, assigned_agent_id, created_by))
    or ((organization_id is not null)
        and public.org_has_product(organization_id, 'creditOps'::public.product_key)
        and public.org_scope_allows(organization_id, assigned_agent_id))
  );

create or replace function public.fulfillment_client_readable(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  /* Keep this predicate identical to the fulfillment_clients_select policy
     (and fulfillment_clients_portal_select, which its first clause covers).
     Matrix phase 47 fails the release if they ever disagree. */
  select exists (
    select 1 from public.fulfillment_clients c
     where c.id = p_client
       and (
         (c.client_id in (select public.my_client_ids()))
         or (c.assigned_agent_id = auth.uid() and public.is_staff_of(c.agency_id))
         or (c.id in (select a.client_id from public.creditops_my_assigned_pairs() a))
         or (c.outsourcing_group_id is not null
             and c.outsourcing_group_id in (select public.creditops_visible_group_ids())
             and ((c.agency_id in (select public.creditops_directory_agency_ids()))
                  or (public.agency_can('partners.view')
                      and public.creditops_any_reach()
                      and public.in_scope(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id, c.assigned_agent_id, c.created_by))))
         or (c.outsourcing_group_id is null and c.organization_id is not null
             and public.bes_may_fulfil(c.organization_id, null::uuid, 'creditops'::public.fulfillment_service)
             and public.in_scope(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id, c.assigned_agent_id, c.created_by))
         or (c.outsourcing_group_id is null and c.organization_id is null
             and public.is_staff_of(c.agency_id)
             and public.in_scope(c.agency_id, 'creditops'::public.fulfillment_service, c.team_id, c.assigned_agent_id, c.created_by))
         or (c.organization_id is not null
             and public.org_has_product(c.organization_id, 'creditOps'::public.product_key)
             and public.org_scope_allows(c.organization_id, c.assigned_agent_id))
       ))
$$;

create or replace function public.handoff_client_departments(
  p_client uuid, p_from public.fulfillment_department,
  p_targets public.fulfillment_department[], p_statuses text[], p_note text default null)
returns jsonb
language plpgsql set search_path = public as $$
declare
  c            public.fulfillment_clients%rowtype;
  v_opened     text[] := '{}';
  v_already    text[] := '{}';
  v_open_dept  public.fulfillment_department[] := '{}';
  v_open_stat  text[] := '{}';
  i            integer;
  v_target     public.fulfillment_department;
  v_status     text;
  v_existing   text;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then
    raise exception 'That client is not yours to work' using errcode = '42501';
  end if;
  if not public.client_department_writable(p_client) then
    raise exception 'You cannot record department work on this client' using errcode = '42501';
  end if;
  /* You may pass on work you hold. Scope is checked on the department the
     file is LEAVING; the destinations open as they always did, because
     handing to another department is the point (Dee, 2026-09-22). */
  if not (public.creditops_may_work(p_from) or public.is_org_member(c.organization_id)) then
    raise exception 'You do not work the % queue, so you cannot hand this file on from it', p_from
      using errcode = '42501';
  end if;
  if array_length(p_targets, 1) is distinct from array_length(p_statuses, 1) then
    raise exception 'Every destination needs an entry status' using errcode = '22023';
  end if;

  /* 1. Decide everything before writing anything. */
  for i in 1 .. coalesce(array_length(p_targets, 1), 0) loop
    v_target := p_targets[i];
    v_status := upper(trim(p_statuses[i]));

    /* The browser proposes the entry status; the database decides whether it
       is one this department has. */
    if not (v_status = any (public.creditops_department_statuses(v_target))) then
      raise exception 'Unknown status % for %', v_status, v_target using errcode = '22023';
    end if;

    /* Already open is decided HERE, inside the transaction, not from a
       snapshot the browser read a moment ago (§6). */
    select status into v_existing
      from public.client_department_statuses
     where client_id = p_client and department = v_target;

    if v_existing is not null then
      v_already := v_already || v_target::text;
    else
      v_open_dept := v_open_dept || v_target;
      v_open_stat := v_open_stat || v_status;
      v_opened    := v_opened || v_target::text;
    end if;
  end loop;

  /* 2. The one entry describing the handoff, written while its author can
     still see the file. Opening a department re-derives the client's headline
     assignee, which can take the author's assignment away; an entry written
     after that would be refused. Same transaction, so if anything below
     fails the entry goes with it — it still records only what happened. */
  if array_length(v_opened, 1) > 0 then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail,
       field, previous_value, new_value, visibility)
    values (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(),
            'Handed off',
            coalesce(p_from::text, 'Work') || ' → ' || array_to_string(v_opened, ', ')
              || case when array_length(v_already, 1) > 0
                      then ' (already working: ' || array_to_string(v_already, ', ') || ')'
                      else '' end
              || case when p_note is not null and length(trim(p_note)) > 0
                      then ' — ' || trim(p_note) else '' end,
            'handoff', p_from::text, array_to_string(v_opened, ', '),
            case when public.is_staff_of(c.agency_id) then 'bes_internal'
                 else 'organization_internal' end::public.activity_visibility);
  end if;

  /* 3. Open the departments. Their own trigger-written entries follow. */
  for i in 1 .. coalesce(array_length(v_open_dept, 1), 0) loop
    insert into public.client_department_statuses (client_id, department, status)
    values (p_client, v_open_dept[i], v_open_stat[i]);
  end loop;

  /* NOTE what is absent: no update to `fulfillment_clients.status`, and no
     write to the source department. Both are deliberate. */
  return jsonb_build_object(
    'opened', coalesce(to_jsonb(v_opened), '[]'::jsonb),
    'alreadyOpen', coalesce(to_jsonb(v_already), '[]'::jsonb));
end;
$$;

/* 3. Test files are never real work (7f4c67d). These two were routed
   automatically on 2026-09-23, before that rule existed. */
update public.client_department_statuses s
   set assignee_id = null,
       assignment_method = 'manual_override',
       assignment_reason = 'Released 2026-10-02: a test file is never assigned to a real person.'
  from public.fulfillment_clients c, public.profiles p
 where c.id = s.client_id and p.id = s.assignee_id
   and c.is_fixture and coalesce(p.is_fixture, false) = false;
