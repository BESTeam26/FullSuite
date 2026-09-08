-- 0223 — BES CRM: one action drives the rest of the system.
--
-- ===========================================================================
-- DEE §53, THE PERMANENT RULE
-- ===========================================================================
--
--   "ONE ACTION SHOULD CREATE ALL APPROPRIATE DERIVED RECORDS… without Agent
--    separately updating seven screens."
--
-- An agent completes a work unit. From that one call: the confirmed actions
-- are ticked, the unit completes or goes to QA, downstream work is assigned,
-- ONE activity event is written — and everything else follows from records
-- that already exist. Production comes from the completion trigger. EOD comes
-- from `eod_day_activity`, which reads work items and production logs.
-- Notifications come from 0218's triggers on that one activity row. Progress,
-- state and health are functions (0222) and were never stored.
--
-- SO THE THINGS THIS FUNCTION DOES NOT DO ARE THE POINT: it does not write
-- production, does not write EOD, does not recalculate progress, does not
-- send a notification. Those would each be a second copy of a truth.
--
-- ===========================================================================
-- READINESS IS DERIVED, SO A HANDOFF IS ASSIGNMENT — NOT "OPENING"
-- ===========================================================================
--
-- §20 asks that standard next work open automatically. It already does:
-- `crm_work_unit_ready` is a function over dependencies, so the moment a unit
-- completes, everything that depended on it IS ready. Nothing has to open it,
-- and there is no state to forget to set.
--
-- What a handoff therefore does is the part a function cannot infer: WHO picks
-- it up. It assigns the target to a team or a person and records the handoff
-- once, which is what §23 asks for — "use existing Team / Person / Work
-- assignment architecture" — and why no duplicate assignment is created.
--
-- ===========================================================================
-- QA MOVES THE UNIT; IT DOES NOT CLONE IT
-- ===========================================================================
--
-- §30/§64 want QA to open by itself, and §32 wants the WORK UNIT to complete
-- when QA passes. Both are true of one item moving through `Ready for QA`, and
-- only awkwardly true of a second QA work item — which would double the
-- production count, appear as a second row in My Work, and leave two things to
-- complete. So the unit itself moves, and `work_items.previous_assigned_to`
-- (which already exists) remembers who to hand it back to when QA fails.
-- ===========================================================================

----------------------------------------------------------------------
-- 1. Instantiate one engine into a project (§11)
--
--    Only the units of the engines actually bought. An engine that was not
--    selected produces nothing here — there is no "Not Applicable" row.
----------------------------------------------------------------------
create or replace function public.crm_instantiate_engine(
  p_project uuid, p_engine text, p_template uuid)
returns integer
language plpgsql security invoker set search_path = public as $function$
declare
  v_p      public.crm_projects;
  v_t      record;
  v_item   uuid;
  v_count  integer := 0;
  v_req    uuid;
begin
  select * into v_p from public.crm_projects where id = p_project;
  if v_p.id is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  for v_t in
    select u.* from public.crm_work_unit_templates u
     where u.template_id = p_template
     order by u.sort, u.title
  loop
    insert into public.work_items
      (agency_id, scope, organization_id, subject_organization_id, related_type, related_ref,
       title, description, stage, division, team_id,
       partner_group_id, partner_service_id,
       crm_project_id, crm_engine_key, crm_work_unit_template_id, due_at)
    values
      (v_p.agency_id, 'AGENCY', null, v_p.organization_id, 'project', p_project::text,
       v_t.title, v_t.description, 'Queued', 'bes_crm',
       coalesce(v_t.default_team_id, v_p.team_id),
       v_p.partner_group_id, v_p.partner_service_id,
       p_project, p_engine, v_t.id,
       case when v_t.target_days is not null and v_p.started_on is not null
            then (v_p.started_on + v_t.target_days)::timestamptz end)
    returning id into v_item;
    v_count := v_count + 1;

    /* The checklist — the tracked actions inside one meaningful unit (§13). */
    insert into public.work_checklist_items (work_item_id, label, position)
    select v_item, a.label, a.sort
      from public.crm_work_unit_template_actions a
     where a.work_unit_template_id = v_t.id and a.kind = 'checklist'
     order by a.sort;

    /* What the CLIENT owes, and which unit it holds up (§33). Deduplicated
       per project: two units needing DNS access is one requirement. */
    for v_req in
      select a.id from public.crm_work_unit_template_actions a
       where a.work_unit_template_id = v_t.id and a.kind = 'client_requirement'
    loop
      declare v_existing uuid; v_label text; v_detail text; v_reqid uuid;
      begin
        select label, detail, requirement_id into v_label, v_detail, v_reqid
          from public.crm_work_unit_template_actions where id = v_req;
        select id into v_existing from public.crm_client_requirements
         where project_id = p_project and label = v_label limit 1;
        if v_existing is null then
          insert into public.crm_client_requirements (project_id, requirement_id, label, detail)
          values (p_project, v_reqid, v_label, v_detail)
          returning id into v_existing;
        end if;
        insert into public.crm_client_requirement_blocks (requirement_id, work_item_id)
        values (v_existing, v_item) on conflict do nothing;
        /* The unit waits on the client from the start — it is not READY, and
           it does not stop any sibling (§18, §33). */
        update public.work_items
           set waiting_on = 'client', waiting_since = now(),
               waiting_note = 'Waiting on the client: ' || v_label
         where id = v_item and waiting_on is null;
      end;
    end loop;
  end loop;
  return v_count;
end $function$;
revoke execute on function public.crm_instantiate_engine(uuid, text, uuid) from public, anon;
grant execute on function public.crm_instantiate_engine(uuid, text, uuid) to authenticated;

comment on function public.crm_instantiate_engine(uuid, text, uuid) is
  'Creates the work units of ONE engine from its template version. SECURITY INVOKER: the row policies decide whether the caller may write, exactly as handoff_client_departments does — this is atomicity, not authority.';

----------------------------------------------------------------------
-- 1b. Milestones for the engines actually bought (§11, §20)
----------------------------------------------------------------------
create or replace function public.crm_instantiate_milestones(
  p_project uuid, p_engines text[])
returns integer
language plpgsql security invoker set search_path = public as $function$
declare v_agency uuid; v_n integer;
begin
  select agency_id into v_agency from public.crm_projects where id = p_project;
  if v_agency is null then return 0; end if;

  insert into public.crm_milestones
    (project_id, key, label, engine_key, work_item_id, client_visible, sort)
  select p_project, t.key, t.label, t.engine_key,
         /* Tie it to the unit whose completion completes it, when there is
            one in this project (§20). */
         (select w.id from public.work_items w
           where w.crm_project_id = p_project
             and t.work_unit_title is not null
             and w.title = t.work_unit_title
           limit 1),
         t.client_visible, t.sort
    from public.crm_milestone_templates t
   where t.agency_id = v_agency
     and (t.engine_key is null or t.engine_key = any (p_engines))
  on conflict (project_id, key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;
revoke execute on function public.crm_instantiate_milestones(uuid, text[]) from public, anon;
grant execute on function public.crm_instantiate_milestones(uuid, text[]) to authenticated;

----------------------------------------------------------------------
-- 2. Create a project (§10)
----------------------------------------------------------------------
create or replace function public.crm_create_project(
  p_name             text,
  p_engines          text[],
  p_partner_group    uuid    default null,
  p_organization     uuid    default null,
  p_preset           text    default null,
  p_started_on       date    default current_date,
  p_target_go_live   date    default null,
  p_lead             uuid    default null,
  p_team             uuid    default null,
  p_partner_service  uuid    default null)
returns uuid
language plpgsql security invoker set search_path = public as $function$
declare
  v_agency  uuid := public.my_agency_id();
  v_project uuid;
  v_engine  text;
  v_tmpl    uuid;
begin
  if v_agency is null then
    raise exception 'not BES staff' using errcode = '42501';
  end if;
  if p_engines is null or array_length(p_engines, 1) is null then
    /* §11: a project IS its selected engines. One with none would be a
       project nobody can work, and silently creating it hides the mistake. */
    raise exception 'A project needs at least one build engine' using errcode = '22023';
  end if;
  /* §50 — said out loud rather than discovered.
     `crm_projects_select` already refuses somebody whose scope excludes BES
     CRM, and because this function returns an id, that refusal arrived as
     "new row violates row-level security policy" on the INSERT … RETURNING.
     True, and useless: a division-scoped CreditOps manager reading that would
     look for a permission problem. The policy is still the protection; this
     is the sentence. */
  if not public.in_scope(v_agency, 'bes_crm'::public.fulfillment_service,
                         p_team, p_lead, auth.uid()) then
    raise exception 'Your scope does not include BES CRM' using errcode = '42501';
  end if;

  insert into public.crm_projects
    (agency_id, partner_group_id, organization_id, partner_service_id, name,
     preset, started_on, target_go_live, lead_id, team_id)
  values
    (v_agency, p_partner_group, p_organization, p_partner_service, p_name,
     p_preset, p_started_on, p_target_go_live, p_lead, p_team)
  returning id into v_project;

  foreach v_engine in array p_engines loop
    /* The newest PUBLISHED version. A draft is somebody's work in progress
       and must not become a live project's build standard. */
    select id into v_tmpl
      from public.crm_engine_templates
     where agency_id = v_agency and engine_key = v_engine and status = 'published'
     order by version desc limit 1;
    if v_tmpl is null then
      raise exception 'No published template for the % engine', v_engine using errcode = '22023';
    end if;
    insert into public.crm_project_engines (project_id, engine_key, template_id)
    values (v_project, v_engine, v_tmpl);
    perform public.crm_instantiate_engine(v_project, v_engine, v_tmpl);
  end loop;

  /* Milestones: the project-level ones always, the engine-scoped ones only
     for engines actually bought (§11, §20). */
  perform public.crm_instantiate_milestones(v_project, p_engines);
  return v_project;
end $function$;
revoke execute on function public.crm_create_project(text, text[], uuid, uuid, text, date, date, uuid, uuid, uuid) from public, anon;
grant execute on function public.crm_create_project(text, text[], uuid, uuid, text, date, date, uuid, uuid, uuid) to authenticated;

----------------------------------------------------------------------
-- 3. Add an engine mid-project (§48) and cancel one (§49)
----------------------------------------------------------------------
create or replace function public.crm_add_engine(p_project uuid, p_engine text)
returns integer
language plpgsql security invoker set search_path = public as $function$
declare v_agency uuid; v_tmpl uuid; v_n integer;
begin
  select agency_id into v_agency from public.crm_projects where id = p_project;
  if v_agency is null then raise exception 'project not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.crm_project_engines
              where project_id = p_project and engine_key = p_engine and cancelled_at is null) then
    raise exception 'The % engine is already in this project', p_engine using errcode = '22023';
  end if;
  select id into v_tmpl from public.crm_engine_templates
   where agency_id = v_agency and engine_key = p_engine and status = 'published'
   order by version desc limit 1;
  if v_tmpl is null then
    raise exception 'No published template for the % engine', p_engine using errcode = '22023';
  end if;
  insert into public.crm_project_engines (project_id, engine_key, template_id)
  values (p_project, p_engine, v_tmpl)
  on conflict (project_id, engine_key) do update
    set template_id = excluded.template_id, cancelled_at = null, cancelled_reason = null,
        added_at = now(), added_by = auth.uid();
  v_n := public.crm_instantiate_engine(p_project, p_engine, v_tmpl);
  /* An added engine brings its own milestones (§48). */
  perform public.crm_instantiate_milestones(p_project, array[p_engine]);
  return v_n;
end $function$;
revoke execute on function public.crm_add_engine(uuid, text) from public, anon;
grant execute on function public.crm_add_engine(uuid, text) to authenticated;

comment on function public.crm_add_engine(uuid, text) is
  'Adds a purchased engine to a running project (Dee §48): same partner, same project, new scope. Explicit by design — a template change must never add work to an active project on its own (§47).';

create or replace function public.crm_cancel_engine(p_project uuid, p_engine text, p_reason text)
returns integer
language plpgsql security invoker set search_path = public as $function$
declare v_n integer;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Cancelling an engine needs a reason' using errcode = '22023';
  end if;
  update public.crm_project_engines
     set cancelled_at = now(), cancelled_reason = p_reason
   where project_id = p_project and engine_key = p_engine and cancelled_at is null;
  if not found then
    raise exception 'That engine is not active on this project' using errcode = 'P0002';
  end if;
  /* Archive the OPEN work and release its assignments. Completed work and its
     production, EOD and activity are untouched — history is not rewritten
     (rule 11), and the other engines keep running (§49). */
  update public.work_items
     set archived_at = now(), archived_reason = 'Engine cancelled: ' || p_reason,
         assigned_to = null, previous_assigned_to = assigned_to
   where crm_project_id = p_project and crm_engine_key = p_engine
     and completed_at is null and archived_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;
revoke execute on function public.crm_cancel_engine(uuid, text, text) from public, anon;
grant execute on function public.crm_cancel_engine(uuid, text, text) to authenticated;

----------------------------------------------------------------------
-- 4. THE completion action (§21, §22, §53)
----------------------------------------------------------------------
create or replace function public.crm_complete_work_unit(
  p_unit          uuid,
  p_actions       uuid[]  default '{}',
  p_note          text    default null,
  p_targets       uuid[]  default '{}',
  p_keep_open     boolean default false,
  p_handoff_team  uuid    default null,
  p_handoff_to    uuid    default null)
returns jsonb
language plpgsql security invoker set search_path = public as $function$
declare
  v_w        public.work_items;
  v_requires boolean := false;
  v_ticked   integer := 0;
  v_titles   text[]  := '{}';
  v_outcome  text;
  v_target   uuid;
  v_title    text;
begin
  select * into v_w from public.work_items where id = p_unit;
  if v_w.id is null or v_w.crm_project_id is null then
    raise exception 'Not a BES CRM work unit' using errcode = 'P0002';
  end if;
  if v_w.completed_at is not null then
    raise exception 'That work unit is already complete' using errcode = '22023';
  end if;

  /* ── the actions the agent confirmed ─────────────────────────────────── */
  if p_actions is not null and array_length(p_actions, 1) is not null then
    update public.work_checklist_items
       set done = true, done_by = auth.uid(), done_at = now()
     where work_item_id = p_unit and id = any (p_actions) and not done;
    get diagnostics v_ticked = row_count;
  end if;

  select coalesce(t.requires_qa, false) into v_requires
    from public.crm_work_unit_templates t where t.id = v_w.crm_work_unit_template_id;

  /* ── what happens to THIS unit ───────────────────────────────────────── */
  if p_keep_open then
    /* §22B — open downstream work while this stays In Progress. No fake
       status change, which is the whole reason this option exists. */
    update public.work_items
       set stage = case when stage in ('Queued', 'Assigned') then 'In Processing'::public.work_stage else stage end
     where id = p_unit;
    v_outcome := 'kept_open';
  elsif v_requires and v_w.stage not in ('Ready for QA', 'QA Review') then
    /* §30 — QA opens by itself, and the unit MOVES rather than being cloned.
       Who to give it back to on a failure is remembered here (§31). */
    update public.work_items
       set stage = 'Ready for QA',
           previous_assigned_to = assigned_to,
           assigned_to = null,
           /* The review has not happened yet, and saying so is different from
              saying nothing (§30). */
           qa_result = 'pending', qa_feedback = null,
           waiting_on = null, waiting_since = null, waiting_note = null
     where id = p_unit;
    v_outcome := 'sent_to_qa';
  else
    update public.work_items
       set stage = 'Completed',
           waiting_on = null, waiting_since = null, waiting_note = null
     where id = p_unit;
    v_outcome := 'completed';
  end if;
  if not found then
    raise exception 'You may not change that work unit' using errcode = '42501';
  end if;

  /* ── the handoff: WHO picks up the next work (§20, §23) ──────────────
     Readiness is derived, so nothing has to be "opened". What a handoff
     records is the assignment, and it may name several targets at once. */
  if p_targets is not null and array_length(p_targets, 1) is not null then
    foreach v_target in array p_targets loop
      update public.work_items
         set team_id     = coalesce(p_handoff_team, team_id),
             assigned_to = coalesce(p_handoff_to, assigned_to),
             stage = case
                       when p_handoff_to is not null and stage = 'Queued' then 'Assigned'::public.work_stage
                       else stage
                     end
       where id = v_target
         and crm_project_id = v_w.crm_project_id
         and completed_at is null
         and archived_at is null
      returning title into v_title;
      if v_title is not null then v_titles := v_titles || v_title; end if;
    end loop;
  end if;

  /* ── ONE activity event. Everything downstream reads it. ─────────────
     0218's rule 5 notifies on `field = 'handoff'`, so the receiving people
     are told by the existing trigger rather than by a second write here. */
  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail,
     field, previous_value, new_value, visibility)
  values
    (v_w.agency_id, v_w.subject_organization_id, 'work_item', p_unit::text, auth.uid(),
     case when array_length(v_titles, 1) is not null then 'Handed off' else 'Work unit completed' end,
     v_w.title
       || case when v_ticked > 0 then ' — ' || v_ticked || ' action' || case when v_ticked = 1 then '' else 's' end || ' confirmed' else '' end
       || case when array_length(v_titles, 1) is not null then ' → ' || array_to_string(v_titles, ', ') else '' end
       || case when p_note is not null and length(trim(p_note)) > 0 then ' — ' || trim(p_note) else '' end,
     case when array_length(v_titles, 1) is not null then 'handoff' else 'stage' end,
     v_w.stage::text,
     case when array_length(v_titles, 1) is not null then array_to_string(v_titles, ', ') else v_outcome end,
     'bes_internal');

  return jsonb_build_object(
    'outcome', v_outcome,
    'actionsConfirmed', v_ticked,
    'handedOffTo', coalesce(to_jsonb(v_titles), '[]'::jsonb));
end $function$;
revoke execute on function public.crm_complete_work_unit(uuid, uuid[], text, uuid[], boolean, uuid, uuid) from public, anon;
grant execute on function public.crm_complete_work_unit(uuid, uuid[], text, uuid[], boolean, uuid, uuid) to authenticated;

comment on function public.crm_complete_work_unit(uuid, uuid[], text, uuid[], boolean, uuid, uuid) is
  'The one action an agent takes (Dee §53). Ticks the confirmed actions, completes the unit or sends it to QA, assigns the downstream work, and writes ONE activity event. It deliberately does NOT write production, EOD, progress or notifications — those already follow from the completion trigger, eod_day_activity, the 0222 functions and 0218''s triggers.';

----------------------------------------------------------------------
-- 5. QA outcomes (§31, §32)
----------------------------------------------------------------------
create or replace function public.crm_fail_qa(p_unit uuid, p_feedback text)
returns void
language plpgsql security invoker set search_path = public as $function$
declare v_w public.work_items;
begin
  if p_feedback is null or length(trim(p_feedback)) = 0 then
    raise exception 'QA feedback is required to return work' using errcode = '22023';
  end if;
  select * into v_w from public.work_items where id = p_unit;
  if v_w.id is null or v_w.crm_project_id is null then
    raise exception 'Not a BES CRM work unit' using errcode = 'P0002';
  end if;
  if v_w.stage not in ('Ready for QA', 'QA Review') then
    raise exception 'That work unit is not in QA' using errcode = '22023';
  end if;

  /* Back to the team that built it, automatically — no manager rebuilds the
     task (§31). `previous_assigned_to` is who to return it to. */
  update public.work_items
     set stage = 'In Processing',
         assigned_to = coalesce(v_w.previous_assigned_to, v_w.assigned_to),
         previous_assigned_to = null,
         /* The RESULT, on the unit — not a project relabel (§9, §30). */
         qa_result = 'needs_fix', qa_feedback = trim(p_feedback),
         qa_reviewed_by = auth.uid(), qa_reviewed_at = now()
   where id = p_unit;

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail,
     field, previous_value, new_value, visibility)
  values
    (v_w.agency_id, v_w.subject_organization_id, 'work_item', p_unit::text, auth.uid(),
     'QA returned', trim(p_feedback), 'stage', v_w.stage::text, 'In Processing', 'bes_internal');
end $function$;
revoke execute on function public.crm_fail_qa(uuid, text) from public, anon;
grant execute on function public.crm_fail_qa(uuid, text) to authenticated;

comment on function public.crm_fail_qa(uuid, text) is
  'QA sends work back to whoever built it, with the feedback attached (Dee §31). The activity row it writes is also what crm_project_health reads as an at-risk signal, and what 0218 notifies the assignee about — one event, three consumers.';

create or replace function public.crm_pass_qa(p_unit uuid, p_note text default null)
returns jsonb
language plpgsql security invoker set search_path = public as $function$
declare v_r jsonb;
begin
  update public.work_items
     set qa_result = 'passed', qa_feedback = p_note,
         qa_reviewed_by = auth.uid(), qa_reviewed_at = now()
   where id = p_unit and stage in ('Ready for QA', 'QA Review');
  if not found then
    raise exception 'That work unit is not in QA' using errcode = '22023';
  end if;
  /* A pass IS a completion, so it goes through the same door — which is how
     production, EOD, progress and the next handoffs stay identical whether a
     unit needed QA or not (§32). */
  v_r := public.crm_complete_work_unit(p_unit, '{}'::uuid[], coalesce(p_note, 'QA passed'), '{}'::uuid[], false, null, null);
  return v_r;
end $function$;
revoke execute on function public.crm_pass_qa(uuid, text) from public, anon;
grant execute on function public.crm_pass_qa(uuid, text) to authenticated;

----------------------------------------------------------------------
-- 6. Waiting, and the client requirement that clears it (§33)
----------------------------------------------------------------------
create or replace function public.crm_set_waiting(
  p_unit uuid, p_reason public.work_waiting_reason, p_note text default null)
returns void
language plpgsql security invoker set search_path = public as $function$
begin
  update public.work_items
     set waiting_on = p_reason,
         waiting_since = coalesce(waiting_since, now()),
         waiting_note = p_note
   where id = p_unit and crm_project_id is not null and completed_at is null;
  if not found then
    raise exception 'That work unit cannot be set waiting' using errcode = '22023';
  end if;
end $function$;
revoke execute on function public.crm_set_waiting(uuid, public.work_waiting_reason, text) from public, anon;
grant execute on function public.crm_set_waiting(uuid, public.work_waiting_reason, text) to authenticated;

create or replace function public.crm_satisfy_client_requirement(p_requirement uuid, p_note text default null)
returns integer
language plpgsql security invoker set search_path = public as $function$
declare v_project uuid; v_label text; v_released integer;
begin
  update public.crm_client_requirements
     set satisfied_at = now(), satisfied_by = auth.uid(), satisfied_note = p_note
   where id = p_requirement and satisfied_at is null
  returning project_id, label into v_project, v_label;
  if v_project is null then
    raise exception 'That requirement is not outstanding' using errcode = 'P0002';
  end if;

  /* Release every unit this held up — unless another requirement still holds
     it. §33: "dependent Work Units automatically become Ready", and nobody
     updates three statuses by hand. */
  update public.work_items w
     set waiting_on = null, waiting_since = null, waiting_note = null
   where w.id in (select b.work_item_id from public.crm_client_requirement_blocks b
                   where b.requirement_id = p_requirement)
     and w.completed_at is null
     and not exists (
       select 1 from public.crm_client_requirement_blocks b2
         join public.crm_client_requirements r2 on r2.id = b2.requirement_id
        where b2.work_item_id = w.id and r2.satisfied_at is null);
  get diagnostics v_released = row_count;

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail,
     field, new_value, visibility)
  select p.agency_id, p.organization_id, 'crm_project', p.id::text, auth.uid(),
         'Client requirement satisfied',
         v_label || case when v_released > 0
                         then ' — ' || v_released || ' work unit' || case when v_released = 1 then '' else 's' end || ' released'
                         else '' end,
         'client_requirement', v_label, 'shared_with_partner'
    from public.crm_projects p where p.id = v_project;

  return v_released;
end $function$;
revoke execute on function public.crm_satisfy_client_requirement(uuid, text) from public, anon;
grant execute on function public.crm_satisfy_client_requirement(uuid, text) to authenticated;

comment on function public.crm_satisfy_client_requirement(uuid, text) is
  'One explicit event (§54 — never inferred) releases every work unit it held up, unless another requirement still holds the same unit. Independent units were never touched, so the rest of the project never stopped (§18).';

----------------------------------------------------------------------
-- 7. Auto-start (§14)
--
--    "Do not make the Agent manually update status every time they touch
--    something." A first meaningful action on a READY unit starts it.
--
--    DEFINER, and it returns early on anything it is not sure about. A side
--    effect that raises takes the business write down with it — 0174, 0196,
--    0206 and 0218 were all that shape, and ticking a checkbox must never
--    fail because of a status convenience.
----------------------------------------------------------------------
create or replace function public.crm_auto_start_from_checklist()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if auth.uid() is null then return new; end if;
  update public.work_items
     set stage = 'In Processing',
         assigned_to = coalesce(assigned_to, auth.uid())
   where id = new.work_item_id
     and crm_project_id is not null
     and completed_at is null
     and archived_at is null
     and stage in ('Queued', 'Assigned')
     and waiting_on is null;   -- a unit waiting on the client has not started
  return new;
exception when others then
  /* Never fail the tick. */
  return new;
end $function$;
revoke execute on function public.crm_auto_start_from_checklist() from public, anon, authenticated;

create trigger crm_checklist_auto_start
  after update of done on public.work_checklist_items
  for each row when (new.done and not old.done)
  execute function public.crm_auto_start_from_checklist();

comment on function public.crm_auto_start_from_checklist() is
  'A ticked action starts a ready CRM work unit (Dee §14). Deterministic only (§54): a tick is an explicit event. Swallows its own errors — a status convenience must never be able to refuse the tick that triggered it.';

----------------------------------------------------------------------
-- 6b. `entity_visible` has to know what a CRM project is
--
--    THE SAME FAILURE SHAPE AS 0206 AND 0218, CAUGHT BEFORE THE PUSH.
--
--    `crm_satisfy_client_requirement` writes an activity row with
--    `entity_type = 'crm_project'`, and `activity_events_insert` requires
--    `entity_visible(entity_type, entity_id)`. That function DEFAULT DENIES an
--    unknown type (0118, deliberately) — so the activity insert was refused,
--    and because it sits inside the same transaction it took the whole
--    "requirement satisfied" write down with it. The probe reported it as
--    "new row violates row-level security policy for table activity_events",
--    which is true and names the wrong culprit.
--
--    Restated in full, because `create or replace` is a rewrite. Copied from
--    0218 — the newest migration that touches it — with one case added.
----------------------------------------------------------------------
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    /* Added 0223. Its own policy decides, so a project out of somebody's
       scope is invisible here exactly as it is everywhere else. */
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    -- Keyed to the organization that owns it (0059: entity_id IS the org id).
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    -- An attachment on a note is visible exactly when the note is.
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    else false
  end
$function$;
revoke all on function public.entity_visible(text, text) from public, anon;
grant execute on function public.entity_visible(text, text) to authenticated;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone — and an activity row about an unknown type is REFUSED, which aborts whatever wrote it. Add the case, with a real check and never `true`, in the same migration that starts writing the type. `channel_message` 0199, `announcement` 0218, `crm_project` 0223.';

----------------------------------------------------------------------
-- 7b. Milestones complete themselves (Dee §20)
--
--    "Milestones should mostly derive from Work Unit completion. Do not
--    require duplicate manual updates."
--
--    Two rules. A milestone tied to one work unit completes when that unit
--    does. An engine's `*_ready` milestone completes when the engine has no
--    open work left. Neither needs anybody to remember.
--
--    DEFINER and error-swallowing, for the same reason as the auto-start
--    trigger: a milestone convenience must never be able to refuse the
--    completion that triggered it.
----------------------------------------------------------------------
create or replace function public.crm_derive_milestones()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.crm_project_id is null then return new; end if;

  /* The milestone this very unit represents. */
  update public.crm_milestones
     set completed_at = new.completed_at, completed_by = auth.uid()
   where work_item_id = new.id and completed_at is null;

  /* The engine's readiness milestone, when nothing is left open in it. */
  update public.crm_milestones m
     set completed_at = new.completed_at, completed_by = auth.uid()
   where m.project_id = new.crm_project_id
     and m.engine_key = new.crm_engine_key
     and m.key like '%_ready'
     and m.completed_at is null
     and not exists (
       select 1 from public.work_items w
        where w.crm_project_id = new.crm_project_id
          and w.crm_engine_key = new.crm_engine_key
          and w.archived_at is null and w.completed_at is null);
  return new;
exception when others then
  return new;
end $function$;
revoke execute on function public.crm_derive_milestones() from public, anon, authenticated;

create trigger crm_work_unit_derives_milestones
  after update on public.work_items
  for each row
  when (new.completed_at is not null and old.completed_at is null)
  execute function public.crm_derive_milestones();

/* The ones no work unit represents: a presentation happened or it did not
   (§11, §12). Explicit, because §54 forbids inferring it. */
create or replace function public.crm_complete_milestone(
  p_milestone uuid, p_note text default null, p_link text default null)
returns void
language plpgsql security invoker set search_path = public as $function$
begin
  update public.crm_milestones
     set completed_at = now(), completed_by = auth.uid(),
         notes = coalesce(p_note, notes), link_url = coalesce(p_link, link_url)
   where id = p_milestone and completed_at is null;
  if not found then
    raise exception 'That milestone is not outstanding' using errcode = 'P0002';
  end if;
end $function$;
revoke execute on function public.crm_complete_milestone(uuid, text, text) from public, anon;
grant execute on function public.crm_complete_milestone(uuid, text, text) to authenticated;

/* Go-live is the event that moves a project into LAUNCH and then SUPPORT
   (§10, §13). It is stamped here rather than guessed from progress. */
create or replace function public.crm_record_go_live(
  p_project uuid, p_support_start date default null, p_support_end date default null)
returns void
language plpgsql security invoker set search_path = public as $function$
begin
  update public.crm_projects
     set went_live_at = coalesce(went_live_at, now()),
         support_start_date = coalesce(p_support_start, support_start_date),
         support_end_date = coalesce(p_support_end, support_end_date)
   where id = p_project;
  if not found then
    raise exception 'You may not change that project' using errcode = '42501';
  end if;
  update public.crm_milestones
     set completed_at = now(), completed_by = auth.uid()
   where project_id = p_project and key = 'go_live' and completed_at is null;
end $function$;
revoke execute on function public.crm_record_go_live(uuid, date, date) from public, anon;
grant execute on function public.crm_record_go_live(uuid, date, date) to authenticated;

comment on function public.crm_record_go_live(uuid, date, date) is
  'The explicit go-live event (Dee §10, §13). Launch is not Completed, and Support starts from a contracted date rather than from somebody changing a status.';

----------------------------------------------------------------------
-- 8. Production: the real Build Actions count (§28)
--
--    The whole body is restated, because `create or replace` on a function is
--    a rewrite. Copied from 0141 — the newest migration that touches it — with
--    two changes for CRM:
--
--      1. `actions` becomes the checklist labels ACTUALLY TICKED, so
--         `action_count` in EOD is the real Build Actions figure instead of
--         the literal ['Work item completed'].
--      2. `outsourcing_group_id` comes from the work item's partner, so the
--         EOD subject line reads as the partner instead of falling through to
--         the unit type.
----------------------------------------------------------------------
create or replace function public.work_items_completion_production()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_service public.fulfillment_service;
  v_unit    text;
  v_actions text[];
begin
  if new.division not in ('bes_crm', 'talentops') and new.workspace_id is null then return new; end if;
  if auth.uid() is null or not public.is_staff_of(new.agency_id) then return new; end if;

  v_service := coalesce(new.division, 'talentops');
  select t.label into v_unit from public.workspace_item_types t where t.id = new.item_type_id;

  /* The actions ticked inside this unit ARE the build actions. An empty
     checklist falls back to the generic line rather than reporting zero. */
  select array_agg(c.label order by c.position)
    into v_actions
    from public.work_checklist_items c
   where c.work_item_id = new.id and c.done;

  /* The partner, the organization and the agency are NOT passed here.
     `production_logs_derive_context` (a BEFORE INSERT trigger) derives all
     three from the canonical record and overwrites anything supplied — which
     is right, and is why passing them would be a lie in the code: the first
     version of this did pass `outsourcing_group_id` and it was silently
     discarded. That trigger is taught about a work item's partner below. */
  insert into public.production_logs
    (request_id, agency_id, employee_id, service, work_item_id,
     production_unit_type, production_unit_quantity, actions,
     work_notes, work_date, completed_at)
  values
    (md5('work_item_completion:' || new.id::text)::uuid, new.agency_id, auth.uid(), v_service, new.id,
     coalesce(v_unit, case when new.crm_project_id is not null then 'Work unit' else 'Work item' end),
     1,
     coalesce(v_actions, array['Work item completed']),
     new.title, current_date, new.completed_at)
  on conflict (agency_id, request_id) where request_id is not null do nothing;
  return new;
end $function$;

----------------------------------------------------------------------
-- 8b. One place derives production context — teach it about the partner
--
--    The work-item branch hardcoded `v_group := null`, which was true while
--    only workspaces and TalentOps produced work-item production. A BES CRM
--    work unit carries `partner_group_id`, and without this the EOD subject
--    line falls through to the unit type instead of naming the partner (§27).
--
--    Restated in full, because `create or replace` is a rewrite. Copied from
--    0141 with one line changed, in the `else` branch.
----------------------------------------------------------------------
create or replace function public.production_logs_derive_context()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_org uuid; v_group uuid;
begin
  if new.service = 'creditops' then
    select c.agency_id, c.organization_id, c.outsourcing_group_id into v_agency, v_org, v_group
      from public.fulfillment_clients c where c.id = new.client_id;
    if v_agency is null then raise exception 'CreditOps production requires an existing client' using errcode = '23514'; end if;
    new.department := case
      when new.department_key is not null and new.department_key = any (enum_range(null::public.fulfillment_department)::text[])
        then new.department_key::public.fulfillment_department end;
  elsif new.service = 'fundingops' then
    select c.agency_id, c.organization_id, c.outsourcing_group_id into v_agency, v_org, v_group
      from public.funding_clients c where c.id = new.funding_client_id;
    if v_agency is null then raise exception 'FundingOps production requires an existing funding client' using errcode = '23514'; end if;
    if new.funding_deal_id is not null and not exists (
         select 1 from public.funding_deals d where d.id = new.funding_deal_id and d.client_id = new.funding_client_id) then
      raise exception 'deal belongs to another funding client' using errcode = '23514';
    end if;
    new.department := null;
  else
    /* THE ONE CHANGED LINE: a work item may name a partner (BES CRM does), so
       the partner is derived rather than assumed absent. */
    select w.agency_id, coalesce(w.organization_id, w.subject_organization_id), w.partner_group_id
      into v_agency, v_org, v_group
      from public.work_items w where w.id = new.work_item_id;
    if v_agency is null then raise exception 'production on a work item requires an existing work item' using errcode = '23514'; end if;
    new.department := null;
  end if;

  new.agency_id := v_agency;
  new.organization_id := v_org;
  new.outsourcing_group_id := v_group;
  new.division_id := new.service::text;   -- legacy reader compatibility; never client-set
  new.production_unit_type := coalesce(nullif(trim(new.production_unit_type), ''), new.department_key, 'Work item');
  return new;
end $function$;
revoke execute on function public.production_logs_derive_context() from public, anon, authenticated;

comment on function public.production_logs_derive_context() is
  'Derives a production row''s agency, organization and partner from the canonical record it belongs to, overwriting anything the caller supplied — so production context can never disagree with the record. The work-item branch reads work_items.partner_group_id (0223), which is what makes a BES CRM EOD line name the partner.';
revoke execute on function public.work_items_completion_production() from public, anon, authenticated;

comment on function public.work_items_completion_production() is
  'One completed work item = one production unit, with the ticked checklist labels as its actions (Dee §28) and the partner as its subject. Idempotent on request_id, so a retry cannot double-count production.';
