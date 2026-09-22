-- Custom columns, on a client list as well as on a work item.
--
-- Dee, 2026-09-22: *"I simply want this to be just like Monday.com and
-- ClickUp. I have Folder (Partner Name), List and Task (Client Name). The task
-- list should be able to create column like dropdown and on the actual list i
-- should be able to change the drop down. dont make it too complicated."*
--
-- ── THE ENGINE ALREADY EXISTED; IT WAS JUST BOLTED TO WORK ITEMS ──────────
--
-- `workspace_fields` already stores a column definition — key, label,
-- field_type ('text', 'select', 'date', 'number'), options — and twenty-three
-- of them are live across seven workspaces, six already dropdowns. The values
-- lived in `work_item_field_values`, keyed by `work_item_id`.
--
-- A CreditOps client is a `fulfillment_clients` row, not a work item, so the
-- values had nowhere to go. The wrong answer is a second table of client
-- fields: customisation is DATA, and one job gets one engine (rules 2, 5 and
-- 17). So the value table becomes generic and the definition table learns
-- what kind of record its column belongs to.
--
-- `work_item_field_values` held three rows. They are carried across and the
-- table is dropped, rather than left behind as a second place to look.

alter table public.workspace_fields
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade,
  add column if not exists entity_type text not null default 'work_item';

alter table public.workspace_fields alter column workspace_id drop not null;

/* A column belongs to a workspace (work items) or to an agency (its CreditOps
   clients) — exactly one, so there is never a field with no home or two. */
alter table public.workspace_fields
  drop constraint if exists workspace_fields_one_owner;
alter table public.workspace_fields
  add constraint workspace_fields_one_owner check (
    (entity_type = 'work_item'         and workspace_id is not null and agency_id is null)
 or (entity_type = 'fulfillment_client' and agency_id is not null and workspace_id is null)
  );

comment on column public.workspace_fields.entity_type is
  'What kind of record this column describes: work_item (scoped to a workspace) or fulfillment_client (scoped to an agency). Dee, 2026-09-22.';

create table if not exists public.custom_field_values (
  field_id    uuid not null references public.workspace_fields(id) on delete cascade,
  /** Carried beside the id so a policy can tell the kinds apart without a join. */
  entity_type text not null,
  entity_id   uuid not null,
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (field_id, entity_id)
);

comment on table public.custom_field_values is
  'One value of one custom column on one record, of any kind. Replaces work_item_field_values, which could only describe a work item (2026-09-22).';

create index if not exists custom_field_values_entity_idx
  on public.custom_field_values (entity_type, entity_id);

insert into public.custom_field_values (field_id, entity_type, entity_id, value, updated_at)
select v.field_id, 'work_item', v.work_item_id, v.value, v.updated_at
  from public.work_item_field_values v
on conflict (field_id, entity_id) do nothing;

/* ── THE TWO MARKETING VIEWS READ THE OLD TABLE ───────────────────────────
   `marketing_work` pulls publish_at, channel and content_type out of it, and
   `marketing_overview` counts over that. Both are dropped and rebuilt against
   the generic table, unchanged in every other respect — same columns, same
   `security_invoker`, same grant — so Sales & Marketing keeps working. */
drop view if exists public.marketing_overview;
drop view if exists public.marketing_work;

drop table if exists public.work_item_field_values;

create view public.marketing_work with (security_invoker = true) as
 select wi.id, wi.workspace_id, w.name as workspace_name, w.partner_group_id,
    g.name as partner_name, wi.title, wi.description, wi.priority, wi.assigned_to,
    coalesce(nullif(btrim(pr.full_name), ''), pr.email::text) as assignee_name,
    wi.team_id, wi.due_at, wi.completed_at, wi.created_at, wi.updated_at,
    wi.status_id, s.key as status_key, s.label as status_label, s.colour as status_colour,
    s."position" as status_position, coalesce(s.is_terminal, false) as is_terminal,
    wi.item_type_id, t.key as item_type_key, t.label as item_type_label,
    wi.campaign_id, c.name as campaign_name,
    fv.publish_on, fv.channel, fv.content_type,
    (select c_1.full_name from public.partner_contacts c_1
      where c_1.group_id = g.id and c_1.is_primary
      order by c_1.created_at limit 1) as partner_contact_name
   from public.work_items wi
   join public.workspaces w on w.id = wi.workspace_id
        and w.module = 'sales_marketing'::public.fulfillment_service and w.archived_at is null
   left join public.outsourcing_groups g on g.id = w.partner_group_id
   left join public.workspace_statuses s on s.id = wi.status_id
   left join public.workspace_item_types t on t.id = wi.item_type_id
   left join public.campaigns c on c.id = wi.campaign_id
   left join public.profiles pr on pr.id = wi.assigned_to
   left join lateral (
     select max(case when f.key = 'publish_at'    then v.value #>> '{}' end) as publish_on,
            max(case when f.key = 'channel'       then v.value #>> '{}' end) as channel,
            max(case when f.key = 'content_type'  then v.value #>> '{}' end) as content_type
       from public.custom_field_values v
       join public.workspace_fields f on f.id = v.field_id
      where v.entity_type = 'work_item' and v.entity_id = wi.id) fv on true
  where wi.archived_at is null;

grant select on public.marketing_work to authenticated;

create view public.marketing_overview with (security_invoker = true) as
 with today as (
   select ((now() at time zone coalesce(a.eod_timezone, 'UTC')))::date as d
     from public.agencies a order by a.created_at limit 1)
 select (select count(*) from public.marketing_partners) as active_partners,
    count(*) filter (where not is_terminal) as open_tasks,
    count(*) filter (where not is_terminal and due_at is not null
                       and due_at::date = (select d from today)) as due_today,
    count(*) filter (where not is_terminal and due_at is not null and due_at < now()) as overdue,
    count(*) filter (where not is_terminal and publish_on is not null
                       and publish_on >= ((select d from today))::text) as content_scheduled,
    count(*) filter (where status_key = 'internal_review') as for_internal_review,
    count(*) filter (where status_key = 'partner_approval') as awaiting_partner_approval
   from public.marketing_work;

grant select on public.marketing_overview to authenticated;

alter table public.custom_field_values enable row level security;
revoke all on public.custom_field_values from public, anon;
grant select, insert, update, delete on public.custom_field_values to authenticated;

/* Reading a value is reading the record it is on: the EXISTS re-enters the
   record's own Row Level Security, so a client somebody may not see carries
   no readable columns either. */
create policy custom_field_values_select on public.custom_field_values
  for select to authenticated using (
    (entity_type = 'work_item'
       and exists (select 1 from public.work_items wi where wi.id = entity_id))
 or (entity_type = 'fulfillment_client'
       and exists (select 1 from public.fulfillment_clients c where c.id = entity_id))
  );

/* Writing one follows the same rule the record uses for its own edits. A
   custom column is NOT a queue status, so it deliberately does not demand
   `creditops_may_work` — anybody who may edit the client may fill in its
   columns. Changing where the file is in the workflow still goes through
   `set_client_department_status`, which does demand it. */
create policy custom_field_values_write on public.custom_field_values
  for all to authenticated using (
    (entity_type = 'work_item'
       and exists (select 1 from public.work_items wi
                    join public.workspace_fields f on f.id = field_id and f.workspace_id = wi.workspace_id
                   where wi.id = entity_id))
 or (entity_type = 'fulfillment_client'
       and public.client_department_writable(entity_id))
  ) with check (
    (entity_type = 'work_item'
       and exists (select 1 from public.work_items wi
                    join public.workspace_fields f on f.id = field_id and f.workspace_id = wi.workspace_id
                   where wi.id = entity_id))
 or (entity_type = 'fulfillment_client'
       and public.client_department_writable(entity_id))
  );

/* ── Who may add or remove a COLUMN ───────────────────────────────────────
   A column is shared configuration: everybody's list changes shape. Reading
   the definitions is open to agency staff; creating, renaming and archiving
   one needs operational management, the same capability that governs the
   other agency-wide settings. The existing workspace policies are untouched;
   these only add the agency-scoped arm. */
create policy workspace_fields_agency_select on public.workspace_fields
  for select to authenticated
  using (agency_id is not null and public.is_staff_of(agency_id));

create policy workspace_fields_agency_write on public.workspace_fields
  for all to authenticated
  using (agency_id is not null and public.is_staff_of(agency_id) and public.agency_can('ops.manage'))
  with check (agency_id is not null and public.is_staff_of(agency_id) and public.agency_can('ops.manage'));
