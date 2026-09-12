-- =============================================================================
-- A partner confirmation returns the file WHERE IT CAME FROM.
--
-- Dee, 2026-09-12, correcting my default before it set: "Do not hard-code
-- `For Partner Confirmation → Ready for Processing` for every confirmation…
-- Otherwise every Partner confirmation, no matter why it was requested, gets
-- dumped into Processing."
--
-- She is right, and the seeded default was the wrong shape of answer. `For
-- Partner Confirmation` is a temporary EXTERNAL HANDOFF, not a stage that
-- decides what happens next. Dispute asking a partner to approve a round and
-- Support asking a partner to confirm a document are the same waiting state
-- and completely different returns.
--
-- ── SO THE REQUEST REMEMBERS ITSELF ─────────────────────────────────────────
--
-- The Partner Action Required record now stores where the file was when BES
-- asked: the originating credit status and the department that was working it.
-- The answer restores that, and the destination department's own assignment
-- policy applies as normal.
--
-- ── AND WHEN IT CANNOT REMEMBER, IT SAYS SO ─────────────────────────────────
--
-- Dee: "If a legacy Partner Confirmation record has no stored return target:
-- do NOT silently guess. Surface Routing Review Required." A file returning to
-- the wrong department is worse than a file a Team Lead has to look at, because
-- nobody finds out for a week.
-- =============================================================================

alter table public.partner_action_items
  add column if not exists origin_status public.fulfillment_client_status,
  add column if not exists origin_department public.fulfillment_department,
  add column if not exists needs_routing_review boolean not null default false;

comment on column public.partner_action_items.origin_status is
  'The credit status the client was in when BES asked, and where it returns once the partner answers. Null on a legacy record — those surface as Routing Review Required rather than being guessed (Dee, 2026-09-12).';

/* The universal default is withdrawn. It was one row; it is gone. */
update public.creditops_status_routing set on_resolved_status = null where kind = 'partner_action';

comment on column public.creditops_status_routing.on_resolved_status is
  'DEPRECATED for partner_action. The return target is stored per REQUEST on partner_action_items, because the department that asked is the department that should get it back (Dee, 2026-09-12).';

-- ── Raising one remembers where the file was ────────────────────────────────
create or replace function public.raise_partner_action(
  p_client uuid, p_kind text default 'partner_confirmation',
  p_title text default null, p_detail text default null,
  p_origin_status public.fulfillment_client_status default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  v_id uuid;
  v_origin_department public.fulfillment_department;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null or c.outsourcing_group_id is null then return null; end if;

  select id into v_id from public.partner_action_items
   where fulfillment_client_id = p_client and kind = p_kind and status = 'open';
  if v_id is not null then return v_id; end if;

  /* Where the request came from: the department the ORIGINATING status routes
     to, when we were told what it was. Read from the routing map rather than
     from whichever department row happens to be open, because a client can
     have several and only one of them asked. */
  select r.department into v_origin_department
    from public.creditops_status_routing r
   where r.status = p_origin_status and r.kind in ('actionable', 'waiting');

  insert into public.partner_action_items
    (agency_id, group_id, fulfillment_client_id, kind, title, detail, requested_by,
     origin_status, origin_department, needs_routing_review)
  values
    (c.agency_id, c.outsourcing_group_id, p_client, p_kind,
     coalesce(p_title, 'Partner confirmation required'),
     coalesce(p_detail, 'BES needs your confirmation before this file moves on.'),
     auth.uid(), p_origin_status, v_origin_department,
     /* Nothing to return to. Flagged now, at the moment the information is
        missing, rather than discovered when the partner answers. */
     p_origin_status is null)
  returning id into v_id;

  perform public.log_audit('partner.action_raised', 'partner_action', v_id::text,
    c.organization_id, null,
    jsonb_build_object('client', p_client, 'group', c.outsourcing_group_id, 'kind', p_kind,
                       'origin_status', p_origin_status, 'origin_department', v_origin_department));
  return v_id;
end $function$;
revoke execute on function public.raise_partner_action(uuid, text, text, text, public.fulfillment_client_status) from public, anon;
grant execute on function public.raise_partner_action(uuid, text, text, text, public.fulfillment_client_status) to authenticated;
drop function if exists public.raise_partner_action(uuid, text, text, text);

-- ── Answering restores it ───────────────────────────────────────────────────
create or replace function public.my_partner_action_respond(
  p_action uuid, p_response text
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  a public.partner_action_items%rowtype;
  v_who text;
begin
  select * into a from public.partner_action_items
   where id = p_action and group_id = public.partner_group_of_user();
  if a.id is null then
    raise exception 'That action is not yours to answer' using errcode = '42501';
  end if;
  if a.status <> 'open' then
    raise exception 'That action has already been answered' using errcode = '22023';
  end if;

  update public.partner_action_items
     set status = 'completed', responded_by = auth.uid(), responded_at = now(),
         response = nullif(btrim(coalesce(p_response, '')), ''), updated_at = now()
   where id = p_action;

  select coalesce(full_name, email) into v_who from public.profiles where id = auth.uid();

  if a.fulfillment_client_id is not null then
    if a.origin_status is not null then
      /* Back to the workflow that asked. The destination department's own
         assignment policy then applies through the routing trigger — a
         returning file is assigned the same way a new one is. */
      update public.fulfillment_clients set status = a.origin_status
       where id = a.fulfillment_client_id and status = 'For Partner Confirmation';
    else
      /* Legacy request with nothing recorded. Left exactly where it is, and
         flagged for a Team Lead (Dee, 2026-09-12: "do NOT silently guess"). */
      update public.partner_action_items set needs_routing_review = true where id = p_action;
    end if;

    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values
      (a.agency_id, null, 'fulfillment_client', a.fulfillment_client_id::text, auth.uid(), v_who,
       'Partner confirmed',
       coalesce(nullif(btrim(coalesce(p_response, '')), ''), 'Confirmed by the partner.'),
       'partner_action', 'Waiting on partner',
       coalesce(a.origin_status::text, 'Needs routing review'), 'shared_with_partner');
  end if;

  perform public.log_audit('partner.action_responded', 'partner_action', p_action::text, null,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'completed', 'response', p_response,
                       'returned_to', a.origin_status, 'origin_department', a.origin_department));
end $function$;
revoke execute on function public.my_partner_action_respond(uuid, text) from public, anon;
grant execute on function public.my_partner_action_respond(uuid, text) to authenticated;

-- ── The trigger knows where the file was ────────────────────────────────────
create or replace function public.creditops_route_on_status()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.status is distinct from old.status then
    /* The PREVIOUS status travels with the routing call, so a partner request
       can record where to send the file back. Only the trigger knows it. */
    perform public.creditops_route_client(new.id, old.status);
  end if;
  return null;
end $function$;

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

comment on function public.creditops_route_client(uuid, public.fulfillment_client_status) is
  'Route one client: department from creditops_status_routing, then that department''s assignment_mode. The previous status is carried so a partner request can record where to return the file (Dee, 2026-09-12).';
