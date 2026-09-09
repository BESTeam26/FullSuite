-- =============================================================================
-- A GHL location may belong to a PARTNER, not only to a SaaS organization.
--
-- Dee, 2026-09-09: "How can I map it?" — she could not. The mapping control
-- offered BES organizations and there are ZERO of them: every real BES
-- customer today is an `outsourcing_group` (a BES Partner). So the dropdown
-- had exactly one option, "Not mapped", and 52 discovered locations could
-- never be attributed to anybody. A dead control (rule 12).
--
-- This is rule 16 model 3 in the data: fulfillment WITHOUT SaaS — a partner
-- with no organization. The location belongs to the party BES actually serves,
-- and that party may be either shape. So:
--
--   * ghl_connections and ghl_events gain outsourcing_group_id;
--   * exactly ONE owner per location (organization XOR partner), because two
--     owners is how one truth becomes several (rules 2 and 16);
--   * map_ghl_location takes a partner as well, validates it exists, and
--     back-attributes the event backlog exactly as it already did;
--   * a partner's own portal contacts do NOT gain access here — reading the
--     bridge stays BES staff plus an ORG admin, unchanged. Association is not
--     publication (rule 16).
-- =============================================================================

alter table public.ghl_connections
  add column if not exists outsourcing_group_id uuid references public.outsourcing_groups(id) on delete set null;

alter table public.ghl_events
  add column if not exists outsourcing_group_id uuid references public.outsourcing_groups(id) on delete set null;

alter table public.ghl_connections
  drop constraint if exists ghl_connections_one_owner;
alter table public.ghl_connections
  add constraint ghl_connections_one_owner
  check (organization_id is null or outsourcing_group_id is null);

comment on column public.ghl_connections.outsourcing_group_id is
  'The BES Partner this GHL location belongs to (rule 16 model 3: fulfillment without SaaS). Exactly one of organization_id / outsourcing_group_id is set.';

create index if not exists ghl_connections_partner on public.ghl_connections (outsourcing_group_id);
create index if not exists ghl_events_partner on public.ghl_events (outsourcing_group_id);

/* One writer, both shapes. Passing both is refused rather than silently
   preferring one — an ambiguous instruction about who owns a location is not
   something to guess at. */
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

  /* Events that arrived before the mapping existed are attributed now, so a
     location connected late does not lose its backlog. */
  if p_org is not null then
    update public.ghl_events set organization_id = p_org
     where location_id = p_location_id and organization_id is null;
  end if;
  if p_partner is not null then
    update public.ghl_events set outsourcing_group_id = p_partner
     where location_id = p_location_id and outsourcing_group_id is null;
  end if;

  perform public.log_audit('ghl.location_mapped', 'ghl_connection', v_row.id::text,
                           coalesce(p_org, p_partner),
                           to_jsonb(v_row),
                           jsonb_build_object('organization_id', p_org, 'outsourcing_group_id', p_partner));
end $function$;

revoke execute on function public.map_ghl_location(text, uuid, uuid) from public, anon;
grant execute on function public.map_ghl_location(text, uuid, uuid) to authenticated;

/* The two-argument form is gone; one writer, one signature. */
drop function if exists public.map_ghl_location(text, uuid);
