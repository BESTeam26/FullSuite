-- An archived project's work leaves the attention list.
--
-- Found 2026-10-14, the moment Dee's test project was archived: its 62
-- untouched work units stayed in her Attention Center as overdue. Two gaps,
-- both against a convention the rest of the system already keeps:
--
--   1. crm_project_archive() archived the PROJECT and nothing else. Its
--      work units kept archived_at null, so every reader that filters
--      `archived_at is null` (My Work, the queues, the due-date sweep, the
--      CRM progress and health functions) still saw them as live work.
--      Archiving a project now archives its open units with it — archived,
--      never deleted (rule 11): every unit, file, note and record is kept,
--      exactly as the project event already promises.
--   2. work_attention never filtered archived_at at all. It now does, like
--      every other reader of work_items.
--
-- Data: the open units of projects archived before this migration (today,
-- only "test", 8F Solutions, archived by Dee on 2026-10-14) are archived
-- with their project, stamped with the project's own archive time.
--
-- Cost impact: none.

create or replace function public.crm_project_archive(p_project uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $function$
begin
  perform public.assert_may_manage_crm_project(p_project);
  update public.crm_projects
     set archived_at = coalesce(archived_at, now()), archived_by = auth.uid(),
         archived_reason = p_reason, updated_at = now()
   where id = p_project;
  /* The project's open work goes with it. Completed units already carry
     their completion; archived ones keep their original stamp. */
  update public.work_items
     set archived_at = now(), updated_at = now()
   where related_type = 'project' and related_ref = p_project::text
     and archived_at is null and completed_at is null;
  perform public.log_crm_project_event(p_project, 'Project archived',
    coalesce(nullif(btrim(p_reason), ''), 'Out of active work. Every unit, file, note and record kept.'));
end $function$;

create or replace view public.work_attention
with (security_invoker = true) as
select w.id, w.scope, w.organization_id, w.subject_organization_id, w.related_type, w.related_ref,
       w.title, w.description, w.stage, w.priority, w.assigned_to, w.created_by, w.due_at,
       w.completed_at, w.created_at, w.updated_at, w.agency_id, w.division, w.team_id,
       case
         when w.stage = any (array['Blocked'::public.work_stage, 'Attention'::public.work_stage]) then 'blocked'
         when w.due_at is not null and w.due_at < now() then 'overdue'
         when w.due_at is not null and w.due_at < now() + interval '4 hours' then 'sla_risk'
         else null
       end as attention_reason,
       case when w.due_at is null then null::numeric
            else round(extract(epoch from w.due_at - now()) / 3600.0, 1) end as hours_remaining
  from public.work_items w
 where w.completed_at is null
   and w.archived_at is null
   and (w.stage = any (array['Blocked'::public.work_stage, 'Attention'::public.work_stage])
        or (w.due_at is not null and w.due_at < now() + interval '4 hours'))
   /* test work never reaches a real person's attention (20261014003000) */
   and (not coalesce(w.is_fixture, false) or not public.is_real_person(auth.uid()));

/* Units of projects archived before this rule existed follow their project. */
update public.work_items w
   set archived_at = p.archived_at, updated_at = now()
  from public.crm_projects p
 where w.related_type = 'project' and w.related_ref = p.id::text
   and p.archived_at is not null
   and w.archived_at is null and w.completed_at is null;
