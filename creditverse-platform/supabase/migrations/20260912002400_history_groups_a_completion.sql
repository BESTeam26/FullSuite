-- =============================================================================
-- One completion is one entry, however many records it wrote.
--
-- Dee, 2026-09-12: "Do NOT create five noisy timeline messages because five
-- boxes were checked… The normal History projection should intelligently group
-- the related events into the same completion block."
--
-- Completing work legitimately writes several records: a production log, a
-- credit status change, a department status change, an assignment change, a
-- handoff. Every one is correct audit and every one must stay. But five
-- consecutive lines for one click is a timeline nobody reads.
--
-- ── GROUPED, NOT DELETED ────────────────────────────────────────────────────
--
-- The production log is the anchor: it is the record of somebody finishing
-- work, it carries the actions and the note, and it has an author and a time.
-- System events within a short window of one, for the same client, are folded
-- into it as consequences rather than listed as peers.
--
-- The window is 90 seconds. A completion writes its records inside a
-- transaction and the triggers that follow run immediately; anything a minute
-- and a half later is somebody doing something else.
--
-- Nothing is deleted. `activity_events` is untouched, the individual checklist
-- rows keep their own `done_by` and `done_at`, and an auditor reading the raw
-- tables sees every record. This is what a person reads.
-- =============================================================================

create or replace function public.client_history(p_client uuid)
returns table (
  happened_at timestamptz,
  kind text,
  actor text,
  title text,
  detail text,
  department text
)
language sql stable security definer set search_path = public as $function$
  with completions as (
    select pl.id, pl.created_at, pl.department_key, pl.employee_id,
           pl.actions, pl.work_notes, pl.resulting_status
      from public.production_logs pl
     where pl.client_id = p_client and not pl.is_voided
  ), events as (
    select e.id, e.created_at, e.action, e.actor_name, e.detail, e.field,
           case
             when e.field like 'department:%' then split_part(e.field, ':', 2)
             when e.field like 'blocker:%' then split_part(e.field, ':', 2)
             when e.action ~ '^(Dispute|Support|Complaints|Onboarding|Bureau Calling) status changed$'
               then regexp_replace(e.action, ' status changed$', '')
             else null
           end as dept,
           (e.action = 'Department status') as is_companion,
           /* A consequence of a completion: a system change that happened
              within the same moment as somebody finishing work. Human notes
              are never folded away — an agent's own words always show. */
           exists (
             select 1 from completions c
              where e.created_at between c.created_at - interval '90 seconds'
                                     and c.created_at + interval '90 seconds'
           ) and e.action in (
             'Status changed', 'Status change', 'Department status', 'Assignee changed',
             'Handed off', 'Round changed', 'Dispute status changed', 'Support status changed',
             'Complaints status changed', 'Onboarding status changed', 'Bureau Calling status changed'
           ) as folds_into_completion
      from public.activity_events e
     where e.entity_type = 'fulfillment_client'
       and e.entity_id = p_client::text
       and e.action not like '[DEPARTMENT_PROGRESS]%'
  ), deduped as (
    select * from events x
     where not x.folds_into_completion
       and not (
         x.is_companion
         and exists (
           select 1 from events y
            where not y.is_companion and y.dept is not null
              and y.created_at between x.created_at - interval '2 seconds'
                                   and x.created_at + interval '2 seconds'
         ))
  )
  select d.created_at,
         case
           when d.action ilike '%comment%' or d.action ilike '%note%' then 'note'
           when d.action ilike '%imported%' or d.action ilike '%clickup%' then 'import'
           when d.action ilike '%assign%' then 'assignment'
           when d.action ilike '%hand%off%' then 'handoff'
           else 'change'
         end,
         d.actor_name, d.action,
         public.clean_history_text(d.detail), d.dept
    from deduped d

  union all

  /* The completion block: what was done, the note, and where it went — the
     consequences folded in rather than listed beside it. */
  select c.created_at, 'work',
         coalesce(pr.full_name, pr.email),
         'Completed ' || coalesce(c.department_key, 'CreditOps') || ' work',
         public.clean_history_text(
           coalesce(
             (select string_agg('✓ ' || a, E'\n') from unnest(c.actions) as a),
             '')
           || case when c.work_notes is not null and btrim(c.work_notes) <> ''
                   then E'\n\n' || c.work_notes else '' end
           || case when c.resulting_status is not null
                   then E'\n\nNext: ' || c.resulting_status else '' end),
         c.department_key
    from completions c
    left join public.profiles pr on pr.id = c.employee_id

  union all

  select a.requested_at, 'partner',
         coalesce(pr.full_name, pr.email),
         'Sent to the partner — ' || a.title,
         public.clean_history_text(a.detail), null
    from public.partner_action_items a
    left join public.profiles pr on pr.id = a.requested_by
   where a.fulfillment_client_id = p_client

  union all

  select a.responded_at, 'partner',
         coalesce(pr.full_name, pr.email),
         'Partner responded',
         public.clean_history_text(a.response), null
    from public.partner_action_items a
    left join public.profiles pr on pr.id = a.responded_by
   where a.fulfillment_client_id = p_client and a.responded_at is not null

  order by 1 desc
$function$;

comment on function public.client_history(uuid) is
  'One chronological history for people. A completion is ONE entry carrying its actions, note and outcome — the status, department, assignment and handoff records it wrote are folded in rather than listed beside it. Nothing is deleted; activity_events remains the audit (Dee, 2026-09-12).';
