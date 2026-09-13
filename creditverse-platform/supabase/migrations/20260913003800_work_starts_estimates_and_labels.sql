-- 0338 — a work item can start, be estimated, and be labelled.
--
-- ---------------------------------------------------------------------------
-- DESIGNED ONCE, AT THE GENERIC LAYER
--
-- Dee, 2026-09-13: "D-013 and D-014 share start_date, estimated time and
-- labels. Design these ONCE at the generic workspace/work-item layer where
-- they genuinely belong. Do not add one implementation for TalentOps and
-- another for BES CRM."
--
-- So none of this mentions TalentOps or BES CRM. They are properties of a
-- piece of work: when it is meant to begin, how long somebody thinks it will
-- take, and what it is about. CreditOps and Sales & Marketing get them too,
-- because they were always missing there as well.
-- ---------------------------------------------------------------------------

-- ── 1. When the work is meant to START ──────────────────────────────────
--
-- `due_at` alone cannot express "this runs Monday to Friday", which is what a
-- timeline view draws and what a workload calculation needs in order to spread
-- effort over days instead of piling it on the due date.
alter table public.work_items
  add column if not exists start_at timestamptz;

comment on column public.work_items.start_at is
  'When the work is meant to begin. Null means "whenever it is picked up" — most work. Paired with due_at it gives a timeline bar and lets workload spread effort across days rather than stacking it on the deadline.';

/* A start after its own due date is a data-entry slip, and the billing engine
   already taught this lesson the expensive way: an invoice generated due
   before it was issued queued fifteen real reminder emails (KNOWN-ISSUES §3).
   Refuse it at the table rather than hoping a form is careful. */
alter table public.work_items drop constraint if exists work_items_start_before_due;
alter table public.work_items
  add constraint work_items_start_before_due
  check (start_at is null or due_at is null or start_at <= due_at);

create index if not exists work_items_start_idx
  on public.work_items (start_at) where start_at is not null and archived_at is null;

-- ── 2. How long somebody thinks it will take ────────────────────────────
--
-- ESTIMATED only. Actual time is NOT stored here: `time_entries` already
-- carries `work_item_id`, so actual is a sum, and a stored copy of a sum is a
-- second truth that drifts (rule 2).
alter table public.work_items
  add column if not exists estimated_minutes integer
  check (estimated_minutes is null or (estimated_minutes > 0 and estimated_minutes <= 60 * 24 * 30));

comment on column public.work_items.estimated_minutes is
  'A person''s estimate, in minutes. ACTUAL time is never stored here — it is sum(duration_minutes) over time_entries for this work item, because a stored copy of a derivable number is a second truth that drifts.';

/* Estimated vs actual, in one place, so no screen re-derives it differently. */
create or replace function public.work_item_time(p_item uuid)
returns table (estimated_minutes integer, actual_minutes integer)
language sql stable security invoker set search_path = public as $function$
  select w.estimated_minutes,
         coalesce((select sum(t.duration_minutes)::int from public.time_entries t
                    where t.work_item_id = w.id), 0)
    from public.work_items w
   where w.id = p_item
$function$;
revoke execute on function public.work_item_time(uuid) from public, anon;
grant execute on function public.work_item_time(uuid) to authenticated;

comment on function public.work_item_time(uuid) is
  'Estimated against actual for one work item. INVOKER, so work_items_select decides whether the caller may see it at all.';

-- ── 3. Labels ───────────────────────────────────────────────────────────
--
-- Deliberately AGENCY-scoped rather than workspace-scoped. A label is only
-- worth having if "show me everything tagged Onboarding" works across the
-- partners and modules a manager is looking at; one private set per workspace
-- would make the same word mean a different row five times over.
create table if not exists public.work_labels (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 40),
  colour     text not null default 'slate',
  sort       integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
/* Case-insensitive, so "Onboarding" and "onboarding" cannot both exist and
   split the same filter in two. */
create unique index if not exists work_labels_name_idx
  on public.work_labels (agency_id, lower(trim(name))) where archived_at is null;

comment on table public.work_labels is
  'Cross-module labels for work. Agency-scoped on purpose: a label whose meaning stops at a workspace boundary cannot answer "everything tagged Onboarding", which is the only reason to have labels at all.';

create table if not exists public.work_item_labels (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  label_id     uuid not null references public.work_labels(id) on delete cascade,
  added_by     uuid references public.profiles(id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (work_item_id, label_id)
);
create index if not exists work_item_labels_label_idx on public.work_item_labels (label_id);

-- ── Authorization: labels follow the work, never widen it ───────────────
--
-- "May I label this?" must be exactly "may I see this?", and the only correct
-- answer to the second is `work_items_select` itself — a compound of
-- workspace_reach, is_staff_of, bes_engaged_with, in_scope, org_scope_allows
-- and the subject-organization branch. Copying that expression here would
-- create a second opinion that drifts the first time either changes.
--
-- So this is SECURITY INVOKER over `work_items`: RLS answers, and the two can
-- never disagree because there is only one of them.
create or replace function public.work_item_readable(p_item uuid)
returns boolean
language sql stable security invoker set search_path = public as $function$
  select exists (select 1 from public.work_items w where w.id = p_item)
$function$;
revoke execute on function public.work_item_readable(uuid) from public, anon;
grant execute on function public.work_item_readable(uuid) to authenticated;

comment on function public.work_item_readable(uuid) is
  'Whether the caller may see this work item. INVOKER on purpose: work_items_select is the answer, so nothing here can become a second, looser opinion about who may reach work.';

alter table public.work_labels enable row level security;
alter table public.work_item_labels enable row level security;
revoke all on public.work_labels from public, anon;
revoke all on public.work_item_labels from public, anon;
grant select, insert, update on public.work_labels to authenticated;
grant select, insert, delete on public.work_item_labels to authenticated;
-- No delete on work_labels: a label in use is archived, never removed, or the
-- history of what was tagged changes retroactively (rule 11).

drop policy if exists work_labels_select on public.work_labels;
create policy work_labels_select on public.work_labels for select to authenticated
  using (public.is_staff_of(agency_id));

drop policy if exists work_labels_insert on public.work_labels;
create policy work_labels_insert on public.work_labels for insert to authenticated
  with check (public.is_staff_of(agency_id) and created_by = auth.uid());

drop policy if exists work_labels_update on public.work_labels;
create policy work_labels_update on public.work_labels for update to authenticated
  using (public.is_staff_of(agency_id) and public.is_agency_manager_or_above())
  with check (public.is_staff_of(agency_id));

/* The important one: whether you may label a work item is whether you may SEE
   that work item, asked through the invoker helper above — so a label can
   never become a side door onto work (rule 1). */
drop policy if exists work_item_labels_select on public.work_item_labels;
create policy work_item_labels_select on public.work_item_labels for select to authenticated
  using (public.work_item_readable(work_item_id));

drop policy if exists work_item_labels_insert on public.work_item_labels;
create policy work_item_labels_insert on public.work_item_labels for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.work_item_readable(work_item_id)
    and exists (select 1 from public.work_labels l
                 where l.id = label_id and l.archived_at is null
                   and public.is_staff_of(l.agency_id))
  );

drop policy if exists work_item_labels_delete on public.work_item_labels;
create policy work_item_labels_delete on public.work_item_labels for delete to authenticated
  using (public.work_item_readable(work_item_id));
