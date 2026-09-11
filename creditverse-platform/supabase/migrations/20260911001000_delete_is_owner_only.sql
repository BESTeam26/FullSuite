-- =============================================================================
-- Deleting a record is the owner's alone.
--
-- Dee, 2026-09-11: "Dee should only be the one to HAVE DELETE capability. No
-- other team members can delete record."
--
-- She ruled this once before, on 2026-09-07, and 0171 built it: `is_owner_of`
-- plus `owner_delete_record`, owner-only, one record at a time, audited before
-- the row goes. Yesterday's `crm_project_delete` did not follow it — it asked
-- for `crm.projects.manage`, which every administrator holds. That made
-- project deletion the one destructive act an admin could perform, which is
-- exactly the rule she had already set, broken by a function written a day
-- later.
--
-- So this narrows deletion to the owner and leaves everything else where it
-- was. Complete, Archive and Reopen stay on `crm.projects.manage`: they are
-- reversible, they destroy nothing, and they are the operations a delivery
-- lead actually needs. Only the irreversible one moves.
--
-- Reusing `is_owner_of` rather than a new check: it already tolerates the
-- retired `agency_owner` role value alongside the `is_owner` flag (0234), so
-- ownership has one definition and not two that could disagree.
-- =============================================================================

create or replace function public.crm_project_delete(p_project uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_blockers text[]; v_name text; v_agency uuid; v_org uuid; v_group uuid; v_actor text;
begin
  select agency_id into v_agency from public.crm_projects where id = p_project;
  if v_agency is null then
    raise exception 'No such project' using errcode = '22023';
  end if;
  /* Owner only. Not an administrator, not by permission grant (Dee, 0171). */
  if not public.is_owner_of(v_agency) then
    raise exception 'Only the agency owner can delete a record. Archive it instead — that keeps all of it.'
      using errcode = '42501';
  end if;

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
