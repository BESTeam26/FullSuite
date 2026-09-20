-- management-placement-probe, 2026-09-20: an administrator with no grants
-- resolved a key that does NOT EXIST in the registry as true, because the
-- admin branch of resolve_agency_capability ran before anybody asked whether
-- the key was real. A retired or misspelled key would therefore have granted
-- every administrator whatever a policy asked for. Unknown keys now resolve
-- to false for everyone, owner included: fail closed. Every key referenced by
-- live policies, functions and the interface was checked against the
-- registry before this was applied — none is missing.
create or replace function public.resolve_agency_capability(p_key text) returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce((
    select case
      when not exists (select 1 from public.permission_keys pk where pk.key = p_key) then false
      when m.status <> 'active' then false
      when exists (select 1 from public.permission_keys pk where pk.key = p_key and pk.owner_gated)
        then coalesce(m.is_owner, false)
             or coalesce((select amp.allowed from public.agency_member_permissions amp
                           where amp.membership_id = m.id and amp.key = p_key), false)
      when m.role in ('agency_owner', 'agency_admin') then true
      else coalesce(
        (select amp.allowed from public.agency_member_permissions amp
          where amp.membership_id = m.id and amp.key = p_key),
        (select app.allowed from public.agency_profile_permissions app
          where app.profile = m.access_profile and app.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id = m.agency_id and arp.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id is null and arp.key = p_key),
        false)
    end
    from public.agency_memberships m
   where m.user_id = auth.uid()
   limit 1
  ), false)
$function$;
