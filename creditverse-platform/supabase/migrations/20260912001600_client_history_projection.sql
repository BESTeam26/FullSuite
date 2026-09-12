-- =============================================================================
-- One human-readable history, over the raw records that stay exactly as they are.
--
-- Dee, 2026-09-12: merge Progress, Activity History, comments, internal notes,
-- the ClickUp import, completed work, assignments, handoffs, status changes
-- and round changes "into ONE chronological human-readable timeline"; clean
-- `undefined`, `null`, `[object Object]`; "collapse duplicate system companion
-- events in the UI. Keep raw audit rows in backend/admin if needed."
--
-- ── A PROJECTION, NOT A CLEAN-UP ────────────────────────────────────────────
--
-- Nothing is deleted and nothing is rewritten. `activity_events` is
-- append-only by policy and stays byte-for-byte what the triggers wrote; this
-- is a VIEW of it for people. An operator reading "Moved to Complaints" and an
-- auditor reading both underlying rows are looking at the same truth at two
-- levels of detail.
--
-- ── THE DUPLICATE PAIR ──────────────────────────────────────────────────────
--
-- Two triggers record one operational change: `set_client_department_status`
-- writes "Department status", and the table trigger writes "<Department>
-- status changed". Live counts: 42 of the first family, 17 of the second, on
-- the same clients at the same instants. Both are correct audit; showing both
-- to an agent is noise. The projection keeps ONE — the one that names the
-- department, because that is the sentence a person wants — and only when the
-- two describe the same client within the same second.
--
-- ── THE PARSER ARTEFACTS ────────────────────────────────────────────────────
--
-- The ClickUp import wrote sections whose values were the literal strings
-- "undefined" and "null" — Dee: "Never render undefined, null, [object
-- Object]." They are stripped from the PRESENTATION here. The imported note
-- keeps its original text in the row, because provenance is the point of
-- having imported it (rule 10).
-- =============================================================================

/** Strip the artefacts a parser leaves, and any section left empty by it. */
create or replace function public.clean_history_text(p text)
returns text language sql immutable set search_path = public as $function$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(p, ''),
            /* A heading followed by nothing but undefined/null/[object Object] */
            '(?im)^[ \t]*([A-Z0-9 &/\-\.]{3,})[ \t]*:?[ \t]*\r?\n[ \t]*(undefined|null|\[object Object\])[ \t]*\r?$', '', 'g'),
          /* The bare artefact anywhere else */
          '(?i)\m(undefined|null|\[object Object\])\M', '', 'g'),
        /* Three or more blank lines collapse to one */
        '(\r?\n[ \t]*){3,}', E'\n\n', 'g')
    ), '')
$function$;

comment on function public.clean_history_text(text) is
  'Presentation-only cleaning of parser artefacts: `undefined`, `null`, `[object Object]`, and headings left with nothing under them. The stored row is never altered — provenance is why it was imported (Dee, 2026-09-12).';
grant execute on function public.clean_history_text(text) to authenticated;

/**
 * The client's history, as a person reads it.
 *
 * Three sources, one order:
 *   activity_events   status, round, assignment, handoff, comments, imports
 *   production_logs   work actually completed, with what was done
 *   partner actions   what BES asked the partner and what came back
 */
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
  with events as (
    select e.created_at, e.action, e.actor_name, e.detail, e.field,
           e.previous_value, e.new_value,
           /* The department this entry is about, when it says so. */
           case
             when e.field like 'department:%' then split_part(e.field, ':', 2)
             when e.field like 'blocker:%' then split_part(e.field, ':', 2)
             when e.action ~ '^(Dispute|Support|Complaints|Onboarding|Bureau Calling) status changed$'
               then regexp_replace(e.action, ' status changed$', '')
             else null
           end as dept,
           /* The generic companion of a department status change. Dropped
              when its named twin exists at the same instant. */
           (e.action = 'Department status') as is_companion
      from public.activity_events e
     where e.entity_type = 'fulfillment_client'
       and e.entity_id = p_client::text
       /* Machine markers that were never meant for a reader. */
       and e.action not like '[DEPARTMENT_PROGRESS]%'
  ), deduped as (
    select * from events x
     where not (
       x.is_companion
       and exists (
         select 1 from events y
          where not y.is_companion
            and y.dept is not null
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
         d.actor_name,
         d.action,
         public.clean_history_text(d.detail),
         d.dept
    from deduped d

  union all

  /* Work actually completed — the record EOD and production already read, so
     "Progress" stops being a second timeline of the same events. */
  select pl.created_at, 'work',
         coalesce(pr.full_name, pr.email),
         'Work completed — ' || coalesce(pl.department_key, 'CreditOps'),
         public.clean_history_text(
           nullif(array_to_string(pl.actions, ', '), '') ||
           case when pl.work_notes is not null and btrim(pl.work_notes) <> ''
                then E'\n' || pl.work_notes else '' end),
         pl.department_key
    from public.production_logs pl
    left join public.profiles pr on pr.id = pl.employee_id
   where pl.client_id = p_client
     and not pl.is_voided

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
  'One chronological history of a client for people: activity, completed work and partner exchanges, with companion duplicates collapsed and parser artefacts cleaned. A projection — the underlying rows are untouched and remain the audit (Dee, 2026-09-12).';

revoke execute on function public.client_history(uuid) from public, anon;
grant execute on function public.client_history(uuid) to authenticated;
