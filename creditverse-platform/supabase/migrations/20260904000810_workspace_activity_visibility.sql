-- Phase 6 follow-up from the RLS matrix: log_work_activity wrote every work
-- item event at the default visibility (bes_internal), so an organization that
-- moved its own workspace item could not read its own activity.
--
-- Rule: a workspace item is the organization's work and, under a TalentOps
-- share, both sides act on it — its events are shared_with_partner. Any other
-- ORGANIZATION-scope event made by an organization member is
-- organization_internal. Everything else stays bes_internal.
create or replace function public.log_work_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_org uuid;
  v_vis public.activity_visibility;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  v_org := coalesce(new.organization_id, new.subject_organization_id);
  v_vis := case
    when new.workspace_id is not null then 'shared_with_partner'
    when new.scope = 'ORGANIZATION' and public.is_org_member(new.organization_id) then 'organization_internal'
    else 'bes_internal'
  end;

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail, new_value, visibility)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Work item created', new.title, new.stage::text, v_vis);
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value, visibility)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Status changed',
            coalesce((select label from public.workspace_statuses where id = old.status_id), '—')
            || ' → ' ||
            coalesce((select label from public.workspace_statuses where id = new.status_id), '—'),
            'status', old.status_id::text, new.status_id::text, v_vis);
  elsif new.stage is distinct from old.stage then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value, visibility)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Status changed', old.stage::text || ' → ' || new.stage::text,
            'stage', old.stage::text, new.stage::text, v_vis);
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value, visibility)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles where id = old.assigned_to), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles where id = new.assigned_to), 'Unassigned'),
            'assigned_to', old.assigned_to::text, new.assigned_to::text, v_vis);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.activity_events
      (organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value, visibility)
    values (v_org, 'work_item', new.id::text, auth.uid(), v_actor,
            'Priority changed', old.priority::text || ' → ' || new.priority::text,
            'priority', old.priority::text, new.priority::text, v_vis);
  end if;

  return new;
end $$;
