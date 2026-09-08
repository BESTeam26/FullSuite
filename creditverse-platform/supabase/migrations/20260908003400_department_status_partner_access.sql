-- 0211 — Department statuses for a PARTNER's client. The handoff RLS failure.
--
-- ===========================================================================
-- ROOT CAUSE
-- ===========================================================================
--
-- Dee's error: "new row violates row-level security policy for table
-- client_department_statuses", on Complete Work with a handoff, as the agency
-- OWNER.
--
-- Reproduced exactly, and the answer is not where the message points.
--
--   A BARE INSERT SUCCEEDS.
--   INSERT ... ON CONFLICT DO UPDATE FAILS.
--
-- `set_client_department_status` upserts. ON CONFLICT DO UPDATE has to READ
-- the conflicting row to decide whether there is one — so it needs the SELECT
-- policy as well as the INSERT policy. And the SELECT policy said:
--
--   bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
--   OR is_org_member(c.organization_id)
--
-- For a PARTNER-owned client `organization_id` is NULL. `bes_may_fulfil`
-- returns false and `is_org_member(NULL)` is false. Measured, as Dee:
--
--   can Dee see the client?                      1
--   is_staff_of(client.agency_id)?               true
--   the INSERT policy's own predicate?           true
--   rows Dee can SELECT on this table?           0   ← here
--   bes_may_fulfil(NULL, group, 'creditops')?    false
--
-- So NO BES STAFF MEMBER — not even the owner — could read a department
-- status row for a partner-owned client, and the upsert therefore could not
-- run. 0165 taught `fulfillment_clients` about partner-owned clients and this
-- table was never taught the same thing.
--
-- ===========================================================================
-- THE BIGGER SYMPTOM NOBODY REPORTED
-- ===========================================================================
--
-- The handoff error is the loud half. The quiet half is that Department
-- Progress has been reading EMPTY for every partner-owned client since
-- partner clients existed — every department showing unset, because the rows
-- were invisible rather than absent. A screen that shows nothing looks like a
-- client nobody has worked yet, which is why this went unnoticed while the
-- handoff error did not.
--
-- ===========================================================================
-- THE FIX, AND WHAT IT IS NOT
-- ===========================================================================
--
-- Dee, §3: an authorized worker must be able to open the next department, and
-- must NOT thereby gain the right to edit every department state in the
-- agency. §2: no broad `USING true`, `WITH CHECK true`, or generic staff
-- bypass.
--
-- So: A DEPARTMENT STATUS IS REACHABLE EXACTLY WHEN ITS CLIENT IS WORKABLE.
--
-- `client_department_writable()` asks two things, and the first does the work:
--
--   1. does `fulfillment_clients` return this client to me? That subquery is
--      evaluated under MY row-level security, so it already demands
--      `bes_holds_partner` + `agency_can('partners.view')` + `in_scope` for a
--      partner client, or `bes_may_fulfil` + `in_scope` for an organization
--      one, or the organization's own product and scope. Every future
--      refinement to client visibility is inherited automatically, because
--      there is no second copy of it here.
--
--   2. am I a WORKER rather than the client? `fulfillment_clients` also has
--      a portal policy that lets a client see their own row, and a client
--      must not read internal department state. `is_staff_of` /
--      `is_org_member` distinguishes the side, and nothing more — it is not
--      the gate, the `exists` above is.
--
-- An agent with no assignment to the partner cannot see the client at all, so
-- (1) fails and they reach nothing. That is §25 holding without this table
-- knowing anything about partners.
--
-- ===========================================================================
-- THE SAME BUG, ON THE FUNDINGOPS TWIN
-- ===========================================================================
--
-- `funding_department_statuses` carries the identical organization-only
-- expression and would fail the identical way the first time anybody hands
-- off a partner-owned funding file. Fixed here rather than left to be
-- rediscovered.
-- ===========================================================================

create or replace function public.client_department_writable(p_client uuid)
returns boolean
language sql stable security invoker set search_path = public as $function$
  select exists (
    select 1 from public.fulfillment_clients c
     where c.id = p_client
       and (public.is_staff_of(c.agency_id) or public.is_org_member(c.organization_id))
  )
$function$;
revoke execute on function public.client_department_writable(uuid) from public, anon;
grant execute on function public.client_department_writable(uuid) to authenticated;

comment on function public.client_department_writable(uuid) is
  'A department status is reachable exactly when its client is workable. SECURITY INVOKER on purpose: the `exists` is filtered by fulfillment_clients'' own policy, which is what demands partner assignment, service scope and in_scope. The is_staff_of/is_org_member test only says which SIDE the caller is on, so a client reading their own row through the portal policy does not reach internal department state (0211).';

-- ── One rule, three commands, no organization-only twin ─────────────────
--
-- The `*_org_*` policies are dropped rather than left beside the new ones.
-- Permissive policies are OR-ed, so leaving them would mean two answers to
-- one question — and this project has been bitten by exactly that twice
-- (`agency_memberships_write`, `outsourcing_groups_write`). Everything they
-- granted, the new rule grants: `is_org_member` covers the organization's own
-- people, and `fulfillment_clients_select` already checks the product and the
-- organization's scope.
drop policy if exists client_department_statuses_select on public.client_department_statuses;
drop policy if exists client_department_statuses_insert on public.client_department_statuses;
drop policy if exists client_department_statuses_update on public.client_department_statuses;
drop policy if exists client_department_statuses_org_insert on public.client_department_statuses;
drop policy if exists client_department_statuses_org_update on public.client_department_statuses;

create policy client_department_statuses_select on public.client_department_statuses
  for select to authenticated using (public.client_department_writable(client_id));
create policy client_department_statuses_insert on public.client_department_statuses
  for insert to authenticated with check (public.client_department_writable(client_id));
create policy client_department_statuses_update on public.client_department_statuses
  for update to authenticated
  using (public.client_department_writable(client_id))
  with check (public.client_department_writable(client_id));
-- No delete policy. A department that was worked is not un-worked (rule 11).

-- ── The FundingOps twin, same shape ─────────────────────────────────────
create or replace function public.funding_department_writable(p_file uuid)
returns boolean
language sql stable security invoker set search_path = public as $function$
  select exists (
    select 1 from public.funding_clients c
     where c.id = p_file
       and (public.is_staff_of(c.agency_id) or public.is_org_member(c.organization_id))
  )
$function$;
revoke execute on function public.funding_department_writable(uuid) from public, anon;
grant execute on function public.funding_department_writable(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_class where oid = 'public.funding_department_statuses'::regclass) then
    execute 'drop policy if exists funding_department_statuses_select on public.funding_department_statuses';
    execute 'drop policy if exists funding_department_statuses_insert on public.funding_department_statuses';
    execute 'drop policy if exists funding_department_statuses_update on public.funding_department_statuses';
    execute 'drop policy if exists funding_department_statuses_org_insert on public.funding_department_statuses';
    execute 'drop policy if exists funding_department_statuses_org_update on public.funding_department_statuses';
    execute 'create policy funding_department_statuses_select on public.funding_department_statuses
               for select to authenticated using (public.funding_department_writable(client_id))';
    execute 'create policy funding_department_statuses_insert on public.funding_department_statuses
               for insert to authenticated with check (public.funding_department_writable(client_id))';
    execute 'create policy funding_department_statuses_update on public.funding_department_statuses
               for update to authenticated
               using (public.funding_department_writable(client_id))
               with check (public.funding_department_writable(client_id))';
  end if;
end $$;

-- ===========================================================================
-- §4, §5 — ONE canonical handoff operation, atomic across every destination
-- ===========================================================================
--
-- The browser used to loop, calling `set_client_department_status` once per
-- destination. Two problems with that, and only one of them was the RLS bug:
--
--   · it is not atomic. Complaints opens, Bureau Calling is refused, and the
--     operator is left looking at a half-done handoff with no clear account
--     of what happened (§5);
--   · each call decides "is this already open" from a snapshot the browser
--     read earlier, which is a check-then-write race.
--
-- One function, one transaction. It does NOT re-decide which status a
-- department is entered at — that rule lives in `planHandoffs`, is tested,
-- and there must not be a second copy of it (§4: "Do NOT create a second
-- handoff engine"). It validates every status the caller proposes against
-- `creditops_department_statuses`, so a browser cannot invent one.
--
-- What it will not do, in its own words:
--   · it never touches `fulfillment_clients.status` — the master status is
--     not Complete Work's business (§11, and the locked doctrine);
--   · it never closes the source department (§7). Parallel department work is
--     the point;
--   · it never moves an already-active target backwards (§6). Already open is
--     reported as already open and left exactly as it is.
create or replace function public.handoff_client_departments(
  p_client   uuid,
  p_from     public.fulfillment_department,
  p_targets  public.fulfillment_department[],
  p_statuses text[],
  p_note     text default null
) returns jsonb
language plpgsql security invoker set search_path = public as $function$
declare
  c            public.fulfillment_clients%rowtype;
  v_opened     text[] := '{}';
  v_already    text[] := '{}';
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
  if array_length(p_targets, 1) is distinct from array_length(p_statuses, 1) then
    raise exception 'Every destination needs an entry status' using errcode = '22023';
  end if;

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
      continue;
    end if;

    insert into public.client_department_statuses (client_id, department, status)
    values (p_client, v_target, v_status);

    v_opened := v_opened || v_target::text;
  end loop;

  /* One activity entry describing the handoff, written only for what actually
     happened — and only after it happened (§30). The per-department rows have
     their own trigger-written entries. */
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

  /* NOTE what is absent: no update to `fulfillment_clients.status`, and no
     write to the source department. Both are deliberate. */
  return jsonb_build_object(
    'opened', coalesce(to_jsonb(v_opened), '[]'::jsonb),
    'alreadyOpen', coalesce(to_jsonb(v_already), '[]'::jsonb));
end;
$function$;
revoke execute on function public.handoff_client_departments(uuid, public.fulfillment_department, public.fulfillment_department[], text[], text) from public, anon;
grant execute on function public.handoff_client_departments(uuid, public.fulfillment_department, public.fulfillment_department[], text[], text) to authenticated;

comment on function public.handoff_client_departments(uuid, public.fulfillment_department, public.fulfillment_department[], text[], text) is
  'Opens every selected destination department in ONE transaction. Never moves an already-active department backwards, never closes the source, and never touches the client''s master status. SECURITY INVOKER, so the row policies decide — this is atomicity, not authority (Dee, §4–§7, §11).';
