-- =============================================================================
-- One-statement branding merge
--
-- `updateOrganizationBranding` read the branding column, merged in JavaScript,
-- then wrote it back: two round trips where one would do (rule 14, already
-- flagged in CLAUDE.md as an outstanding violation).
--
-- The round trips are the smaller half of the problem. Read-modify-write across
-- a network is a LOST UPDATE: two people editing different branding fields at
-- the same time both read the old row, and whoever writes second silently
-- erases the other's change. Merging inside a single UPDATE removes the window
-- entirely — Postgres applies `||` against the current row under its own lock.
--
-- SECURITY INVOKER (the default) is deliberate: the caller's own RLS decides
-- whether they may update this organization. A definer function here would hand
-- every authenticated user branding rights on every tenant.
-- =============================================================================

create or replace function public.merge_organization_branding(
  p_org   uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
set search_path = public as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  select branding into v_before from public.organizations where id = p_org;

  update public.organizations
     set branding = coalesce(branding, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = p_org
   returning branding into v_after;

  -- RLS refused the write (or the row is gone). Fail loudly rather than
  -- reporting success for a change that did not happen.
  if v_after is null then
    raise exception 'Not permitted to update branding for this organization'
      using errcode = '42501';
  end if;

  -- Branding was the one organization edit that recorded nothing (rule 10).
  perform public.log_audit(
    'organization.branding_updated', 'organization', p_org::text,
    p_org, v_before, v_after
  );

  return v_after;
end $$;

-- Two independent grants reach a function: Supabase's grant to `anon` and
-- Postgres's default grant to PUBLIC. Revoking one leaves the other open
-- (learned in migrations 0003/0004), so both are withdrawn before granting.
revoke all on function public.merge_organization_branding(uuid, jsonb) from public, anon;
grant execute on function public.merge_organization_branding(uuid, jsonb) to authenticated;
