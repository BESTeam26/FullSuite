-- =============================================================================
-- Three features that looked real and were not.
--
-- Found while mapping the client profile for Dee's consolidation. The
-- checklist, the workability blocker and the attachments list were all
-- `useState` in the component — they reset on every reload, and the checklist
-- copy actually admitted it ("they are not saved between visits"). Dee's brief
-- treats all three as real work state, and she ruled: "Do not move broken
-- temporary state into the new UI."
--
-- The attachments one needs no schema at all: `files` already holds 56 real
-- client documents from the ClickUp import, filed under `entity_type='client'`.
-- The screen was showing an empty array beside them. That is a read, fixed in
-- the component.
--
-- The other two need somewhere to live.
--
-- ── THE CHECKLIST BELONGS TO THE DEPARTMENT'S WORK ─────────────────────────
--
-- Not to the client: "gather supporting documents" is a step in the Complaints
-- work, and the same client in Dispute next month needs a different list. Not
-- to `work_checklist_items` either — that table belongs to `work_items`, and a
-- client's department row is not a work item. Keyed on (client, department),
-- which is exactly how the work itself is keyed.
--
-- ── THE BLOCKER BELONGS ON THE DEPARTMENT ROW ──────────────────────────────
--
-- Columns, not a table: a department row is blocked or it is not, and the
-- history of who blocked it and why is already written to `activity_events`
-- by the writer below. A separate table would be a second place to ask the
-- same question.
-- =============================================================================

create table if not exists public.client_work_checklist (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fulfillment_clients(id) on delete cascade,
  department public.fulfillment_department not null,
  label text not null check (btrim(label) <> ''),
  done boolean not null default false,
  done_by uuid references public.profiles(id),
  done_at timestamptz,
  sort int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_work_checklist is
  'Steps for one department''s work on one client. Keyed the way the work is keyed — the same client in another department has its own list (Dee, 2026-09-12).';

create index if not exists client_work_checklist_by_work
  on public.client_work_checklist (client_id, department, sort);

alter table public.client_work_checklist enable row level security;

/* The same reach as the work itself: if you can see the client's department
   row you can see its steps, and if you can work the file you can tick them.
   No second authorization model. */
drop policy if exists client_work_checklist_select on public.client_work_checklist;
create policy client_work_checklist_select on public.client_work_checklist
  for select to authenticated
  using (exists (
    select 1 from public.fulfillment_clients c where c.id = client_id
  ));

drop policy if exists client_work_checklist_write on public.client_work_checklist;
create policy client_work_checklist_write on public.client_work_checklist
  for all to authenticated
  using (exists (select 1 from public.fulfillment_clients c
                  where c.id = client_id and public.is_staff_of(c.agency_id)))
  with check (exists (select 1 from public.fulfillment_clients c
                       where c.id = client_id and public.is_staff_of(c.agency_id)));

create or replace function public.client_work_checklist_touch()
returns trigger language plpgsql set search_path = public as $function$
begin
  new.updated_at := now();
  /* Who ticked it, recorded at the moment it is ticked — not asked for
     afterwards, and not left to the screen to remember. */
  if new.done and not coalesce(old.done, false) then
    new.done_by := auth.uid(); new.done_at := now();
  elsif not new.done and coalesce(old.done, false) then
    new.done_by := null; new.done_at := null;
  end if;
  return new;
end $function$;

drop trigger if exists client_work_checklist_updated on public.client_work_checklist;
create trigger client_work_checklist_updated
  before update on public.client_work_checklist
  for each row execute function public.client_work_checklist_touch();

-- ── The blocker ─────────────────────────────────────────────────────────────
alter table public.client_department_statuses
  add column if not exists blocked_reason text,
  add column if not exists blocked_by uuid references public.profiles(id),
  add column if not exists blocked_at timestamptz;

comment on column public.client_department_statuses.blocked_reason is
  'Why this department cannot proceed. Null means workable. Set through report_work_blocker, which writes the activity entry in the same transaction (Dee, 2026-09-12).';

/**
 * Report or clear a blocker.
 *
 * The reason is required and never pre-filled: the previous implementation
 * used a browser `prompt()` with no default, for exactly this reason — a
 * suggested blocker is how a made-up one gets recorded against a real client
 * by somebody pressing OK.
 *
 * A blocked file stays ASSIGNED. Blocked is not unassigned: the person who
 * owns it is the person who has to unblock it, and releasing it would hand a
 * stuck file to somebody with no context.
 */
create or replace function public.report_work_blocker(
  p_client uuid, p_department public.fulfillment_department, p_reason text
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  v_prev text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_who text;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  if not public.is_staff_of(c.agency_id) then
    raise exception 'Only BES staff can report a blocker' using errcode = '42501';
  end if;

  select blocked_reason into v_prev from public.client_department_statuses
   where client_id = p_client and department = p_department;
  if not found then
    raise exception 'There is no % work open on this client', p_department using errcode = '22023';
  end if;
  if v_prev is not distinct from v_reason then return; end if;

  update public.client_department_statuses
     set blocked_reason = v_reason,
         blocked_by = case when v_reason is null then null else auth.uid() end,
         blocked_at = case when v_reason is null then null else now() end,
         updated_at = now()
   where client_id = p_client and department = p_department;

  select coalesce(full_name, email) into v_who from public.profiles where id = auth.uid();

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(), v_who,
     case when v_reason is null then 'Blocker cleared' else 'Blocker reported' end,
     coalesce(v_reason, 'This file is workable again.'),
     'blocker:' || p_department::text, v_prev, v_reason, 'bes_internal');
end $function$;

revoke execute on function public.report_work_blocker(uuid, public.fulfillment_department, text) from public, anon;
grant execute on function public.report_work_blocker(uuid, public.fulfillment_department, text) to authenticated;
