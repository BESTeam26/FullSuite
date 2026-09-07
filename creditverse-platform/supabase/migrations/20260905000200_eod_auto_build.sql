-- 0143 — the End of Day report writes itself, and says who submitted it.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
--
-- EOD auto-derived production totals and nothing else. Everything a person
-- actually did all day — tasks completed, tasks moved, time recorded, what is
-- overdue, what is blocked — they had to retype into a free-text box. The
-- system already knew all of it.
--
-- And the submission had one honest state and no way to be automatic. An
-- agency wanting a cutoff had two bad options: nag people, or write an
-- automatic submission that looks exactly like a person's.
--
-- ---------------------------------------------------------------------------
-- THE MODEL, AS DEE SPECIFIED IT
--
--   during the day   the EOD is a LIVE DRAFT, generated from real activity
--   the employee     reviews it, adds what the system cannot know, submits
--   at cutoff        if nothing was submitted and the agency enabled it, the
--                    system submits the generated report and SAYS SO
--
-- `auto_submitted` and `submitted_by` are separate columns and a constraint
-- keeps them honest: a manual submission names a person, an automatic one
-- names nobody and is flagged. Nothing can produce a row that claims a person
-- confirmed a report they never opened. That is the whole point — the value of
-- an EOD is that somebody stood behind it, and a system that forges that
-- signature destroys the only thing it was measuring.
--
-- A correction after submission appends a revision. The original submission
-- and its time survive, because "what did they report at 6pm" and "what do
-- they say now" are different questions.
-- ---------------------------------------------------------------------------

-- ── How the report was submitted ─────────────────────────────────────────
alter table public.eod_submissions
  add column if not exists auto_submitted boolean not null default false,
  add column if not exists submitted_by   uuid references public.profiles(id) on delete set null,
  /** What the system had generated at the moment of submission. */
  add column if not exists snapshot       jsonb;

/* NOT VALID, deliberately, and this is the interesting part.
   Rows submitted before `submitted_by` existed carry a submission time and no
   submitter, and there is no way to learn who it was: the update policy lets
   the employee OR a manager submit, so the employee_id is a guess dressed as
   a fact. Backfilling it would put a name against a submission that name may
   never have made — the exact forgery the column exists to prevent.
   NOT VALID enforces the rule on every insert and every update from here on
   and leaves the unknowable rows unknowable. Validating it later means
   deciding what those rows mean, which is a decision, not a migration. */
alter table public.eod_submissions
  add constraint eod_submissions_submitter_ck check (
    /* Not submitted: neither a submitter nor an auto flag. */
    (submitted_at is null and submitted_by is null and auto_submitted = false)
    /* Submitted by a person: named. */
    or (submitted_at is not null and auto_submitted = false and submitted_by is not null)
    /* Submitted by the system: nobody named, and flagged as such. */
    or (submitted_at is not null and auto_submitted = true  and submitted_by is null)
  ) not valid;

comment on column public.eod_submissions.auto_submitted is
  'True when the system submitted this at the shift cutoff because nobody did. Never shown as a manual submission — the distinction is the point.';
comment on column public.eod_submissions.submitted_by is
  'The person who submitted. NULL for an automatic submission, which names nobody rather than borrowing the employee''s name.';
comment on column public.eod_submissions.snapshot is
  'The system-generated summary as it stood at submission. Kept so a later correction cannot quietly change what was reported at the time.';

-- ── A correction appends; it does not overwrite ──────────────────────────
create table public.eod_revisions (
  id            uuid primary key default gen_random_uuid(),
  eod_id        uuid not null references public.eod_submissions(id) on delete cascade,
  /** The employee-written fields as they stood BEFORE this revision. */
  previous      jsonb not null,
  reason        text,
  revised_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  revised_at    timestamptz not null default now()
);
create index eod_revisions_eod_idx on public.eod_revisions (eod_id, revised_at desc);

comment on table public.eod_revisions is
  'Append-only history of edits made after submission. The original submission and its time are never overwritten.';

/* Every post-submission edit records what it replaced. A trigger rather than
   application code, because the history has to survive a writer that forgets
   — and every writer eventually forgets. */
create or replace function public.eod_record_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.submitted_at is not null and (
       old.unfinished_work       is distinct from new.unfinished_work
    or old.blockers              is distinct from new.blockers
    or old.escalations           is distinct from new.escalations
    or old.additional_notes      is distinct from new.additional_notes
    or old.next_workday_priority is distinct from new.next_workday_priority
  ) then
    insert into public.eod_revisions (eod_id, previous)
    values (old.id, jsonb_build_object(
      'unfinished_work', old.unfinished_work,
      'blockers', old.blockers,
      'escalations', old.escalations,
      'additional_notes', old.additional_notes,
      'next_workday_priority', old.next_workday_priority,
      'submitted_at', old.submitted_at,
      'auto_submitted', old.auto_submitted
    ));
  end if;
  return new;
end $$;
revoke execute on function public.eod_record_revision() from public, anon, authenticated;
create trigger eod_record_revision before update on public.eod_submissions
  for each row execute function public.eod_record_revision();

alter table public.eod_revisions enable row level security;
revoke all on public.eod_revisions from public, anon;
grant select on public.eod_revisions to authenticated;
/* Visible to whoever may see the EOD it belongs to. Written only by the
   trigger, which is why there is no insert grant. */
create policy eod_revisions_select on public.eod_revisions for select to authenticated
  using (exists (select 1 from public.eod_submissions e where e.id = eod_revisions.eod_id));

-- ── The agency's shift cutoff ────────────────────────────────────────────
alter table public.agencies
  add column if not exists eod_cutoff_local  time,
  add column if not exists eod_auto_submit   boolean not null default false,
  add column if not exists eod_timezone      text not null default 'America/New_York';

comment on column public.agencies.eod_auto_submit is
  'Off by default. When on, a draft still open after the cutoff is submitted by the system and clearly marked auto-submitted.';

-- ── What the day actually contained ──────────────────────────────────────
--
-- SECURITY INVOKER, deliberately. Every table it reads has its own policy, so
-- an employee sees their own day and a manager sees their team's exactly as
-- far as `in_scope` already allows — and not one row further. Making this
-- DEFINER would have quietly turned the EOD screen into a way to read anyone's
-- work.
create or replace function public.eod_day_activity(p_employee uuid, p_date date)
returns jsonb language sql stable set search_path = public as $$
  with completed as (
    select w.id, w.title, w.priority::text as priority, w.completed_at
      from public.work_items w
     where w.assigned_to = p_employee
       and w.completed_at is not null
       and (w.completed_at at time zone 'UTC')::date = p_date
  ),
  /* "Worked on" is a change the person themselves made — the activity trail,
     not the item's updated_at, which also moves when somebody else touches
     it or a trigger fires. */
  worked as (
    select distinct w.id, w.title, w.stage::text as stage
      from public.activity_events a
      join public.work_items w on w.id::text = a.entity_id
     where a.entity_type = 'work_item'
       and a.actor_id = p_employee
       and (a.created_at at time zone 'UTC')::date = p_date
       and w.id not in (select id from completed)
  ),
  in_progress as (
    select w.id, w.title, w.stage::text as stage, w.due_at
      from public.work_items w
     where w.assigned_to = p_employee
       and w.completed_at is null
       and w.stage not in ('Queued', 'Blocked')
  ),
  overdue as (
    select w.id, w.title, w.due_at
      from public.work_items w
     where w.assigned_to = p_employee
       and w.completed_at is null
       and w.due_at is not null
       and w.due_at < now()
  ),
  blocked as (
    select w.id, w.title,
           coalesce(b.note, bb.title, 'Blocked') as reason
      from public.work_items w
      left join public.work_item_blockers b
        on b.work_item_id = w.id and b.resolved_at is null
      left join public.work_items bb on bb.id = b.blocked_by_id
     where w.assigned_to = p_employee
       and w.completed_at is null
       and (w.stage = 'Blocked' or b.id is not null)
  ),
  production as (
    select p.production_unit_type as unit,
           sum(p.production_unit_quantity)::numeric as quantity
      from public.production_logs p
     where p.employee_id = p_employee and p.work_date = p_date and not p.is_voided
     group by p.production_unit_type
  ),
  minutes as (
    select coalesce(sum(t.duration_minutes), 0)::int as total
      from public.time_entries t
     where t.employee_id = p_employee and t.work_date = p_date and t.ended_at is not null
  )
  select jsonb_build_object(
    'work_date',      p_date,
    'completed',      coalesce((select jsonb_agg(to_jsonb(c) order by c.completed_at) from completed c), '[]'::jsonb),
    'worked',         coalesce((select jsonb_agg(to_jsonb(w)) from worked w), '[]'::jsonb),
    'in_progress',    coalesce((select jsonb_agg(to_jsonb(i)) from in_progress i), '[]'::jsonb),
    'overdue',        coalesce((select jsonb_agg(to_jsonb(o) order by o.due_at) from overdue o), '[]'::jsonb),
    'blocked',        coalesce((select jsonb_agg(to_jsonb(b)) from blocked b), '[]'::jsonb),
    'production',     coalesce((select jsonb_agg(to_jsonb(p)) from production p), '[]'::jsonb),
    'minutes_logged', (select total from minutes)
  )
$$;
revoke execute on function public.eod_day_activity(uuid, date) from public, anon;
grant execute on function public.eod_day_activity(uuid, date) to authenticated;

comment on function public.eod_day_activity(uuid, date) is
  'What a person''s workday actually contained, from the canonical records. SECURITY INVOKER: the caller sees exactly what their own policies allow.';

-- ── The cutoff ───────────────────────────────────────────────────────────
--
-- Runs lazily: the EOD screen and the manager dashboard call it, and it
-- submits anything already past its cutoff. No scheduler to depend on, and
-- calling it twice is harmless — the WHERE clause only ever finds drafts.
create or replace function public.eod_run_cutoff(p_agency uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_cutoff  time;
  v_enabled boolean;
  v_tz      text;
  v_count   int := 0;
begin
  if not public.is_staff_of(p_agency) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select eod_cutoff_local, eod_auto_submit, eod_timezone
    into v_cutoff, v_enabled, v_tz
    from public.agencies where id = p_agency;
  if not coalesce(v_enabled, false) or v_cutoff is null then
    return 0;
  end if;

  /* Only days whose cutoff has genuinely passed in the agency's own timezone.
     `submitted_by` stays NULL and `auto_submitted` is set: the row says the
     system did this, and the constraint above makes any other combination
     impossible. */
  with due as (
    select e.id
      from public.eod_submissions e
     where e.agency_id = p_agency
       and e.submitted_at is null
       and ((e.work_date + v_cutoff) at time zone v_tz) < now()
  )
  update public.eod_submissions e
     set state          = 'submitted',
         submitted_at   = now(),
         auto_submitted = true,
         submitted_by   = null,
         snapshot       = public.eod_day_activity(e.employee_id, e.work_date)
    from due
   where e.id = due.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.eod_run_cutoff(uuid) from public, anon;
grant execute on function public.eod_run_cutoff(uuid) to authenticated;

comment on function public.eod_run_cutoff(uuid) is
  'Submits drafts left open past the agency cutoff, marked auto_submitted with no submitter named. Idempotent; safe to call on page load.';
