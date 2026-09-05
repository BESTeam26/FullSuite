-- =============================================================================
-- Organization workspace views: which CreditOps / FundingOps views an
-- organization shows its own users.
--
-- Customization is data (rule 17): one jsonb column, shaped
--   { "creditOps": { "hidden": ["dispute-queue", …] },
--     "fundingOps": { "hidden": ["stipulations", …] } }
-- read by the organization's workspace pages. The agency division pages are
-- not affected — BES always sees every view of every Partner it may reach.
--
-- Written only through merge_organization_workspace_views(), which mirrors the
-- branding merge: SECURITY DEFINER so the audit call is its own, explicit
-- authorization (agency manager OR organization owner/admin), deny is a raise.
-- Hiding is a presentation choice, never an authorization boundary: the rows
-- behind a hidden view are still protected by their own policies and nothing
-- here widens or narrows them.
-- =============================================================================

alter table public.organizations
  add column if not exists workspace_views jsonb not null default '{}'::jsonb;

create or replace function public.merge_organization_workspace_views(p_org uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
  v_before jsonb;
  v_after  jsonb;
  v_key    text;
begin
  select agency_id, workspace_views into v_agency, v_before from public.organizations where id = p_org;
  if v_agency is null or not (public.is_manager_of(v_agency) or public.is_org_owner_admin(p_org)) then
    raise exception 'Not permitted to change workspace views for this organization' using errcode = '42501';
  end if;

  -- Only the two configurable products; each value must be an object whose
  -- "hidden" member is an array of strings. Anything else is a malformed patch.
  for v_key in select jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) loop
    if v_key not in ('creditOps', 'fundingOps') then
      raise exception 'Unknown workspace product: %', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(p_patch -> v_key) <> 'object'
       or jsonb_typeof(p_patch -> v_key -> 'hidden') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_patch -> v_key -> 'hidden') e where jsonb_typeof(e) <> 'string') then
      raise exception 'Malformed workspace view patch for %', v_key using errcode = '22023';
    end if;
    -- The overview and the record list can never be switched off: an
    -- organization must always be able to reach its own records.
    if p_patch -> v_key -> 'hidden' ? 'dashboard'
       or p_patch -> v_key -> 'hidden' ? 'main-list'
       or p_patch -> v_key -> 'hidden' ? 'deal-list' then
      raise exception 'The dashboard and the record list cannot be hidden' using errcode = '22023';
    end if;
  end loop;

  update public.organizations
     set workspace_views = coalesce(workspace_views, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = p_org
   returning workspace_views into v_after;

  perform public.log_audit('organization.workspace_views_updated', 'organization', p_org::text, p_org, v_before, v_after);
  return v_after;
end $$;
revoke execute on function public.merge_organization_workspace_views(uuid, jsonb) from public, anon;
grant execute on function public.merge_organization_workspace_views(uuid, jsonb) to authenticated;
