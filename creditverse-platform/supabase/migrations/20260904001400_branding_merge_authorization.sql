-- Regression found while wiring Phase 9: migration 0023 revoked EXECUTE on
-- log_audit() from API roles (a no-membership probe could pollute the audit
-- log). Both branding merges run as the caller and call log_audit(), so every
-- branding save has failed with 42501 since then — verified live as bes.owner.
--
-- Fix: the merges run as owner (SECURITY DEFINER) so the audit call is theirs,
-- and each checks authorization explicitly, mirroring the table policy it used
-- to rely on: organizations_update = is_manager_of(agency) OR is_org_admin(org);
-- agencies_update = agency admin. Deny is a raise, never a silent no-op.

create or replace function public.merge_organization_branding(p_org uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  select agency_id, branding into v_agency, v_before from public.organizations where id = p_org;
  if v_agency is null or not (public.is_manager_of(v_agency) or public.is_org_admin(p_org)) then
    raise exception 'Not permitted to update branding for this organization' using errcode = '42501';
  end if;

  update public.organizations
     set branding = coalesce(branding, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = p_org
   returning branding into v_after;

  perform public.log_audit('organization.branding_updated', 'organization', p_org::text, p_org, v_before, v_after);
  return v_after;
end $$;
revoke execute on function public.merge_organization_branding(uuid, jsonb) from public, anon;
grant execute on function public.merge_organization_branding(uuid, jsonb) to authenticated;

create or replace function public.merge_agency_branding(p_agency uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_name   text;
begin
  if not public.is_admin_of(p_agency) then
    raise exception 'Not permitted to update agency branding' using errcode = '42501';
  end if;
  select branding into v_before from public.agencies where id = p_agency;

  v_name := nullif(trim(coalesce(p_patch ->> 'name', '')), '');
  update public.agencies
     set branding = coalesce(branding, '{}'::jsonb) || (coalesce(p_patch, '{}'::jsonb) - 'name'),
         name     = coalesce(v_name, name)
   where id = p_agency
   returning branding into v_after;
  if v_after is null then
    raise exception 'Agency not found' using errcode = '42501';
  end if;

  perform public.log_audit('agency.branding_updated', 'agency', p_agency::text, null, v_before, v_after);
  return v_after;
end $$;
revoke execute on function public.merge_agency_branding(uuid, jsonb) from public, anon;
grant execute on function public.merge_agency_branding(uuid, jsonb) to authenticated;
