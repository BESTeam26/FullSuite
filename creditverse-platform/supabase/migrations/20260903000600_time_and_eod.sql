-- =============================================================================
-- Phase 4 — Time Tracking and auto-derived End of Day
--
-- `production_logs` already exists and is already written by Complete Work, so
-- EOD totals have a real source from day one. What was missing is where the
-- clock events live and where the employee's shift context is kept.
--
-- The engine rules this schema has to hold up (eod-production-engine.ts):
--   1. EOD totals are ALWAYS derived from non-voided production logs.
--   2. Employees never enter production totals — only context.
--   4. One EOD per employee per work date.
--   6. Voided logs are excluded.
--
-- Rules 1, 2 and 4 are enforced HERE rather than in the interface: there is no
-- totals column to write, and a unique index makes a second EOD impossible.
-- =============================================================================

create type public.eod_state as enum (
  'draft', 'submitted', 'needs_clarification', 'reviewed', 'approved'
);

-- -----------------------------------------------------------------------------
-- time_entries — one row per clock-in, closed on clock-out
-- -----------------------------------------------------------------------------
create table public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  employee_id      uuid not null references public.profiles(id) on delete restrict,

  /** Which side of the business the time was spent on. */
  division_id      text not null default 'general',
  organization_id  uuid references public.organizations(id) on delete set null,
  work_item_id     uuid references public.work_items(id) on delete set null,
  client_id        uuid references public.fulfillment_clients(id) on delete set null,

  task_note        text,

  work_date        date not null default (now() at time zone 'utc')::date,
  started_at       timestamptz not null default now(),
  /** NULL means the clock is still running. */
  ended_at         timestamptz,

  /**
   * Derived, never entered. A stored generated column so reporting can sum
   * minutes without every caller repeating the arithmetic (rule 9).
   */
  duration_minutes integer generated always as (
    case
      when ended_at is null then null
      else greatest(0, (extract(epoch from (ended_at - started_at)) / 60)::integer)
    end
  ) stored,

  created_at       timestamptz not null default now(),

  constraint time_entries_ends_after_start_ck
    check (ended_at is null or ended_at >= started_at)
);

/**
 * At most one running clock per person. Without this, a double-tap on Clock In
 * silently creates two open entries and every total from then on is wrong.
 */
create unique index time_entries_one_open_per_employee
  on public.time_entries (employee_id)
  where ended_at is null;

create index time_entries_employee_date_idx
  on public.time_entries (employee_id, work_date desc);
create index time_entries_agency_date_idx
  on public.time_entries (agency_id, work_date desc);

-- -----------------------------------------------------------------------------
-- eod_submissions — the employee's shift context, never their totals
-- -----------------------------------------------------------------------------
create table public.eod_submissions (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  employee_id           uuid not null references public.profiles(id) on delete restrict,
  work_date             date not null,

  state                 public.eod_state not null default 'draft',
  submitted_at          timestamptz,

  /* Context entered by the employee. Deliberately NO totals columns: a stored
     total could drift from the logs it claims to summarise, and rule 1 says the
     logs are the source of truth. Totals are derived at read time. */
  unfinished_work       text,
  blockers              text,
  escalations           text,
  additional_notes      text,
  next_workday_priority text,

  /* Review trail, for when a manager sends one back. */
  reviewed_by           uuid references public.profiles(id) on delete set null,
  reviewed_at           timestamptz,
  review_note           text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

/** Rule 4: one EOD per employee per work date. */
create unique index eod_submissions_one_per_employee_per_day
  on public.eod_submissions (employee_id, work_date);

create index eod_submissions_agency_date_idx
  on public.eod_submissions (agency_id, work_date desc);
create index eod_submissions_state_idx
  on public.eod_submissions (agency_id, state, work_date desc);

create trigger eod_submissions_updated_at before update on public.eod_submissions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- An employee owns their own time and their own EOD. Agency staff can see the
-- team's, because that is what Workforce reporting is for; only a manager may
-- review someone else's. Default deny everywhere else.
-- -----------------------------------------------------------------------------
alter table public.time_entries enable row level security;
alter table public.eod_submissions enable row level security;

create policy time_entries_select on public.time_entries for select to authenticated
  using (employee_id = auth.uid() or public.is_agency_staff());

create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (employee_id = auth.uid());

/* Only your own, and only while it is still open — a closed entry is a
   historical record, not a draft (rule 11). */
create policy time_entries_update on public.time_entries for update to authenticated
  using (employee_id = auth.uid() and ended_at is null)
  with check (employee_id = auth.uid());

create policy eod_submissions_select on public.eod_submissions for select to authenticated
  using (employee_id = auth.uid() or public.is_agency_staff());

create policy eod_submissions_insert on public.eod_submissions for insert to authenticated
  with check (employee_id = auth.uid());

/* The author may edit their own until it leaves draft/needs_clarification; a
   manager may move it through review. Nobody edits an approved EOD. */
create policy eod_submissions_update on public.eod_submissions for update to authenticated
  using (
    (employee_id = auth.uid() and state in ('draft', 'needs_clarification'))
    or public.is_agency_manager_or_above()
  )
  with check (
    (employee_id = auth.uid() and state in ('draft', 'submitted'))
    or public.is_agency_manager_or_above()
  );

-- No delete policy on either table: time and EOD are operational history
-- (rule 11). Corrections happen through a status transition, not a deletion.

-- -----------------------------------------------------------------------------
-- Audit — the same treatment status changes got
-- -----------------------------------------------------------------------------
create or replace function public.log_eod_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_prev  text;
begin
  if tg_op = 'UPDATE' then
    if new.state is not distinct from old.state then
      return new;
    end if;
    v_prev := old.state::text;
  end if;

  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();

  insert into public.activity_events
    (organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value)
  values (null, 'eod_submission', new.id::text, auth.uid(), v_actor,
          case when tg_op = 'INSERT' then 'EOD started' else 'EOD state changed' end,
          coalesce(v_prev, '(new)') || ' → ' || new.state::text,
          'state', v_prev, new.state::text);
  return new;
end $$;

create trigger eod_submissions_activity
  after insert or update on public.eod_submissions
  for each row execute function public.log_eod_activity();

-- -----------------------------------------------------------------------------
-- Grants. Two independent grants reach a function and a table — Supabase's to
-- `anon` and Postgres's default to PUBLIC. Revoking one leaves the other open
-- (migrations 0003/0004/0006). Both are withdrawn explicitly.
-- -----------------------------------------------------------------------------
revoke all on public.time_entries from anon;
revoke all on public.eod_submissions from anon;
revoke execute on function public.log_eod_activity() from public, anon;
