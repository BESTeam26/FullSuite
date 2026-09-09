-- =============================================================================
-- A GHL location may be BES's OWN (Dee, 2026-09-09: "Blessed Empire Services
-- … THIS IS MY ACTUAL AGENCY SUB ACCOUNT").
--
-- Three owners exist, and they are different facts:
--
--   organization  a SaaS customer (rule 16 model 1/2)
--   partner       a BES Partner served by BES (model 3) — the usual case
--   BES ITSELF    the agency's own house account: BES's marketing, its own
--                 leads, its own pipeline. Not a customer of anybody.
--
-- Mapping the house account to a partner would be a false attribution (rule
-- 4), and leaving it "Not mapped" would be a lie of a different kind: "nobody
-- has said yet" is not the same statement as "this one is ours". So it gets
-- its own flag, and at most one of the three may be set.
-- =============================================================================

alter table public.ghl_connections
  add column if not exists agency_owned boolean not null default false;

alter table public.ghl_events
  add column if not exists agency_owned boolean not null default false;

comment on column public.ghl_connections.agency_owned is
  'TRUE when the location is BES''s own house account, not a customer''s. Mutually exclusive with organization_id and outsourcing_group_id.';

alter table public.ghl_connections
  drop constraint if exists ghl_connections_one_owner;
alter table public.ghl_connections
  add constraint ghl_connections_one_owner
  check (
    (case when organization_id is not null then 1 else 0 end)
  + (case when outsourcing_group_id is not null then 1 else 0 end)
  + (case when agency_owned then 1 else 0 end) <= 1
  );

create or replace function public.map_ghl_location(
  p_location_id text,
  p_org uuid default null,
  p_partner uuid default null,
  p_agency_own boolean default false
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
  if (case when p_org is not null then 1 else 0 end)
   + (case when p_partner is not null then 1 else 0 end)
   + (case when coalesce(p_agency_own, false) then 1 else 0 end) > 1 then
    raise exception 'A location belongs to one owner: an organization, a partner, or BES itself'
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
         agency_owned = coalesce(p_agency_own, false),
         status = case
                    when p_org is null and p_partner is null and not coalesce(p_agency_own, false)
                    then status else 'connected'
                  end
   where location_id = p_location_id;

  /* The backlog is attributed to whichever owner was just named. */
  if p_org is not null then
    update public.ghl_events set organization_id = p_org
     where location_id = p_location_id and organization_id is null;
  end if;
  if p_partner is not null then
    update public.ghl_events set outsourcing_group_id = p_partner
     where location_id = p_location_id and outsourcing_group_id is null;
  end if;
  if coalesce(p_agency_own, false) then
    update public.ghl_events set agency_owned = true
     where location_id = p_location_id and not agency_owned;
  end if;

  perform public.log_audit('ghl.location_mapped', 'ghl_connection', v_row.id::text,
                           p_org,
                           to_jsonb(v_row),
                           jsonb_build_object('organization_id', p_org,
                                              'outsourcing_group_id', p_partner,
                                              'agency_owned', coalesce(p_agency_own, false)));
end $function$;

revoke execute on function public.map_ghl_location(text, uuid, uuid, boolean) from public, anon;
grant execute on function public.map_ghl_location(text, uuid, uuid, boolean) to authenticated;
drop function if exists public.map_ghl_location(text, uuid, uuid);
