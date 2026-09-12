-- =============================================================================
-- For Partner Confirmation: work the PARTNER owns, not a BES employee.
--
-- Dee, 2026-09-11: "Do NOT model the Partner as a BES employee assignee…
-- Create/maintain a canonical Partner Action Required item. It must appear in
-- the Partner Portal."
--
-- The routing engine already clears every BES assignee when a client reaches
-- `For Partner Confirmation`. What was missing is the other half: somebody
-- outside BES has to be told, and their answer has to come back.
--
-- ── WHY A TABLE AND NOT A WORK ITEM ─────────────────────────────────────────
--
-- `work_items` is BES's engine — divisions, teams, assignees, production, EOD.
-- A partner is none of those. Putting external ownership in there would mean
-- every count of BES work, every EOD figure and every workload calculation had
-- to learn to exclude a kind of row that is not BES work at all. This is a
-- small, separate record of one thing: what BES asked the partner, when, and
-- what came back.
--
-- ── WHAT HAPPENS WHEN THEY ANSWER ───────────────────────────────────────────
--
-- Dee: "Once Partner confirmation is completed, automatically route the client
-- to the appropriate next internal department according to the workflow."
--
-- Which status that is, is a BUSINESS rule, so it is stored as a row rather
-- than written into this function — `creditops_status_routing.on_resolved_
-- status`. It is seeded to 'Ready for Processing' because confirmation
-- normally gates a round going out, and changing it is one UPDATE rather than
-- a migration. Flagged to Dee explicitly; nothing here guesses silently.
-- =============================================================================

alter table public.creditops_status_routing
  add column if not exists on_resolved_status public.fulfillment_client_status;

comment on column public.creditops_status_routing.on_resolved_status is
  'For a partner_action row: the credit status the client moves to once the partner answers. A row, not code, so the workflow can change without a migration (Dee, 2026-09-11).';

update public.creditops_status_routing
   set on_resolved_status = 'Ready for Processing'
 where kind = 'partner_action' and on_resolved_status is null;

-- ── The item ────────────────────────────────────────────────────────────────
create table if not exists public.partner_action_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  group_id uuid not null references public.outsourcing_groups(id) on delete cascade,
  fulfillment_client_id uuid references public.fulfillment_clients(id) on delete cascade,
  kind text not null default 'partner_confirmation'
    check (kind in ('partner_confirmation', 'document_required', 'question')),
  title text not null,
  detail text,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  requested_by uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  /* Who at the PARTNER answered, and what they said. */
  responded_by uuid references public.profiles(id),
  responded_at timestamptz,
  response text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.partner_action_items is
  'Something BES is waiting on a partner for. External ownership — never a BES assignment, never counted as BES workload (Dee, 2026-09-11).';

/* One open item per client per kind: re-entering the status must not stack up
   three identical requests in the partner''s portal. */
create unique index if not exists partner_action_items_one_open
  on public.partner_action_items (fulfillment_client_id, kind)
  where status = 'open' and fulfillment_client_id is not null;

create index if not exists partner_action_items_by_group
  on public.partner_action_items (group_id, status);

alter table public.partner_action_items enable row level security;

/**
 * BES staff who may see the partner, and the partner's own contacts. The
 * partner branch resolves through `is_partner_contact_of`, which now also
 * requires portal access to be switched on — so turning the portal off hides
 * these too, without this policy knowing anything about that.
 */
drop policy if exists partner_action_items_select on public.partner_action_items;
create policy partner_action_items_select on public.partner_action_items
  for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_partner_contact_of(group_id));

/* Written only through the functions below — never by a client directly, so a
   partner cannot invent a completed confirmation. */
drop policy if exists partner_action_items_insert on public.partner_action_items;
drop policy if exists partner_action_items_update on public.partner_action_items;

-- ── Raising one ─────────────────────────────────────────────────────────────
create or replace function public.raise_partner_action(
  p_client uuid, p_kind text default 'partner_confirmation',
  p_title text default null, p_detail text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  v_id uuid;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null or c.outsourcing_group_id is null then return null; end if;

  select id into v_id from public.partner_action_items
   where fulfillment_client_id = p_client and kind = p_kind and status = 'open';
  if v_id is not null then return v_id; end if;

  insert into public.partner_action_items
    (agency_id, group_id, fulfillment_client_id, kind, title, detail, requested_by)
  values
    (c.agency_id, c.outsourcing_group_id, p_client, p_kind,
     coalesce(p_title, 'Partner confirmation required'),
     coalesce(p_detail, 'BES needs your confirmation before this file moves on.'),
     auth.uid())
  returning id into v_id;

  perform public.log_audit('partner.action_raised', 'partner_action', v_id::text,
    c.organization_id, null,
    jsonb_build_object('client', p_client, 'group', c.outsourcing_group_id, 'kind', p_kind));
  return v_id;
end $function$;
revoke execute on function public.raise_partner_action(uuid, text, text, text) from public, anon;
grant execute on function public.raise_partner_action(uuid, text, text, text) to authenticated;

-- ── The partner's own view and answer ───────────────────────────────────────
create or replace function public.my_partner_actions()
returns table (
  id uuid, kind text, title text, detail text, status text,
  client_name text, requested_by_name text, requested_at timestamptz,
  responded_at timestamptz, response text
)
language sql stable security definer set search_path = public as $function$
  select a.id, a.kind, a.title, a.detail, a.status,
         c.name, coalesce(p.full_name, p.email), a.requested_at,
         a.responded_at, a.response
    from public.partner_action_items a
    left join public.fulfillment_clients c on c.id = a.fulfillment_client_id
    left join public.profiles p on p.id = a.requested_by
   where a.group_id = public.partner_group_of_user()
   order by (a.status = 'open') desc, a.requested_at desc
$function$;
revoke execute on function public.my_partner_actions() from public, anon;
grant execute on function public.my_partner_actions() to authenticated;

/**
 * The partner answers, and the file moves on.
 *
 * Only a contact of the partner the item belongs to — `partner_group_of_user`
 * resolves one group for the caller and the item must be in it, so a partner
 * cannot answer another partner's request by guessing an id.
 */
create or replace function public.my_partner_action_respond(
  p_action uuid, p_response text
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  a public.partner_action_items%rowtype;
  v_next public.fulfillment_client_status;
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
    select r.on_resolved_status into v_next
      from public.fulfillment_clients c
      join public.creditops_status_routing r on r.status = c.status
     where c.id = a.fulfillment_client_id and r.kind = 'partner_action';

    /* Only when the client is STILL waiting on this partner. If BES has moved
       the file on in the meantime, the answer is recorded and the status is
       left alone rather than dragged backwards. */
    if v_next is not null then
      update public.fulfillment_clients set status = v_next
       where id = a.fulfillment_client_id;
    end if;

    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values
      (a.agency_id, null, 'fulfillment_client', a.fulfillment_client_id::text, auth.uid(), v_who,
       'Partner confirmed',
       coalesce(nullif(btrim(coalesce(p_response, '')), ''), 'Confirmed by the partner.'),
       'partner_action', 'Waiting on partner',
       coalesce(v_next::text, 'Answered'), 'shared_with_partner');
  end if;

  perform public.log_audit('partner.action_responded', 'partner_action', p_action::text, null,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'completed', 'response', p_response, 'next_status', v_next));
end $function$;
revoke execute on function public.my_partner_action_respond(uuid, text) from public, anon;
grant execute on function public.my_partner_action_respond(uuid, text) to authenticated;

-- ── The engine raises one automatically ─────────────────────────────────────
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
    /* The partner has to be TOLD. Idempotent: re-entering the status finds
       the open item and does not raise a second one. */
    perform public.raise_partner_action(p_client, 'partner_confirmation', null, null);
    perform public.creditops_refresh_headline(p_client);
    return;
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

  /* Whatever the partner was asked, they are no longer being waited on. */
  update public.partner_action_items
     set status = 'cancelled', cancelled_reason = 'The file moved on', updated_at = now()
   where fulfillment_client_id = p_client and status = 'open' and kind = 'partner_confirmation';

  perform public.creditops_refresh_headline(p_client);
end $function$;
