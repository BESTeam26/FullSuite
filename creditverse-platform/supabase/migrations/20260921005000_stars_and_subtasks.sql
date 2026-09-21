-- Two things Dee's TalentOps workspace needs that the engine did not have.
--
-- Everything else in the mockup — projects, sub-lists, statuses as rows,
-- fields, checklists, comments, attachments — already exists on the canonical
-- `work_items` engine (rule 17: one engine underneath, always). These are the
-- only two gaps at the data layer, and both are small.
--
--   Starred    a PERSON's shortlist, not a property of the work. Nobody else's
--              star is your business, so the table is keyed by you and RLS
--              shows you only your own.
--   Subtasks   a work item under a work item. One nullable self-reference; a
--              subtask is still a canonical work item with its own status,
--              assignee, time and production, so nothing downstream changes.

create table if not exists public.work_item_stars (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, work_item_id)
);
comment on table public.work_item_stars is
  'A person''s own starred work items (TalentOps MY WORK → Starred). Per person, never shared.';
alter table public.work_item_stars enable row level security;
revoke all on public.work_item_stars from public, anon;
grant select, insert, delete on public.work_item_stars to authenticated;

/* Your stars are yours. You can only star work you can already see — the
   work_items policy decides that, not this one. */
create policy work_item_stars_own on public.work_item_stars
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from public.work_items w where w.id = work_item_id));

alter table public.work_items
  add column if not exists parent_id uuid references public.work_items(id) on delete set null;
comment on column public.work_items.parent_id is
  'The work item this is a subtask of, or null. A subtask is a full work item; the parent is only a grouping.';
create index if not exists work_items_parent_idx on public.work_items (parent_id) where parent_id is not null;

/* A subtask cannot be its own ancestor. One level is what the mockup shows;
   the check stops the obvious cycle rather than walking the whole tree. */
alter table public.work_items drop constraint if exists work_items_not_own_parent;
alter table public.work_items add constraint work_items_not_own_parent check (parent_id is distinct from id);
