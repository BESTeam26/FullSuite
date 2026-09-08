-- 0176 — the refusals kept their meaning; restore their error codes.
--
-- 0174/0175 rewrote `set_agency_permission` and, using a plain `raise
-- exception`, gave every refusal the generic P0001. The original distinguished:
--
--   42501 insufficient_privilege — you are not allowed to do this
--   22023 invalid_parameter_value — this request does not make sense
--
-- Both refusals still happened, so nothing was less safe. But a caller cannot
-- tell "ask an administrator" from "that switch would do nothing" if both
-- arrive as P0001, and the matrix asserts the distinction precisely because it
-- is the difference between two messages a person acts on differently.
create or replace function public.set_agency_permission(
  p_membership uuid,
  p_key        text,
  p_allowed    boolean,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid; v_role public.agency_role;
begin
  select m.agency_id, m.role into v_agency, v_role
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then
    raise exception 'No such membership' using errcode = '22023';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change access'
      using errcode = '42501';
  end if;
  if v_role in ('agency_owner', 'agency_admin') then
    raise exception 'An owner or administrator holds every capability through their role. An override here would be a switch that does nothing.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.permission_keys where key = p_key) then
    raise exception 'No such capability: %', p_key using errcode = '22023';
  end if;

  insert into public.agency_member_permissions (membership_id, key, allowed, reason, set_by, set_at)
  values (p_membership, p_key, p_allowed, p_reason, auth.uid(), now())
  on conflict (membership_id, key) do update
    set allowed = excluded.allowed,
        reason  = excluded.reason,
        set_by  = excluded.set_by,
        set_at  = excluded.set_at;

  perform public.log_audit(
    'agency_permission.set', 'agency_membership', p_membership::text,
    null::uuid, null::jsonb,
    jsonb_build_object('key', p_key, 'allowed', p_allowed, 'reason', p_reason)
  );
end $function$;
revoke execute on function public.set_agency_permission(uuid, text, boolean, text) from public, anon;
grant execute on function public.set_agency_permission(uuid, text, boolean, text) to authenticated;

create or replace function public.clear_agency_permission(
  p_membership uuid,
  p_key        text
)
returns void
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid;
begin
  select m.agency_id into v_agency from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then
    raise exception 'No such membership' using errcode = '22023';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change access'
      using errcode = '42501';
  end if;

  delete from public.agency_member_permissions
   where membership_id = p_membership and key = p_key;

  perform public.log_audit(
    'agency_permission.cleared', 'agency_membership', p_membership::text,
    null::uuid, null::jsonb, jsonb_build_object('key', p_key)
  );
end $function$;
revoke execute on function public.clear_agency_permission(uuid, text) from public, anon;
grant execute on function public.clear_agency_permission(uuid, text) to authenticated;
