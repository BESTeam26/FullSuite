-- The Agent EOD Submission View (Dee, 2026-10-01) lists each client file
-- worked with its dispute round beside the status. The round is already on
-- the client record; the day's activity now carries it per file. Everything
-- else in the function is unchanged from 20260930033000.
begin;

create or replace function public.eod_day_activity(p_employee uuid, p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with completed as (
    select w.id, w.title, w.priority::text as priority, w.completed_at
      from public.work_items w
     where w.assigned_to = p_employee
       and w.completed_at is not null
       and (w.completed_at at time zone 'America/New_York')::date = p_date
  ),
  worked as (
    select distinct w.id, w.title, w.stage::text as stage
      from public.activity_events a
      join public.work_items w on w.id::text = a.entity_id
     where a.entity_type = 'work_item'
       and a.actor_id = p_employee
       /* The Eastern day as a half-open range — identical to
          (created_at at time zone ET)::date = p_date, and indexable. */
       and a.created_at >= (p_date::timestamp at time zone 'America/New_York')
       and a.created_at <  ((p_date + 1)::timestamp at time zone 'America/New_York')
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
           fc.round::text as round,
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
       and t.kind = 'work'  -- breaks and lunch are the day's rest, not its production
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
                                    'resulting_status', l.resulting_status, 'completed_at', l.completed_at,
                                    'round', l.round)
                                    order by l.completed_at) from logs l), '[]'::jsonb),
    'minutes_logged',   (select total from minutes)
  )
$function$;

commit;
