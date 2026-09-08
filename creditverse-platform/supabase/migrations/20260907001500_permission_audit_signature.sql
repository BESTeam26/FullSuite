-- 0174 — granting a per-user permission has never worked. Dee found it.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
--
-- `set_agency_permission` and `clear_agency_permission` both end by calling
--
--     log_audit(action, entity_type, entity_id, null, p_allowed::text, jsonb)
--
-- and `log_audit`'s fifth parameter is `p_before jsonb`, not text. Postgres
-- cannot resolve the call, so BOTH functions fail with 42883 — "function
-- public.log_audit(unknown, unknown, text, unknown, text, jsonb) does not
-- exist" — before writing anything.
--
-- The write happens first and the audit call last, inside one function, so the
-- whole transaction rolls back: no permission was ever granted or revoked, and
-- the interface showed an error nobody read as "this feature does not work".
--
-- HOW IT SURVIVED A SECURITY SUITE
--
-- Phase 56 covered it, and its two probes were ALSO broken — they cast the
-- function's void return to text, which is not a cast that exists, and so they
-- failed on 42883 too. Two independent bugs producing the same error code, one
-- masking the other: the probe looked like it was failing on its own mistake,
-- and it was, and so was the thing it was testing.
--
-- Dee reported it as "toggle on the access should be working". They were
-- right, and my first explanation — that every switch is inert because both
-- people on the roster hold everything by role — was true and beside the point.
--
-- The lesson: a probe that fails is not evidence about the probe. Both sides
-- get read before either is called wrong.
-- ---------------------------------------------------------------------------

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

  insert into public.agency_member_permissions (membership_id, key, allowed, reason, granted_by)
  values (p_membership, p_key, p_allowed, p_reason, auth.uid())
  on conflict (membership_id, key) do update
    set allowed = excluded.allowed,
        reason = excluded.reason,
        granted_by = excluded.granted_by;

  /* Positional, and matching the real signature:
       (action, entity_type, entity_id, org, before, after)
     `before` and `after` are both jsonb. The old call passed the boolean as
     text into `before`, which is why no call ever resolved. */
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
  if v_agency is null then raise exception 'No such membership'; end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change access';
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
