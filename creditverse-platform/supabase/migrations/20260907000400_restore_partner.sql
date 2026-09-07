-- 0163 — archiving is not a one-way door.
--
-- Restoring undoes exactly what archiving did to the ACTIVE VIEWS, and nothing
-- more:
--
--   • client files come back into the working queues
--   • the partner's lifecycle goes back to active
--
-- and deliberately NOT:
--
--   • portal contacts. The archive suspended everyone, and some of them may
--     have been suspended earlier for their own reasons. Restoring them all
--     would hand access back to somebody a person had removed on purpose, so
--     they are restored one at a time on the Contacts tab.
--
--   • work assignments. The archive released whoever was holding the work.
--     Who should hold it now is a decision, not an undo — the previous holder
--     is recorded, so it can be given back deliberately.
create or replace function public.restore_partner(p_group uuid)
returns jsonb
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid; v_name text; v_actor text; v_clients int := 0;
begin
  select g.agency_id, g.name into v_agency, v_name
    from public.outsourcing_groups g where g.id = p_group;
  if v_agency is null then raise exception 'Partner not found'; end if;
  if not (public.is_staff_of(v_agency) and public.agency_can('partners.archive')) then
    raise exception 'Not authorized to restore this partner';
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  with back as (
    update public.fulfillment_clients set archived_at = null
     where outsourcing_group_id = p_group and archived_at is not null
    returning 1
  ) select count(*) into v_clients from back;

  update public.outsourcing_groups
     set lifecycle = 'active', ended_on = null
   where id = p_group;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, detail, visibility)
  values (v_agency, 'partner', p_group::text, auth.uid(), v_actor,
          'Partner restored', 'lifecycle', 'archived', 'active',
          format('%s client file(s) back in the active queues. Portal contacts and work assignments are restored deliberately, not automatically.', v_clients),
          'bes_internal');

  return jsonb_build_object('partner', v_name, 'clients_restored', v_clients);
end;
$function$;
revoke execute on function public.restore_partner(uuid) from public, anon;
grant execute on function public.restore_partner(uuid) to authenticated;
