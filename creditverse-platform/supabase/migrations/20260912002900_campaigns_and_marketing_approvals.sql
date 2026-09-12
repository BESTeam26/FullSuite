-- =============================================================================
-- Campaigns, and partner approvals that are not CreditOps confirmations.
--
-- ── CAMPAIGNS ARE THE ONE GENUINELY NEW CONCEPT ─────────────────────────────
--
-- Dee, 2026-09-12: "Add the one genuinely new concept: campaigns. Keep it
-- small… Do not make Campaign itself another task board engine. It groups
-- work."
--
-- A campaign is not a task and not a board. A board is a VIEW over work; a
-- campaign is a thing with its own dates, owner and status that work belongs
-- to. So: one table, one nullable column on `work_items`, and nothing else. A
-- task does not have to belong to one.
--
-- ── APPROVALS REUSE THE PARTNER ACTION MODEL ────────────────────────────────
--
-- `partner_action_items` already carries what an approval needs: the partner,
-- who asked, when, the response, the audit. Two new kinds and one new outcome
-- — "changes requested" — and marketing approvals work.
--
-- `origin_status` and `origin_department` stay NULL for these, exactly as Dee
-- required: CreditOps semantics are not forced onto marketing. What a
-- marketing approval returns to is the work item it came from, so it carries
-- that instead.
-- =============================================================================

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  /** Null for BES's own campaigns — the workspace already says whose it is. */
  partner_group_id uuid references public.outsourcing_groups(id) on delete set null,
  partner_service_id uuid references public.partner_services(id) on delete set null,
  name text not null check (btrim(name) <> ''),
  description text,
  owner_id uuid references public.profiles(id),
  status text not null default 'planned'
    check (status in ('planned', 'active', 'paused', 'completed', 'archived')),
  starts_on date,
  ends_on date,
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.campaigns is
  'A grouping of marketing work with its own dates, owner and status. Not a board — a board is a view over work; a campaign is something work belongs to (Dee, 2026-09-12).';

create index if not exists campaigns_by_workspace on public.campaigns (workspace_id, status);

alter table public.work_items
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

comment on column public.work_items.campaign_id is
  'The campaign this work belongs to, when it belongs to one. Nullable by design: most work does not.';

create index if not exists work_items_by_campaign on public.work_items (campaign_id)
  where campaign_id is not null;

alter table public.campaigns enable row level security;

/* The workspace decides. A campaign is visible to whoever may see the
   workspace it lives in — no second visibility rule to keep in step. */
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select to authenticated
  using (exists (select 1 from public.workspaces w
                  where w.id = workspace_id and public.is_staff_of(w.agency_id)));

drop policy if exists campaigns_write on public.campaigns;
create policy campaigns_write on public.campaigns
  for all to authenticated
  using (exists (select 1 from public.workspaces w
                  where w.id = workspace_id and public.is_staff_of(w.agency_id))
         and public.agency_can('marketing.tasks.manage'))
  with check (exists (select 1 from public.workspaces w
                       where w.id = workspace_id and public.is_staff_of(w.agency_id))
              and public.agency_can('marketing.tasks.manage'));

-- ── Marketing approvals ─────────────────────────────────────────────────────
alter table public.partner_action_items
  drop constraint if exists partner_action_items_kind_check;
alter table public.partner_action_items
  add constraint partner_action_items_kind_check
  check (kind in ('partner_confirmation', 'document_required', 'question',
                  'content_approval', 'campaign_approval'));

alter table public.partner_action_items
  drop constraint if exists partner_action_items_status_check;
alter table public.partner_action_items
  add constraint partner_action_items_status_check
  check (status in ('open', 'completed', 'cancelled', 'changes_requested'));

alter table public.partner_action_items
  add column if not exists work_item_id uuid references public.work_items(id) on delete cascade,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

comment on column public.partner_action_items.work_item_id is
  'The marketing work this approval is about. Where a CreditOps confirmation carries origin_status and origin_department, a marketing approval carries the item — different context, same record, no CreditOps semantics imposed (Dee, 2026-09-12).';

/* One open approval per item, for the same reason as the CreditOps one: a
   partner should not open their portal to three copies of one question. */
create unique index if not exists partner_action_items_one_open_work
  on public.partner_action_items (work_item_id, kind)
  where status = 'open' and work_item_id is not null;

/**
 * Ask the partner to approve a piece of work.
 *
 * The work moves to `For Partner Approval` in the same breath — a request
 * that leaves the task looking un-sent is how two people chase the same
 * partner.
 */
create or replace function public.request_partner_approval(
  p_work_item uuid, p_kind text default 'content_approval',
  p_title text default null, p_detail text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  w public.work_items%rowtype;
  ws public.workspaces%rowtype;
  v_id uuid;
  v_status uuid;
begin
  select * into w from public.work_items where id = p_work_item;
  if w.id is null then raise exception 'That work does not exist' using errcode = '22023'; end if;
  if not public.agency_can('marketing.tasks.manage') then
    raise exception 'Working marketing items is required' using errcode = '42501';
  end if;

  select * into ws from public.workspaces where id = w.workspace_id;
  if ws.partner_group_id is null then
    raise exception 'This work belongs to BES, so there is no partner to ask' using errcode = '22023';
  end if;

  select id into v_id from public.partner_action_items
   where work_item_id = p_work_item and kind = p_kind and status = 'open';
  if v_id is not null then return v_id; end if;

  insert into public.partner_action_items
    (agency_id, group_id, work_item_id, kind, title, detail, requested_by)
  values (ws.agency_id, ws.partner_group_id, p_work_item, p_kind,
          coalesce(p_title, w.title),
          coalesce(p_detail, 'Please review and approve, or tell us what to change.'),
          auth.uid())
  returning id into v_id;

  select id into v_status from public.workspace_statuses
   where workspace_id = w.workspace_id and key = 'partner_approval';
  if v_status is not null then
    update public.work_items set status_id = v_status, updated_at = now() where id = p_work_item;
  end if;

  perform public.log_audit('marketing.approval_requested', 'work_item', p_work_item::text, null, null,
    jsonb_build_object('kind', p_kind, 'partner', ws.partner_group_id));
  return v_id;
end $function$;
revoke execute on function public.request_partner_approval(uuid, text, text, text) from public, anon;
grant execute on function public.request_partner_approval(uuid, text, text, text) to authenticated;

/**
 * The partner's answer: approved, or changes requested.
 *
 * Approving moves the work to Completed; asking for changes sends it back to
 * In Progress with their comment attached, which is the whole point of having
 * a second outcome rather than only "done".
 */
create or replace function public.my_partner_review(
  p_action uuid, p_approved boolean, p_comment text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  a public.partner_action_items%rowtype;
  w public.work_items%rowtype;
  v_status uuid;
  v_who text;
begin
  select * into a from public.partner_action_items
   where id = p_action and group_id = public.partner_group_of_user();
  if a.id is null then
    raise exception 'That item is not yours to review' using errcode = '42501';
  end if;
  if a.status <> 'open' then
    raise exception 'That item has already been answered' using errcode = '22023';
  end if;
  if a.work_item_id is null then
    raise exception 'That item is not a review' using errcode = '22023';
  end if;

  update public.partner_action_items
     set status = case when p_approved then 'completed' else 'changes_requested' end,
         responded_by = auth.uid(), responded_at = now(),
         response = nullif(btrim(coalesce(p_comment, '')), ''), updated_at = now()
   where id = p_action;

  select * into w from public.work_items where id = a.work_item_id;
  select id into v_status from public.workspace_statuses
   where workspace_id = w.workspace_id
     and key = case when p_approved then 'completed' else 'in_progress' end;
  if v_status is not null then
    update public.work_items
       set status_id = v_status,
           completed_at = case when p_approved then now() else null end,
           updated_at = now()
     where id = a.work_item_id;
  end if;

  select coalesce(full_name, email) into v_who from public.profiles where id = auth.uid();
  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (a.agency_id, null, 'work_item', a.work_item_id::text, auth.uid(), v_who,
     case when p_approved then 'Partner approved' else 'Partner requested changes' end,
     coalesce(nullif(btrim(coalesce(p_comment, '')), ''),
              case when p_approved then 'Approved.' else 'Changes requested.' end),
     'partner_review', 'For Partner Approval',
     case when p_approved then 'Completed' else 'In Progress' end, 'shared_with_partner');

  perform public.log_audit('marketing.approval_answered', 'work_item', a.work_item_id::text, null,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('approved', p_approved, 'comment', p_comment));
end $function$;
revoke execute on function public.my_partner_review(uuid, boolean, text) from public, anon;
grant execute on function public.my_partner_review(uuid, boolean, text) to authenticated;
