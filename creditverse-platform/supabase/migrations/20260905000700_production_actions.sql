-- 0148 — one file is one unit, and the nine things done inside it survive.
--
-- ---------------------------------------------------------------------------
-- THE DOCTRINE, UNCHANGED
--
--   Production units  = files worked.       One file, one unit.
--   Actions completed = what happened inside the file.
--
-- An agent who completes one client file having ticked nine actions has done
-- ONE unit of production and NINE actions. Counting the actions as units would
-- inflate the day ninefold and make an agent who works one deep file look like
-- an agent who worked nine shallow ones.
--
-- The opposite mistake is the one this migration fixes: keeping only "1 ×
-- Support" and losing what was actually done. Both numbers are real, they
-- answer different questions, and a system that keeps one of them cannot tell
-- the difference between five files with thirty-five actions and a hundred
-- files with a hundred.
--
-- `production_logs.actions` is already a text[] — so the actions have been
-- durable all along and there is no second production engine to build here.
-- What was missing is the link back to the task, the resulting status, and a
-- correction that does not quietly rewrite the past.
-- ---------------------------------------------------------------------------

alter table public.production_logs
  /** The task this file-completion came from, where there was one. */
  add column if not exists work_item_id     uuid references public.work_items(id) on delete set null,
  /** The workflow status the file moved to on completion. */
  add column if not exists resulting_status text;

create index if not exists production_logs_day_idx
  on public.production_logs (employee_id, work_date) where not is_voided;

comment on column public.production_logs.actions is
  'Every action ticked when the file was completed. Audit detail, never extra production units: one file is one unit however many actions it contained.';

-- ── A correction appends; it never overwrites ────────────────────────────
create table public.production_log_revisions (
  id           uuid primary key default gen_random_uuid(),
  log_id       uuid not null references public.production_logs(id) on delete cascade,
  /** The record as it stood BEFORE this change. */
  previous     jsonb not null,
  reason       text,
  revised_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  revised_at   timestamptz not null default now()
);
create index production_log_revisions_log_idx on public.production_log_revisions (log_id, revised_at desc);

comment on table public.production_log_revisions is
  'What a production record said before somebody corrected it. EOD shows the current result; this keeps the original, so a correction is visible as a correction rather than as the truth all along.';

/* A trigger rather than application code: the history has to survive a writer
   that forgets to record it, and every writer eventually forgets. */
create or replace function public.production_log_record_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.actions is distinct from new.actions
     or old.production_unit_quantity is distinct from new.production_unit_quantity
     or old.production_unit_type is distinct from new.production_unit_type
     or old.work_notes is distinct from new.work_notes
     or old.department is distinct from new.department
     or old.resulting_status is distinct from new.resulting_status
     or old.is_voided is distinct from new.is_voided then
    insert into public.production_log_revisions (log_id, previous, reason)
    values (old.id, jsonb_build_object(
      'actions', to_jsonb(old.actions),
      'production_unit_type', old.production_unit_type,
      'production_unit_quantity', old.production_unit_quantity,
      'department', old.department,
      'work_notes', old.work_notes,
      'resulting_status', old.resulting_status,
      'is_voided', old.is_voided,
      'completed_at', old.completed_at
    ), new.void_reason);
  end if;
  return new;
end $$;
revoke execute on function public.production_log_record_revision() from public, anon, authenticated;
create trigger production_log_record_revision before update on public.production_logs
  for each row execute function public.production_log_record_revision();

alter table public.production_log_revisions enable row level security;
revoke all on public.production_log_revisions from public, anon;
grant select on public.production_log_revisions to authenticated;
/* Visible to whoever may see the log it belongs to. Written only by the
   trigger, which is why there is no insert grant. */
create policy production_log_revisions_select on public.production_log_revisions for select to authenticated
  using (exists (select 1 from public.production_logs p where p.id = production_log_revisions.log_id));

-- ── The day, with BOTH numbers ───────────────────────────────────────────
--
-- Still SECURITY INVOKER: an employee sees their own day and a manager sees
-- their team's, decided by the policies on the tables it reads and not by this
-- function.
create or replace function public.eod_day_activity(p_employee uuid, p_date date)
returns jsonb language sql stable set search_path = public as $$
  with completed as (
    select w.id, w.title, w.priority::text as priority, w.completed_at
      from public.work_items w
     where w.assigned_to = p_employee
       and w.completed_at is not null
       and (w.completed_at at time zone 'UTC')::date = p_date
  ),
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
     where w.assigned_to = p_employee and w.completed_at is null
       and w.stage not in ('Queued', 'Blocked')
  ),
  overdue as (
    select w.id, w.title, w.due_at
      from public.work_items w
     where w.assigned_to = p_employee and w.completed_at is null
       and w.due_at is not null and w.due_at < now()
  ),
  blocked as (
    select w.id, w.title, coalesce(b.note, bb.title, 'Blocked') as reason
      from public.work_items w
      left join public.work_item_blockers b on b.work_item_id = w.id and b.resolved_at is null
      left join public.work_items bb on bb.id = b.blocked_by_id
     where w.assigned_to = p_employee and w.completed_at is null
       and (w.stage = 'Blocked' or b.id is not null)
  ),
  /* One row per file completed. This is the production unit. */
  logs as (
    select p.id, p.division_id, p.department::text as department,
           p.production_unit_type as unit,
           p.production_unit_quantity as units,
           coalesce(p.actions, '{}') as actions,
           coalesce(array_length(p.actions, 1), 0) as action_count,
           p.work_notes, p.resulting_status, p.completed_at,
           coalesce(fc.name, og.name, o.name, p.production_unit_type) as subject
      from public.production_logs p
      left join public.fulfillment_clients fc on fc.id = p.client_id
      left join public.outsourcing_groups og on og.id = p.outsourcing_group_id
      left join public.organizations o on o.id = p.organization_id
     where p.employee_id = p_employee and p.work_date = p_date and not p.is_voided
  ),
  /* How many times each action was ticked across the whole day. */
  action_breakdown as (
    select a.action, count(*)::int as count
      from logs l, unnest(l.actions) as a(action)
     group by a.action
  ),
  /* Files and actions per department, kept apart — the distinction is the
     entire point of this migration. */
  by_department as (
    select coalesce(l.department, l.division_id, 'Unassigned') as department,
           count(*)::int as files,
           coalesce(sum(l.units), 0)::int as units,
           coalesce(sum(l.action_count), 0)::int as actions
      from logs l group by 1
  ),
  minutes as (
    select coalesce(sum(t.duration_minutes), 0)::int as total
      from public.time_entries t
     where t.employee_id = p_employee and t.work_date = p_date and t.ended_at is not null
  )
  select jsonb_build_object(
    'work_date',        p_date,
    'completed',        coalesce((select jsonb_agg(to_jsonb(c) order by c.completed_at) from completed c), '[]'::jsonb),
    'worked',           coalesce((select jsonb_agg(to_jsonb(w)) from worked w), '[]'::jsonb),
    'in_progress',      coalesce((select jsonb_agg(to_jsonb(i)) from in_progress i), '[]'::jsonb),
    'overdue',          coalesce((select jsonb_agg(to_jsonb(o) order by o.due_at) from overdue o), '[]'::jsonb),
    'blocked',          coalesce((select jsonb_agg(to_jsonb(b)) from blocked b), '[]'::jsonb),
    /* Kept for callers that already read it: unit totals, unchanged. */
    'production',       coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'quantity', units))
                                    from (select unit, sum(units)::numeric as units from logs group by unit) u), '[]'::jsonb),
    /* THE TWO NUMBERS. Files are the production unit; actions are what
       happened inside them. Never added together. */
    'files_worked',     (select count(*)::int from logs),
    'production_units', (select coalesce(sum(units), 0)::int from logs),
    'actions_completed',(select coalesce(sum(action_count), 0)::int from logs),
    'action_breakdown', coalesce((select jsonb_agg(to_jsonb(a) order by a.count desc, a.action) from action_breakdown a), '[]'::jsonb),
    'by_department',    coalesce((select jsonb_agg(to_jsonb(d) order by d.files desc) from by_department d), '[]'::jsonb),
    /* File by file, so an EOD can be expanded instead of retyped. */
    'files',            coalesce((select jsonb_agg(jsonb_build_object(
                                    'id', l.id, 'subject', l.subject, 'department', l.department,
                                    'unit', l.unit, 'actions', to_jsonb(l.actions),
                                    'action_count', l.action_count, 'notes', l.work_notes,
                                    'resulting_status', l.resulting_status, 'completed_at', l.completed_at)
                                    order by l.completed_at) from logs l), '[]'::jsonb),
    'minutes_logged',   (select total from minutes)
  )
$$;
revoke execute on function public.eod_day_activity(uuid, date) from public, anon;
grant execute on function public.eod_day_activity(uuid, date) to authenticated;

comment on function public.eod_day_activity(uuid, date) is
  'A person''s workday from the canonical records. Reports files_worked AND actions_completed separately: one file is one production unit however many actions it held. SECURITY INVOKER.';
