-- Phase 9: "Save brand settings" persisted nothing (a 2-second "Saved" flag).
-- The agency row already carries `branding` jsonb and `name`, and
-- agencies_update is is_agency_admin(). Same shape as
-- merge_organization_branding: one UPDATE under the row lock (no read-merge-
-- write lost update), an audit entry, and a loud failure when RLS refuses so a
-- non-admin never sees a false "Saved".
create or replace function public.merge_agency_branding(p_agency uuid, p_patch jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_name   text;
begin
  select branding into v_before from public.agencies where id = p_agency;

  -- 'name' is a column, not a branding key; everything else merges into jsonb.
  v_name := nullif(trim(coalesce(p_patch ->> 'name', '')), '');
  update public.agencies
     set branding = coalesce(branding, '{}'::jsonb) || (coalesce(p_patch, '{}'::jsonb) - 'name'),
         name     = coalesce(v_name, name)
   where id = p_agency
   returning branding into v_after;

  if v_after is null then
    raise exception 'Not permitted to update agency branding' using errcode = '42501';
  end if;

  perform public.log_audit('agency.branding_updated', 'agency', p_agency::text, null, v_before, v_after);
  return v_after;
end $$;
revoke execute on function public.merge_agency_branding(uuid, jsonb) from public, anon;
grant execute on function public.merge_agency_branding(uuid, jsonb) to authenticated;
