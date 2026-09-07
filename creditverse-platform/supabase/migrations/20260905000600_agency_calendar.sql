-- 0147 — the U.S. business calendar, and announcements that do not duplicate.
--
-- ---------------------------------------------------------------------------
-- WHY THE HOLIDAYS ARE ROWS AT ALL
--
-- The dates themselves are computed from the statute (see
-- `lib/calendar/us-federal-holidays`), so nothing here is the source of truth
-- for WHEN Juneteenth is. The rows exist for the things a rule cannot carry:
-- an agency's own closures, company events, a special working day, and a
-- stable identity for the announcements generated against each holiday.
--
-- `source_key` is what makes the whole thing idempotent. Generating 2027 twice
-- inserts nothing the second time, and the seven-day announcement for
-- Thanksgiving exists at most once however many times the job runs.
--
-- ---------------------------------------------------------------------------
-- WHY A FEDERAL HOLIDAY IS NOT EDITABLE
--
-- `system_managed` rows are refused by an UPDATE trigger, not merely hidden
-- from a form. A member of staff cannot accidentally drag Memorial Day, and an
-- admin who wants a different closure adds their OWN event rather than
-- rewriting the statutory one — so the federal date stays correct and the
-- agency's policy sits beside it.
-- ---------------------------------------------------------------------------

create type public.agency_event_kind as enum (
  'us_federal_holiday',
  'custom_holiday',
  'company_event',
  'special_workday'
);

create table public.agency_calendar_events (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  kind           public.agency_event_kind not null,
  /** Stable identity for generated rows, e.g. 'us:juneteenth:2027'. */
  source_key     text,
  name           text not null check (length(trim(name)) between 1 and 120),
  /** The statutory or intended date. */
  event_date     date not null,
  /** The date actually observed. Equal to event_date unless it moved. */
  observed_date  date not null,
  /** BES does not work this day. False for a company event or a special workday. */
  non_working    boolean not null default true,
  notes          text,
  /** Generated from the statute. Not editable by anyone (see the trigger). */
  system_managed boolean not null default false,
  rule_version   text,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  /* One row per generated holiday per agency. Re-running inserts nothing. */
  unique (agency_id, source_key)
);
create index agency_calendar_observed_idx on public.agency_calendar_events (agency_id, observed_date);
create trigger agency_calendar_events_updated_at before update on public.agency_calendar_events
  for each row execute function public.set_updated_at();

create or replace function public.agency_calendar_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.system_managed then
    raise exception 'A U.S. federal holiday is set by statute and cannot be edited. Add a company event instead.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.system_managed then
    raise exception 'A U.S. federal holiday cannot be deleted.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public.agency_calendar_guard() from public, anon, authenticated;
create trigger agency_calendar_guard before update or delete on public.agency_calendar_events
  for each row execute function public.agency_calendar_guard();

alter table public.agency_calendar_events enable row level security;
revoke all on public.agency_calendar_events from public, anon;
grant select, insert, update, delete on public.agency_calendar_events to authenticated;

/* Every staff member sees the calendar — knowing the office is shut is not
   privileged. Only a manager or above adds or changes anything, and the
   trigger above still refuses a system-managed row whoever they are. */
create policy agency_calendar_select on public.agency_calendar_events for select to authenticated
  using (public.is_staff_of(agency_id));
create policy agency_calendar_insert on public.agency_calendar_events for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.is_agency_manager_or_above());
create policy agency_calendar_update on public.agency_calendar_events for update to authenticated
  using (public.is_staff_of(agency_id) and public.is_agency_manager_or_above())
  with check (public.is_staff_of(agency_id) and public.is_agency_manager_or_above());
create policy agency_calendar_delete on public.agency_calendar_events for delete to authenticated
  using (public.is_staff_of(agency_id) and public.is_agency_admin());

comment on table public.agency_calendar_events is
  'The agency business calendar: generated U.S. federal holidays plus the agency''s own closures and events. Federal rows are system-managed and refused by a trigger, so the statutory date cannot drift.';

-- ── Announcements: identity, and a narrower audience ─────────────────────
alter table public.announcements
  /** Deterministic id for a generated announcement. Re-running changes nothing. */
  add column if not exists source_key text,
  add column if not exists agency_id  uuid references public.agencies(id) on delete cascade,
  /** Narrow an internal announcement to one department or team. */
  add column if not exists department_id uuid references public.departments(id) on delete cascade,
  add column if not exists team_id       uuid references public.teams(id) on delete cascade,
  /** Managers and above only — a staffing note the whole floor should not read. */
  add column if not exists managers_only boolean not null default false;

create unique index if not exists announcements_source_key_idx
  on public.announcements (source_key) where source_key is not null;

comment on column public.announcements.source_key is
  'Set on generated announcements so the job is idempotent: running it twice produces one announcement, not two.';

/* The internal audience narrows. `bes_internal` was already staff-only, so a
   partner or an organization user has never been able to read one — that part
   was right and is unchanged. What is added is narrowing WITHIN the staff:
   a department, a team, or managers only. */
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (
    archived_at is null and (
      (organization_id is not null and public.is_org_member(organization_id)
        and (published_at is not null or public.member_can(organization_id, 'settings.manage')))
      or (organization_id is null and audience = 'all_organizations'
        and (published_at is not null or public.is_agency_staff()))
      or (organization_id is null and audience = 'bes_internal'
        and public.is_agency_staff()
        and (not managers_only or public.is_agency_manager_or_above())
        and (department_id is null or exists (
              select 1 from public.agency_memberships am
               where am.user_id = auth.uid() and am.scope_department_id = announcements.department_id))
        and (team_id is null or public.is_member_of_team(team_id) or public.is_agency_manager_or_above()))
    )
  );
