-- =============================================================================
-- Client lifecycle (Dee, 2026-09-04): "Active" is the only thing that counts as
-- an active client; Program Completed, Graduated and Archived are not. The
-- lifecycle is SEPARATE from the processing status (Ready for Processing,
-- Monitoring Issue, …) and from the department / work status — three truths.
--
-- Archive = lifecycle transition, never a delete (rule 11): history, reports,
-- production and activity stay; the client just stops counting and drops out
-- of active lists. archive_client() and set_client_lifecycle() run as the
-- caller (SECURITY INVOKER) and write the activity event with the change.
-- =============================================================================
create type public.client_lifecycle as enum ('active', 'program_completed', 'graduated', 'archived');

alter table public.fulfillment_clients
  add column if not exists lifecycle public.client_lifecycle not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;
alter table public.funding_clients
  add column if not exists lifecycle public.client_lifecycle not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

-- Backfill from the statuses that used to double as lifecycle.
update public.fulfillment_clients set lifecycle = 'program_completed' where status::text = 'Completed';
update public.fulfillment_clients set lifecycle = 'graduated'         where status::text = 'Graduated';
update public.fulfillment_clients set lifecycle = 'archived', archived_at = coalesce(archived_at, updated_at) where status::text in ('Archived', 'Archived / Inactive');
update public.funding_clients     set lifecycle = 'program_completed' where status::text = 'Funded';
update public.funding_clients     set lifecycle = 'archived', archived_at = coalesce(archived_at, updated_at) where status::text in ('Archived', 'Withdrawn', 'Declined');

create index if not exists fulfillment_clients_lifecycle_idx on public.fulfillment_clients (organization_id, lifecycle);
create index if not exists funding_clients_lifecycle_idx on public.funding_clients (organization_id, lifecycle);

create or replace function public.set_client_lifecycle(p_client uuid, p_lifecycle public.client_lifecycle, p_reason text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  c      public.fulfillment_clients%rowtype;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  if c.lifecycle = p_lifecycle then return; end if;
  update public.fulfillment_clients
     set lifecycle = p_lifecycle,
         archived_at = case when p_lifecycle = 'archived' then now() else null end,
         archive_reason = case when p_lifecycle = 'archived' then p_reason else null end
   where id = p_client;
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(),
          case p_lifecycle when 'archived' then 'Client archived' when 'active' then 'Client reactivated' else 'Lifecycle changed' end,
          coalesce(p_reason, replace(p_lifecycle::text, '_', ' ')), 'lifecycle', c.lifecycle::text, p_lifecycle::text,
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $$;
revoke execute on function public.set_client_lifecycle(uuid, public.client_lifecycle, text) from public, anon;
grant execute on function public.set_client_lifecycle(uuid, public.client_lifecycle, text) to authenticated;

-- Active records now mean lifecycle = active, in both divisions.
create or replace function public.organization_active_records(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_org_member(p_org) or public.is_manager_of(public.org_agency(p_org)) then (
    (select count(*)::int from public.fulfillment_clients c where c.organization_id = p_org and c.lifecycle = 'active')
    + (select count(*)::int from public.funding_clients f where f.organization_id = p_org and f.lifecycle = 'active')
  ) else null end
$$;
