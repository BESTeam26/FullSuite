-- Agent Profile (Dee's mockup, 2026-09-19): "where we can edit and personalize
-- agent profile." Three small foundations, each a canonical record:
--
-- 1. profiles.tagline — the person's own quote on their profile header.
--    Self-edited under the existing profiles_update_self policy; read wherever
--    the profile is read.
-- 2. member_goals — Goals & Development: a goal a person or their lead sets,
--    with a status, owned by the person. Not a task engine: no assignment,
--    no checklist, no time; a goal that becomes work becomes a work item.
-- 3. production_logs read scope — a TEAM LEAD could not read a teammate's
--    production (is_manager_of only), so the profile's Current Period card
--    would be empty for the one person who coaches them (§20b). The read now
--    uses may_view_workforce_record: self, a lead of their team, or management
--    within its scope. The write policies are unchanged.

alter table public.profiles add column if not exists tagline text
  check (tagline is null or length(tagline) <= 200);
comment on column public.profiles.tagline is
  'The person''s own short quote or motto shown on their profile header. Self-edited.';

create table public.member_goals (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 160),
  status       text not null default 'in_progress'
               check (status in ('not_started', 'in_progress', 'on_track', 'completed')),
  due_on       date,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index member_goals_user_idx on public.member_goals (user_id, created_at desc);
alter table public.member_goals enable row level security;

/* Read: whoever may see the person's workforce record. Write: the person, a
   lead of their team, or management in scope — the same predicate; the
   person is included because a goal is theirs to state. */
create policy member_goals_select on public.member_goals
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id));
create policy member_goals_insert on public.member_goals
  for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id));
create policy member_goals_update on public.member_goals
  for update to authenticated
  using (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id))
  with check (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id));
grant select, insert, update on public.member_goals to authenticated;

create or replace function public.member_goals_touch() returns trigger
language plpgsql as $function$
begin
  new.updated_at := now();
  if new.status = 'completed' and old.status is distinct from 'completed' then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  return new;
end $function$;
create trigger member_goals_touch before update on public.member_goals
  for each row execute function public.member_goals_touch();

drop policy if exists production_logs_select on public.production_logs;
create policy production_logs_select on public.production_logs
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, employee_id));
