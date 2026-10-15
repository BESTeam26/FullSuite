-- A handoff sees a department row the caller cannot.
--
-- Kaori (Client Success) moved Joel Marte to Ready for Round 1 and, in the
-- same Complete Work, handed off to Dispute Processing. The status change
-- had already routed the file: the Dispute row existed, assigned to
-- Danicko. handoff_client_departments runs with the caller's rights, so its
-- "already open?" check read client_department_statuses under row security,
-- where a Support agent does not see Dispute's row — found nothing, inserted,
-- and the primary key refused: "duplicate key value violates unique
-- constraint client_department_statuses_pkey".
--
-- The check now asks a definer helper that answers only "is there a row",
-- and only for a client the caller may already write. Everything else in
-- the function — who may hand off, what opens, what is written — is as it
-- was; a destination that is already open is reported as such, exactly as
-- it is when the caller CAN see it.
--
-- Cost impact: none.

begin;

create or replace function public.creditops_department_row_exists(
  p_client uuid, p_department public.fulfillment_department)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  /* Default to deny: a client the caller cannot write answers "no row",
     so the helper leaks nothing about files outside their reach. */
  select public.client_department_writable(p_client)
     and exists (select 1 from public.client_department_statuses s
                  where s.client_id = p_client and s.department = p_department)
$$;
comment on function public.creditops_department_row_exists(uuid, public.fulfillment_department) is
  'Whether a department row exists for a client the caller may write — past row security, because a handoff must not re-open a row the caller cannot see.';
revoke all on function public.creditops_department_row_exists(uuid, public.fulfillment_department) from public, anon;
grant execute on function public.creditops_department_row_exists(uuid, public.fulfillment_department) to authenticated;

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
       snapshot the browser read a moment ago (§6) — and past row security:
       the row may belong to a queue this caller cannot see (2026-10-15). */
    v_existing := case when public.creditops_department_row_exists(p_client, v_target) then 'open' end;

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

commit;
