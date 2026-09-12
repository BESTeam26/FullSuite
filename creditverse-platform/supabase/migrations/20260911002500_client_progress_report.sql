-- =============================================================================
-- What has actually been done for this client.
--
-- Dee, 2026-09-11: "Department Progress must not be a HANDOFF process but a
-- checklist reporting that will allow the team to see what are the things been
-- done for this client, and must be autofill by the complete work or action
-- taken... if the onboarding agent submits a work that onboarding is complete,
-- that will be recorded on the progress report at the top."
--
-- ── WHY THIS IS DERIVED AND NOT A CHECKLIST SOMEBODY TICKS ─────────────────
--
-- Every completion already writes a record. `production_logs` carries the
-- department, the actions chosen, the notes, who did it and when — it is
-- written by Complete Work and is the same row the EOD and production reports
-- count. A checklist beside it would be a second account of the same events,
-- and the two would disagree the first time somebody ticked a box for work
-- that was never logged.
--
-- So the progress report reads the work. Nobody maintains it, nobody can
-- forget to, and it cannot claim something happened that produced no record
-- (rule 17b: the system reports, the agent does not).
--
-- ── WHAT COUNTS AS PROGRESS ─────────────────────────────────────────────────
--
--   completed work        production_logs — the department, the actions taken
--   milestones            the lifecycle events worth seeing at a glance:
--                         mailed, escalated, returned for review, onboarding
--                         follow-ups exhausted
--   migrated history      what ClickUp recorded before BES had the file
--
-- Ordinary chatter is not progress and stays on the timeline where it belongs.
-- =============================================================================

create or replace function public.client_progress_report(p_client uuid)
returns table(
  at          timestamptz,
  department  text,
  headline    text,
  detail      text,
  actor       text,
  kind        text)
language sql stable security definer set search_path = public as $function$
  with allowed as (
    select fc.id, fc.agency_id
      from public.fulfillment_clients fc
     where fc.id = p_client
       and public.is_staff_of(fc.agency_id)
       and public.agency_can('creditops.clients.view')
       and (fc.outsourcing_group_id is null or public.can_see_partner(fc.outsourcing_group_id))
  )
  -- The work itself, as recorded when it was completed.
  select l.completed_at,
         coalesce(l.department::text, l.department_key, '—'),
         case when array_length(l.actions, 1) is null then 'Work completed'
              else array_to_string(l.actions, ', ') end,
         nullif(btrim(coalesce(l.work_notes, '')), ''),
         coalesce(pr.full_name, pr.email, 'BES'),
         'work'
    from public.production_logs l
    join allowed a on a.id = l.client_id
    left join public.profiles pr on pr.id = l.employee_id
   where not l.is_voided

  union all

  -- The moments worth seeing without reading the whole timeline.
  select e.created_at,
         coalesce(e.field, '—'),
         e.action,
         e.detail,
         coalesce(e.actor_name, 'BES'),
         case when e.action = 'Imported from ClickUp' then 'migrated' else 'milestone' end
    from public.activity_events e
    join allowed a on a.id::text = e.entity_id
   where e.entity_type = 'client'
     and e.action in ('Work completed', 'Marked as mailed', 'Back for review',
                      'Escalated to priority', 'Onboarding follow-up exhausted',
                      'Imported from ClickUp')

  order by 1 desc
$function$;

revoke execute on function public.client_progress_report(uuid) from public, anon;
grant execute on function public.client_progress_report(uuid) to authenticated;

comment on function public.client_progress_report(uuid) is
  'What has been done for a client, derived from the records completing work already writes. Nobody maintains it and it cannot claim work that produced no record (Dee, 2026-09-11).';
