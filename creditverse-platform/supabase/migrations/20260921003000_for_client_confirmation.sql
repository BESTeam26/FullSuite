-- "For Client Confirmation": waiting on the client, not finished, not ours.
--
-- Dee's queue doctrine, 2026-09-21:
--   Internal Action Queue = NO
--   Client Portal = YES
--   Client Action Required = YES
--   "Once the client confirms/responds, route it automatically to the correct
--    next internal status/department."
--
-- ── WHY THIS EXTENDS THE PARTNER TABLE RATHER THAN COPYING IT ─────────────
--
-- `partner_action_items` already solves this exact problem for the partner
-- portal, including the hard part: it records `origin_status` and
-- `origin_department` so the file knows where to GO BACK to, and flags
-- `needs_routing_review` when there is nothing to go back to. A second table
-- would be a second copy of that resume logic, and the copies would drift
-- (rules 2 and 6).
--
-- So the table gains an AUDIENCE. Everything else — the resume, the audit, the
-- one-open-per-kind guard — is shared, and the client portal reads its own
-- rows through its own policy arm.

alter table public.partner_action_items
  add column if not exists audience text not null default 'partner';
alter table public.partner_action_items drop constraint if exists partner_action_items_audience_ck;
alter table public.partner_action_items add constraint partner_action_items_audience_ck
  check (audience in ('partner', 'client'));

comment on column public.partner_action_items.audience is
  'Who owes the answer: the partner, or the client themselves. The resume logic (origin_status, origin_department) is identical for both, which is why this is one table (Dee, 2026-09-21).';

/* A client action is about a specific client; a partner action need not be. */
alter table public.partner_action_items drop constraint if exists partner_action_client_named;
alter table public.partner_action_items add constraint partner_action_client_named
  check (audience <> 'client' or fulfillment_client_id is not null);

create index if not exists partner_action_items_client_open_idx
  on public.partner_action_items (fulfillment_client_id, status)
  where audience = 'client' and status = 'open';

/* The client portal reads its OWN open actions, and nothing else changes for
   the partner arm. A client sees an action about their own file; a partner
   contact sees their group's; BES staff see both. */
drop policy if exists partner_action_items_select on public.partner_action_items;
create policy partner_action_items_select on public.partner_action_items
  for select to authenticated
  using (
    is_staff_of(agency_id)
    or (audience = 'partner' and is_partner_contact_of(group_id))
    or (audience = 'client' and exists (
          select 1 from public.fulfillment_clients fc
            join public.clients cl on cl.id = fc.client_id
           where fc.id = partner_action_items.fulfillment_client_id
             and cl.portal_user_id = auth.uid()))
  );

/**
 * Ask the client for something, and remember where the file came from.
 *
 * The twin of `raise_partner_action`, deliberately the same shape. Idempotent
 * per kind: asking twice returns the first ask rather than stacking two
 * identical requests in somebody's portal.
 */
create or replace function public.raise_client_action(
  p_client uuid, p_kind text default 'client_confirmation',
  p_title text default null, p_detail text default null,
  p_origin_status fulfillment_client_status default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare c public.fulfillment_clients%rowtype; v_id uuid; v_dep public.fulfillment_department;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then return null; end if;

  select id into v_id from public.partner_action_items
   where fulfillment_client_id = p_client and kind = p_kind
     and audience = 'client' and status = 'open';
  if v_id is not null then return v_id; end if;

  /* Where to come back to: the department the ORIGINATING status routes to,
     read from the map rather than from whichever row happens to be open. */
  select r.department into v_dep from public.creditops_status_routing r
   where r.status = p_origin_status and r.kind in ('actionable', 'waiting');

  insert into public.partner_action_items
    (agency_id, group_id, fulfillment_client_id, audience, kind, title, detail,
     requested_by, origin_status, origin_department, needs_routing_review)
  values
    (c.agency_id, c.outsourcing_group_id, p_client, 'client', p_kind,
     coalesce(p_title, 'Confirmation required'),
     coalesce(p_detail, 'We need you to confirm something before this moves on.'),
     auth.uid(), p_origin_status, v_dep,
     /* Nothing to return to. Flagged at the moment the information is
        missing, not discovered when the client answers. */
     p_origin_status is null)
  returning id into v_id;

  perform public.log_audit('client.action_raised', 'client_action', v_id::text,
    c.organization_id, null,
    jsonb_build_object('client', p_client, 'kind', p_kind,
                       'origin_status', p_origin_status, 'origin_department', v_dep));
  return v_id;
end $function$;
revoke all on function public.raise_client_action(uuid, text, text, text, fulfillment_client_status) from public, anon;
grant execute on function public.raise_client_action(uuid, text, text, text, fulfillment_client_status) to authenticated;

/**
 * The client answers, and the file goes back by itself.
 *
 * Dee: "without a manager manually hunting for the file." The origin status is
 * restored, which re-runs the routing trigger and reopens the right department
 * at its entry status. Where no origin was recorded the action still closes —
 * losing the answer would be worse — and `needs_routing_review` is what
 * surfaces it for a human.
 */
create or replace function public.resolve_client_action(p_action uuid, p_response text default null)
returns jsonb
language plpgsql security definer set search_path = public as $function$
declare a public.partner_action_items%rowtype; v_is_client boolean; v_resumed text;
begin
  select * into a from public.partner_action_items where id = p_action;
  if a.id is null then raise exception 'No such action' using errcode = '42501'; end if;
  if a.audience <> 'client' then raise exception 'That is a partner action' using errcode = '22023'; end if;

  select exists (select 1 from public.fulfillment_clients fc
                   join public.clients cl on cl.id = fc.client_id
                  where fc.id = a.fulfillment_client_id and cl.portal_user_id = auth.uid())
    into v_is_client;
  if not (v_is_client or public.is_staff_of(a.agency_id)) then
    raise exception 'Not yours to answer' using errcode = '42501';
  end if;
  if a.status <> 'open' then
    /* Answering twice is a double click, not an error. */
    return jsonb_build_object('already', true, 'resumed', a.origin_status);
  end if;

  update public.partner_action_items
     set status = 'responded', responded_by = auth.uid(), responded_at = now(),
         response = p_response, updated_at = now()
   where id = p_action;

  if a.origin_status is not null then
    update public.fulfillment_clients set status = a.origin_status where id = a.fulfillment_client_id;
    v_resumed := a.origin_status::text;
  end if;

  perform public.log_audit('client.action_resolved', 'client_action', p_action::text,
    null, null, jsonb_build_object('resumed_to', v_resumed, 'by_client', v_is_client));
  return jsonb_build_object('already', false, 'resumed', v_resumed);
end $function$;
revoke all on function public.resolve_client_action(uuid, text) from public, anon;
grant execute on function public.resolve_client_action(uuid, text) to authenticated;
