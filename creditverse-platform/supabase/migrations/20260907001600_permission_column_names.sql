-- 0175 — the column is `set_by`, not `granted_by`.
--
-- 0174 fixed the audit signature and, rewriting the function from the shape it
-- SHOULD have had rather than the shape the table has, invented a column name.
-- The table records who changed an override as `set_by`/`set_at`.
--
-- Caught by running the function rather than reading it — which is how 0174's
-- own bug had survived, and is now the rule for anything in this area: a
-- permission function is verified by calling it as the role it is meant to
-- refuse and the role it is meant to allow.
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
  if v_agency is null then raise exception 'No such membership'; end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change access';
  end if;
  if v_role in ('agency_owner', 'agency_admin') then
    raise exception 'An owner or administrator holds every capability through their role. An override here would be a switch that does nothing.';
  end if;
  if not exists (select 1 from public.permission_keys where key = p_key) then
    raise exception 'No such capability: %', p_key;
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
