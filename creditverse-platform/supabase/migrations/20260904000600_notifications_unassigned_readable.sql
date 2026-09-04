-- Phase 5 follow-up from the RLS matrix.
--
-- notifications_select re-checks entity_visible() as the reader, so anything
-- about a record you can no longer see is hidden. Correct for notes and
-- status changes — and, by construction, it hid every 'unassigned' row, whose
-- whole meaning is that you lost the record. Those rows are exempt from the
-- record re-check. They carry no detail: the recipient learns they were moved
-- off, not who received the work.

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    recipient_id = auth.uid()
    and (
      kind = 'unassigned'
      or (
        public.can_view_activity(agency_id, organization_id, visibility, entity_type)
        and public.entity_visible(entity_type, entity_id)
      )
    )
  );

create or replace function public.notify_from_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner record;
  v_new   uuid;
  v_old   uuid;
begin
  if new.action = 'Assignee changed' and new.field in ('assigned_to', 'assigned_agent_id') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    v_new := public.as_uuid(new.new_value);
    v_old := public.as_uuid(new.previous_value);
    if v_new is not null and v_new is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_new, new.actor_id, new.agency_id, new.organization_id, 'assigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Assigned to you', new.detail)
      on conflict do nothing;
    end if;
    if v_old is not null and v_old is distinct from new.actor_id then
      -- No detail on purpose: the row is readable after access is lost.
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_old, new.actor_id, new.agency_id, new.organization_id, 'unassigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Reassigned away from you', null)
      on conflict do nothing;
    end if;
    return new;
  end if;

  if new.action in ('Work item created', 'Client added') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'assigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Assigned to you', new.detail)
      on conflict do nothing;
    end if;
    return new;
  end if;

  if new.action in ('Comment posted', 'Note') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'note', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail)
      on conflict do nothing;
    end if;
    if v_owner.team is not null then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      select tm.user_id, new.actor_id, new.agency_id, new.organization_id, 'note', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail
        from public.team_memberships tm
       where tm.team_id = v_owner.team
         and tm.is_lead
         and tm.user_id is distinct from new.actor_id
         and tm.user_id is distinct from v_owner.assignee
      on conflict do nothing;
    end if;
    return new;
  end if;

  if new.field in ('stage', 'status', 'department_status', 'deal_status') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'status', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail)
      on conflict do nothing;
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.notify_from_activity() from public, anon, authenticated;
