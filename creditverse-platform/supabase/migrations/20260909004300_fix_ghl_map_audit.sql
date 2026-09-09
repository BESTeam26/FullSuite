-- =============================================================================
-- Repair of 0274: mapping a location to a PARTNER failed with a foreign-key
-- violation. `log_audit(..., p_org, ...)` writes audit_log.organization_id,
-- which references organizations — and 0274 passed coalesce(p_org, p_partner)
-- into it, so a partner id was offered as an organization id and Postgres
-- refused the whole write (the browser saw a bare 409).
--
-- The audit's org column stays the ORGANIZATION, null when a partner owns the
-- location; the partner id is already recorded in the after-payload, which is
-- where a non-organization owner belongs. Caught by walking the real mapping
-- in the browser rather than trusting the function to be right.
-- =============================================================================
create or replace function public.map_ghl_location(
  p_location_id text,
  p_org uuid default null,
  p_partner uuid default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare v_row public.ghl_connections;
begin
  if not public.is_agency_staff() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into v_row from public.ghl_connections where location_id = p_location_id;
  if v_row.id is null then
    raise exception 'connection not found' using errcode = 'P0002';
  end if;
  if p_org is not null and p_partner is not null then
    raise exception 'A location belongs to an organization or to a partner, not both'
      using errcode = '22023';
  end if;
  if p_org is not null and not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  if p_partner is not null and not exists (
    select 1 from public.outsourcing_groups g
     where g.id = p_partner and g.lifecycle <> 'archived') then
    raise exception 'partner not found' using errcode = 'P0002';
  end if;

  update public.ghl_connections
     set organization_id = p_org,
         outsourcing_group_id = p_partner,
         status = case when p_org is null and p_partner is null then status else 'connected' end
   where location_id = p_location_id;

  if p_org is not null then
    update public.ghl_events set organization_id = p_org
     where location_id = p_location_id and organization_id is null;
  end if;
  if p_partner is not null then
    update public.ghl_events set outsourcing_group_id = p_partner
     where location_id = p_location_id and outsourcing_group_id is null;
  end if;

  /* p_org ONLY — audit_log.organization_id references organizations. The
     partner is in the payload. */
  perform public.log_audit('ghl.location_mapped', 'ghl_connection', v_row.id::text,
                           p_org,
                           to_jsonb(v_row),
                           jsonb_build_object('organization_id', p_org, 'outsourcing_group_id', p_partner));
end $function$;
