-- =============================================================================
-- Changing a member's access profile after activation — the same shape as
-- set_agency_member_role: admin-only, refuses nonsense, audited with both
-- values. The profile is a permission DEFAULT (0266); a change takes effect on
-- the person's next capability resolution, and their explicit per-key
-- overrides still win.
-- =============================================================================
create function public.set_agency_member_profile(p_membership uuid, p_profile public.access_profile)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_role public.agency_role; v_user uuid; v_prev public.access_profile; v_actor text;
begin
  select m.agency_id, m.role, m.user_id, m.access_profile
    into v_agency, v_role, v_user, v_prev
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency administrator can change an access profile' using errcode = '42501';
  end if;
  if v_role <> 'agency_user' then
    raise exception 'An admin''s role already grants everything — profiles apply to Agency Users.' using errcode = '22023';
  end if;
  if v_prev is not distinct from p_profile then
    return;
  end if;

  update public.agency_memberships set access_profile = p_profile where id = p_membership;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          'Access profile changed', 'access_profile',
          coalesce(v_prev::text, 'none'), coalesce(p_profile::text, 'none'), 'bes_internal');
end $function$;

revoke execute on function public.set_agency_member_profile(uuid, public.access_profile) from public, anon;
grant execute on function public.set_agency_member_profile(uuid, public.access_profile) to authenticated;
