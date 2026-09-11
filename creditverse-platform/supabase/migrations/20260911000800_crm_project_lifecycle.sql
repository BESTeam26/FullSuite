-- =============================================================================
-- BES CRM project lifecycle: complete, archive, restore, and a delete that
-- refuses when there is something to lose.
--
-- Dee, 2026-09-11: "I cannot delete the project."
--
-- ── WHY NOT, EXACTLY. THREE INDEPENDENT BLOCKERS ────────────────────────────
--
-- 1. THERE IS NO CONTROL. Nothing in `src/components/bes-crm/` renders a
--    Delete or an Archive. Not a button wired to nothing — no button. This is
--    the one Dee actually hit.
--
-- 2. THE TABLE REFUSES EVERY DELETE. `crm_projects` has row-level security on
--    with policies for SELECT, INSERT and UPDATE and none for DELETE, so
--    default-deny refuses it for everybody including the owner. A direct API
--    call would have failed too.
--
-- 3. THE FOREIGN KEYS WOULD HAVE MADE IT WORSE IF IT HAD WORKED. Every
--    reference to `crm_projects` is ON DELETE CASCADE — engines, work_items,
--    client requirements, milestones — and `work_items` cascades on to
--    checklist items, blockers and field values while orphaning time entries.
--    Deleting Dee's "Test" project would have destroyed 13 work items and 7
--    milestones. It would not even have got that far: `production_logs`
--    references work_items ON DELETE RESTRICT and that project has 13
--    production records, so Postgres would have raised a foreign-key error
--    with no explanation a person could act on.
--
-- So the fix is not "add a DELETE policy". The table stays closed and the only
-- door is a function that knows what is worth keeping.
--
-- ── ARCHIVE WAS ALWAYS THE INTENT ───────────────────────────────────────────
--
-- `archived_at` and `archived_reason` already exist, and `fetchCrmProjects`
-- already filters `.is("archived_at", null)`. The columns were there and
-- nothing ever wrote them.
--
-- ── COMPLETION IS AN EVENT, NOT A STATUS ────────────────────────────────────
--
-- There is no status column and there must not be one: progress is derived
-- from the work units (rule 17b — the system reports, the agent does not).
-- `completed_at` is not a second opinion about progress; it is the explicit
-- delivery event, which is NOT derivable — a build can be 100% built and not
-- yet handed over or accepted. So the event is recorded and everything else
-- stays derived.
-- =============================================================================

alter table public.crm_projects
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists completion_note text,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

comment on column public.crm_projects.completed_at is
  'When BES delivered this build. An explicit event, not a status: progress stays derived from the work units, and a project can be fully built without yet being handed over.';

create index if not exists crm_projects_active_idx
  on public.crm_projects (agency_id)
  where archived_at is null and completed_at is null;

-- ── What a delete would cost ────────────────────────────────────────────────
/**
 * The reasons this project may not be destroyed, in words a person can act on.
 * Empty array means it is genuinely disposable.
 *
 * Read on its own by the interface BEFORE offering the action, so Delete is
 * explained rather than attempted and refused (Dee: "do not silently fail").
 */
create or replace function public.crm_project_deletion_blockers(p_project uuid)
returns text[]
language sql stable security definer set search_path = public as $function$
  select coalesce(array_agg(reason order by reason), '{}')
    from (
      select 'recorded production (' || count(*) || ')' as reason
        from public.production_logs l
        join public.work_items w on w.id = l.work_item_id
       where w.crm_project_id = p_project
      having count(*) > 0
      union all
      select 'logged time (' || count(*) || ')'
        from public.time_entries t
        join public.work_items w on w.id = t.work_item_id
       where w.crm_project_id = p_project
      having count(*) > 0
      union all
      select 'work that has been started (' || count(*) || ')'
        from public.work_items w
       where w.crm_project_id = p_project and w.stage <> 'Queued'
      having count(*) > 0
      union all
      select 'completed milestones (' || count(*) || ')'
        from public.crm_milestones m
       where m.project_id = p_project and m.completed_at is not null
      having count(*) > 0
      union all
      select 'attached files (' || count(*) || ')'
        from public.files f
       where f.entity_type = 'crm_project' and f.entity_id = p_project::text
      having count(*) > 0
      union all
      select 'client requirements (' || count(*) || ')'
        from public.crm_client_requirements r
       where r.project_id = p_project
      having count(*) > 0
    ) blockers
$function$;
revoke execute on function public.crm_project_deletion_blockers(uuid) from public, anon;
grant execute on function public.crm_project_deletion_blockers(uuid) to authenticated;

-- ── The one place that authorises a lifecycle change ────────────────────────
create or replace function public.assert_may_manage_crm_project(p_project uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $function$
declare v_agency uuid;
begin
  select agency_id into v_agency from public.crm_projects where id = p_project;
  if v_agency is null then
    raise exception 'No such project' using errcode = '22023';
  end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('crm.projects.manage') then
    raise exception 'Managing BES CRM projects is required for this' using errcode = '42501';
  end if;
  return v_agency;
end $function$;
revoke execute on function public.assert_may_manage_crm_project(uuid) from public, anon;
grant execute on function public.assert_may_manage_crm_project(uuid) to authenticated;

/** Timeline entry for a lifecycle change, on the project AND its partner. */
create or replace function public.log_crm_project_event(
  p_project uuid, p_action text, p_detail text)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_org uuid; v_group uuid; v_name text; v_actor text;
begin
  select p.agency_id, p.organization_id, p.partner_group_id, p.name
    into v_agency, v_org, v_group, v_name
    from public.crm_projects p where p.id = p_project;
  select coalesce(pr.full_name, pr.email) into v_actor
    from public.profiles pr where pr.id = auth.uid();

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, visibility)
  values (v_agency, v_org, 'crm_project', p_project::text, auth.uid(), v_actor,
          p_action, p_detail, 'bes_internal');

  /* Also on the partner, because "what happened to this account" is a question
     asked from the partner record, not from a project that may be archived. */
  if v_group is not null then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, visibility)
    values (v_agency, v_org, 'partner', v_group::text, auth.uid(), v_actor,
            p_action, coalesce(v_name, 'A project') || ': ' || p_detail, 'bes_internal');
  end if;
end $function$;
revoke execute on function public.log_crm_project_event(uuid, text, text) from public, anon, authenticated;

-- ── Complete / reopen ───────────────────────────────────────────────────────
create or replace function public.crm_project_complete(p_project uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $function$
begin
  perform public.assert_may_manage_crm_project(p_project);
  update public.crm_projects
     set completed_at = coalesce(completed_at, now()), completed_by = auth.uid(),
         completion_note = p_note, updated_at = now()
   where id = p_project and archived_at is null;
  perform public.log_crm_project_event(p_project, 'Project completed',
    coalesce(nullif(btrim(p_note), ''), 'Delivered. Out of active work, kept in full.'));
end $function$;
revoke execute on function public.crm_project_complete(uuid, text) from public, anon;
grant execute on function public.crm_project_complete(uuid, text) to authenticated;

create or replace function public.crm_project_reopen(p_project uuid)
returns void
language plpgsql security definer set search_path = public as $function$
begin
  perform public.assert_may_manage_crm_project(p_project);
  update public.crm_projects
     set completed_at = null, completed_by = null, completion_note = null,
         archived_at = null, archived_reason = null, archived_by = null,
         updated_at = now()
   where id = p_project;
  perform public.log_crm_project_event(p_project, 'Project reopened',
    'Back in active work. Nothing was recreated — the same project, its units, files and history.');
end $function$;
revoke execute on function public.crm_project_reopen(uuid) from public, anon;
grant execute on function public.crm_project_reopen(uuid) to authenticated;

-- ── Archive / restore ───────────────────────────────────────────────────────
create or replace function public.crm_project_archive(p_project uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $function$
begin
  perform public.assert_may_manage_crm_project(p_project);
  update public.crm_projects
     set archived_at = coalesce(archived_at, now()), archived_by = auth.uid(),
         archived_reason = p_reason, updated_at = now()
   where id = p_project;
  perform public.log_crm_project_event(p_project, 'Project archived',
    coalesce(nullif(btrim(p_reason), ''), 'Out of active work. Every unit, file, note and record kept.'));
end $function$;
revoke execute on function public.crm_project_archive(uuid, text) from public, anon;
grant execute on function public.crm_project_archive(uuid, text) to authenticated;

-- ── Delete, and only when there is nothing to lose ──────────────────────────
/**
 * Permanent, and therefore narrow. Refuses the moment the project holds
 * anything worth keeping, and says which thing — so the interface can offer
 * Archive instead of reporting a failure nobody can act on.
 *
 * The engines, queued units and milestones created WITH the project are
 * scaffolding, not history: they cascade, which is correct for a build nobody
 * ever started. Anything a person touched is a blocker.
 *
 * The partner, the organization, the BES CRM service engagement, the SaaS
 * tenancy and every other project are untouched — none of them references
 * this row, and this function names none of them.
 */
create or replace function public.crm_project_delete(p_project uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_blockers text[]; v_name text; v_agency uuid; v_org uuid; v_group uuid; v_actor text;
begin
  v_agency := public.assert_may_manage_crm_project(p_project);
  v_blockers := public.crm_project_deletion_blockers(p_project);
  if array_length(v_blockers, 1) is not null then
    raise exception 'This project has % and cannot be deleted. Archive it instead — that keeps all of it.',
      array_to_string(v_blockers, ', ') using errcode = '23503';
  end if;

  select p.name, p.organization_id, p.partner_group_id into v_name, v_org, v_group
    from public.crm_projects p where p.id = p_project;
  select coalesce(pr.full_name, pr.email) into v_actor from public.profiles pr where pr.id = auth.uid();

  /* Recorded BEFORE the row goes, and on the partner, which survives it. */
  if v_group is not null then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, visibility)
    values (v_agency, v_org, 'partner', v_group::text, auth.uid(), v_actor,
            'Project deleted',
            coalesce(v_name, 'A project') || ' was deleted. It had no recorded work, time, files or requirements.',
            'bes_internal');
  end if;

  perform public.log_audit('crm_project.deleted', 'crm_project', p_project::text, v_org,
    jsonb_build_object('name', v_name, 'partner_group_id', v_group), null::jsonb);

  delete from public.crm_projects where id = p_project;
end $function$;
revoke execute on function public.crm_project_delete(uuid) from public, anon;
grant execute on function public.crm_project_delete(uuid) to authenticated;

/* No DELETE policy on the table, deliberately. Default-deny stays, and the
   guarded function above is the only door — a policy would be a second way in
   that does not know what is worth keeping. */
