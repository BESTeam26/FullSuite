-- The owner cannot be deactivated, again.
--
-- 20261015003000 rewrote set_agency_member_status to release a deactivated
-- person's work, starting from an older copy that tested the RETIRED role
-- value agency_owner. Since 0233/0234 the owner is the is_owner flag on an
-- agency_admin membership, so the guard matched nobody and an owner could
-- be deactivated. The full matrix caught it (phase 58, 2026-10-16). The
-- guard reads the flag again; the work-release behaviour is unchanged.
--
-- Cost impact: none.

begin;

CREATE OR REPLACE FUNCTION public.set_agency_member_status(p_membership uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency uuid; v_role public.agency_role; v_user uuid; v_actor text; v_released int; v_is_owner boolean;
begin
  select m.agency_id, m.role, m.user_id, (m.is_owner or m.role = 'agency_owner')
    into v_agency, v_role, v_user, v_is_owner
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Status must be active or inactive';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change who is active';
  end if;
  /* The owner is the is_owner FLAG (0233/0234); agency_owner is a retired
     value kept only for history. 20261015003000 read the retired value alone
     and the guard fell silent — the full matrix caught it (phase 58). */
  if v_is_owner and p_status = 'inactive' then
    raise exception 'The agency owner cannot be deactivated. Transfer ownership first, deliberately.';
  end if;
  if v_user = auth.uid() and p_status = 'inactive' then
    raise exception 'You cannot deactivate yourself';
  end if;
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  update public.agency_memberships
     set status = p_status,
         deactivated_at = case when p_status = 'inactive' then now() else null end,
         deactivated_by = case when p_status = 'inactive' then auth.uid() else null end
   where id = p_membership;
  /* The person's open work goes back to the queue with them gone. */
  if p_status = 'inactive' then
    v_released := public.release_work_of_inactive_member(v_user);
  end if;
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          case when p_status = 'inactive' then 'Member deactivated' else 'Member restored' end,
          'status', case when p_status = 'inactive' then 'active' else 'inactive' end,
          p_status || case when coalesce(v_released, 0) > 0 then ' · ' || v_released || ' open assignments released' else '' end,
          'bes_internal');
end;
$function$
;

commit;
