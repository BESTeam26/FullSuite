-- The department gate moves from the browser into the database.
--
-- `set_client_department_status` checked only that the caller could SEE the
-- client. Any BES staff member could set any status on any department of any
-- visible file; `handoff_client_departments` was the same through
-- `client_department_writable`. The restriction Dee describes — an agent works
-- their own department — existed only as `canLogDepartment` in React, and
-- hiding a control is presentation, not protection (rule 1).
--
-- Both now ask `creditops_may_work()`, which is the ladder from
-- 20260922002000: the explicit capability, the person's own team departments,
-- a department-manager seat, a division-manager seat. Never a team's name,
-- never `chief_operations`.
--
-- ── A HANDOFF IS GATED ON WHERE IT LEAVES, NOT WHERE IT LANDS ─────────────
--
-- Requiring scope over every destination would stop a Dispute agent handing a
-- file to Complaints, which is the normal flow and the whole point of a
-- handoff. The rule is that you may pass on work you hold: scope over
-- `p_from`, and the destinations open as they always did.
--
-- Assignment is included deliberately. Reassigning a file is a work action in
-- Dee's list ("change status, reassign, update queue/work state"), and it
-- already travels on this same writer.

create or replace function public.set_client_department_status(
  p_client uuid, p_department public.fulfillment_department, p_status text,
  p_assignee uuid default null, p_note text default null)
returns void language plpgsql set search_path to 'public' as $function$
declare
  c        public.fulfillment_clients%rowtype;
  v_prev   text;
  v_status text := upper(trim(p_status));
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  /* Default to deny. The message names the department, because "denied" with
     no subject is the kind of error people re-try instead of understanding. */
  if not public.creditops_may_work(p_department) then
    raise exception 'You do not work the % queue, so you cannot change its status on this file', p_department
      using errcode = '42501';
  end if;
  if not (v_status = any (public.creditops_department_statuses(p_department))) then
    raise exception 'Unknown status % for %', p_status, p_department using errcode = '22023';
  end if;
  select status into v_prev from public.client_department_statuses where client_id = p_client and department = p_department;

  insert into public.client_department_statuses (client_id, department, status, assignee_id)
  values (p_client, p_department, v_status, p_assignee)
  on conflict (client_id, department) do update
    set status = excluded.status,
        /* Only when one was supplied. A status change is not an assignment
           change, and this argument's default is "no opinion", not "nobody". */
        assignee_id = coalesce(excluded.assignee_id, public.client_department_statuses.assignee_id),
        updated_at = now();

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(),
          'Department status', coalesce(p_note, p_department::text || ' → ' || v_status), 'department:' || p_department::text, v_prev, v_status,
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $function$;

comment on function public.set_client_department_status(uuid, public.fulfillment_department, text, uuid, text) is
  'Set a department''s work status and owner. Requires creditops_may_work() for that department — capability, own team, or a management seat (Dee, 2026-09-22).';

/* The handoff keeps every other rule it had; only the gate is added. */
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handoff_client_departments';

  if position('creditops_may_work' in v_src) > 0 then
    raise notice 'handoff already gated; leaving it alone';
    return;
  end if;

  v_src := replace(v_src,
    $marker$  if not public.client_department_writable(p_client) then
    raise exception 'You cannot record department work on this client' using errcode = '42501';
  end if;$marker$,
    $new$  if not public.client_department_writable(p_client) then
    raise exception 'You cannot record department work on this client' using errcode = '42501';
  end if;
  /* You may pass on work you hold. Scope is checked on the department the
     file is LEAVING; the destinations open as they always did, because
     handing to another department is the point (Dee, 2026-09-22). */
  if not public.creditops_may_work(p_from) then
    raise exception 'You do not work the % queue, so you cannot hand this file on from it', p_from
      using errcode = '42501';
  end if;$new$);

  if position('creditops_may_work' in v_src) = 0 then
    raise exception 'handoff_client_departments no longer contains the expected guard block — refusing to rewrite it blind';
  end if;
  execute v_src;
end $$;
