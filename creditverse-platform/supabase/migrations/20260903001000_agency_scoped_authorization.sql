-- =============================================================================
-- Make agency scope real
--
-- `is_agency_staff()` answers "is this user staff of ANY agency". It takes no
-- agency argument, and 104 policy clauses are gated on it. So today, staff of
-- a second agency would read and write the first agency's records — including
-- every outsourcing-only client, whose `organization_id` is NULL and whose
-- visibility therefore rests on that check alone.
--
-- Only one agency exists, so nothing has leaked. But "Agency A cannot read
-- Agency B" is not enforced anywhere, and the app-side constant this task
-- removes was the smaller half of the problem: sending the right agency_id
-- means nothing if the database does not check it.
--
-- Two gaps are closed here:
--
--   1. AGENCY-SCOPED HELPERS. `is_staff_of(agency)`, `is_manager_of(agency)`
--      and `is_admin_of(agency)` take the row's agency and test membership of
--      THAT agency. A user may belong to more than one (the table allows it),
--      so these are EXISTS checks, not a scalar "my agency".
--
--   2. MISSING ATTRIBUTION. `activity_events`, `work_items` and `files` had no
--      `agency_id` at all — their only tenant anchor was `organization_id`.
--      That matters twice over: cross-agency reads, and the integrity problem
--      that migration 0013 introduced when it made org deletion SET NULL. An
--      audit row whose organization is gone had no tenant left, so it became
--      visible to staff of every agency. Each now carries its own agency_id.
--
-- RLS remains the last line: the app sends an agency, the database checks it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Agency-scoped authorization helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_staff_of(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
    where user_id = auth.uid() and agency_id = p_agency
  )
$$;

create or replace function public.is_manager_of(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
    where user_id = auth.uid() and agency_id = p_agency
      and role in ('agency_owner','agency_admin','agency_manager')
  )
$$;

create or replace function public.is_admin_of(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
    where user_id = auth.uid() and agency_id = p_agency
      and role in ('agency_owner','agency_admin')
  )
$$;

/** The agency owning an organization — for policies on child tables. */
create or replace function public.agency_of_org(p_org uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from public.organizations where id = p_org
$$;

revoke all on function public.is_staff_of(uuid)   from public, anon;
revoke all on function public.is_manager_of(uuid) from public, anon;
revoke all on function public.is_admin_of(uuid)   from public, anon;
revoke all on function public.agency_of_org(uuid) from public, anon;
grant execute on function public.is_staff_of(uuid)   to authenticated;
grant execute on function public.is_manager_of(uuid) to authenticated;
grant execute on function public.is_admin_of(uuid)   to authenticated;
grant execute on function public.agency_of_org(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Give the un-anchored tables their own agency
-- -----------------------------------------------------------------------------
alter table public.activity_events add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
alter table public.work_items      add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
alter table public.files           add column if not exists agency_id uuid references public.agencies(id) on delete cascade;

/* Backfill from the owning organization where there is one, otherwise from the
   only agency that exists. Safe precisely because there is only one today —
   this is the last moment that shortcut is available. */
update public.activity_events e
   set agency_id = coalesce(
     (select o.agency_id from public.organizations o where o.id = e.organization_id),
     (select id from public.agencies order by created_at limit 1))
 where e.agency_id is null;

update public.work_items w
   set agency_id = coalesce(
     (select o.agency_id from public.organizations o where o.id = coalesce(w.organization_id, w.subject_organization_id)),
     (select id from public.agencies order by created_at limit 1))
 where w.agency_id is null;

update public.files f
   set agency_id = coalesce(
     (select o.agency_id from public.organizations o where o.id = f.organization_id),
     (select id from public.agencies order by created_at limit 1))
 where f.agency_id is null;

alter table public.activity_events alter column agency_id set not null;
alter table public.work_items      alter column agency_id set not null;
alter table public.files           alter column agency_id set not null;

create index if not exists activity_events_agency_idx on public.activity_events(agency_id, created_at desc);
create index if not exists work_items_agency_idx      on public.work_items(agency_id);
create index if not exists files_agency_idx           on public.files(agency_id);

/**
 * Stamp the agency on every audit row automatically.
 *
 * A trigger, not a caller responsibility: an audit row that the writer can
 * mis-attribute is not an audit row. It resolves from the organization when
 * there is one, and otherwise from the actor's own membership.
 */
create or replace function public.stamp_activity_agency()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null then
    new.agency_id := coalesce(
      (select o.agency_id from public.organizations o where o.id = new.organization_id),
      (select am.agency_id from public.agency_memberships am where am.user_id = auth.uid() limit 1)
    );
  end if;
  if new.agency_id is null then
    raise exception 'Cannot record activity without an agency context'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger activity_events_stamp_agency
  before insert on public.activity_events
  for each row execute function public.stamp_activity_agency();

revoke execute on function public.stamp_activity_agency() from public, anon;

-- -----------------------------------------------------------------------------
-- 3. Scope the policies that actually hold tenant data
--
-- Rewritten to test the ROW's agency rather than "is staff anywhere". Child
-- tables reach their agency through the parent instead of denormalising it,
-- so the two can never disagree.
-- -----------------------------------------------------------------------------

-- organizations
drop policy if exists organizations_select on public.organizations;
drop policy if exists organizations_insert on public.organizations;
drop policy if exists organizations_update on public.organizations;
drop policy if exists organizations_delete on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_org_member(id));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.is_manager_of(agency_id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_manager_of(agency_id) or public.is_org_admin(id))
  with check (public.is_manager_of(agency_id) or public.is_org_admin(id));
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.is_admin_of(agency_id));

-- outsourcing_groups
drop policy if exists outsourcing_groups_select on public.outsourcing_groups;
drop policy if exists outsourcing_groups_write  on public.outsourcing_groups;
create policy outsourcing_groups_select on public.outsourcing_groups for select to authenticated
  using (public.is_staff_of(agency_id));
create policy outsourcing_groups_write on public.outsourcing_groups for all to authenticated
  using (public.is_manager_of(agency_id)) with check (public.is_manager_of(agency_id));

-- fulfillment_clients
drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
drop policy if exists fulfillment_clients_insert on public.fulfillment_clients;
drop policy if exists fulfillment_clients_update on public.fulfillment_clients;
drop policy if exists fulfillment_clients_delete on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_org_member(organization_id));
create policy fulfillment_clients_insert on public.fulfillment_clients for insert to authenticated
  with check (public.is_staff_of(agency_id));
create policy fulfillment_clients_update on public.fulfillment_clients for update to authenticated
  using (public.is_staff_of(agency_id)
         and (assigned_agent_id = auth.uid() or public.is_manager_of(agency_id)))
  with check (public.is_staff_of(agency_id));
create policy fulfillment_clients_delete on public.fulfillment_clients for delete to authenticated
  using (public.is_admin_of(agency_id));

-- funding_clients
drop policy if exists funding_clients_write  on public.funding_clients;
drop policy if exists funding_clients_select on public.funding_clients;
drop policy if exists funding_clients_insert on public.funding_clients;
drop policy if exists funding_clients_update on public.funding_clients;
drop policy if exists funding_clients_delete on public.funding_clients;
create policy funding_clients_select on public.funding_clients for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_org_member(organization_id));
create policy funding_clients_insert on public.funding_clients for insert to authenticated
  with check (public.is_staff_of(agency_id));
create policy funding_clients_update on public.funding_clients for update to authenticated
  using (public.is_staff_of(agency_id)
         and (assigned_agent_id = auth.uid() or public.is_manager_of(agency_id)))
  with check (public.is_staff_of(agency_id));
create policy funding_clients_delete on public.funding_clients for delete to authenticated
  using (public.is_admin_of(agency_id));

-- funding_files
drop policy if exists funding_files_all    on public.funding_files;
drop policy if exists funding_files_select on public.funding_files;
drop policy if exists funding_files_insert on public.funding_files;
drop policy if exists funding_files_update on public.funding_files;
drop policy if exists funding_files_delete on public.funding_files;
create policy funding_files_select on public.funding_files for select to authenticated
  using (public.is_staff_of(agency_id)
         or exists (select 1 from public.funding_clients c
                     where c.id = client_id and public.is_org_member(c.organization_id)));
create policy funding_files_insert on public.funding_files for insert to authenticated
  with check (public.is_staff_of(agency_id));
create policy funding_files_update on public.funding_files for update to authenticated
  using (public.is_staff_of(agency_id)) with check (public.is_staff_of(agency_id));
create policy funding_files_delete on public.funding_files for delete to authenticated
  using (public.is_admin_of(agency_id));

-- production_logs, time_entries, eod_submissions, webhook_* : agency-owned
drop policy if exists production_logs_select on public.production_logs;
create policy production_logs_select on public.production_logs for select to authenticated
  using (public.is_staff_of(agency_id)
         and (employee_id = auth.uid() or public.is_manager_of(agency_id)));

drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries for select to authenticated
  using (public.is_staff_of(agency_id)
         and (employee_id = auth.uid() or public.is_manager_of(agency_id)));

drop policy if exists eod_submissions_select on public.eod_submissions;
create policy eod_submissions_select on public.eod_submissions for select to authenticated
  using (public.is_staff_of(agency_id)
         and (employee_id = auth.uid() or public.is_manager_of(agency_id)));

drop policy if exists webhook_endpoints_select on public.webhook_endpoints;
drop policy if exists webhook_endpoints_write  on public.webhook_endpoints;
create policy webhook_endpoints_select on public.webhook_endpoints for select to authenticated
  using (public.is_staff_of(agency_id));
create policy webhook_endpoints_write on public.webhook_endpoints for all to authenticated
  using (public.is_admin_of(agency_id)) with check (public.is_admin_of(agency_id));

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using (public.is_staff_of(agency_id));

-- activity_events — now anchored to its own agency, not to a parent that can go
drop policy if exists activity_events_select on public.activity_events;
drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_select on public.activity_events for select to authenticated
  using (
    public.is_staff_of(agency_id)
    or (organization_id is not null and public.is_org_member(organization_id))
  );
create policy activity_events_insert on public.activity_events for insert to authenticated
  with check (
    public.is_staff_of(agency_id)
    or (organization_id is not null and public.is_org_member(organization_id))
  );

-- work_items and files
drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
  using (public.is_staff_of(agency_id) or public.can_view_work(scope, organization_id, subject_organization_id));

drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_org_member(organization_id));

-- audit_log
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_staff_of(agency_id)
         or (organization_id is not null and public.is_org_member(organization_id)));

-- -----------------------------------------------------------------------------
-- 4. The write side. A correct SELECT policy is no use if Agency B can INSERT
--    into Agency A's tables — requirement "Agency A cannot write into Agency B".
--    Each of these previously used the agency-blind staff check.
-- -----------------------------------------------------------------------------
drop policy if exists production_logs_insert on public.production_logs;
create policy production_logs_insert on public.production_logs for insert to authenticated
  with check (employee_id = auth.uid() and public.is_staff_of(agency_id));

drop policy if exists production_logs_update on public.production_logs;
create policy production_logs_update on public.production_logs for update to authenticated
  using (public.is_manager_of(agency_id)) with check (public.is_manager_of(agency_id));

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (employee_id = auth.uid() and public.is_staff_of(agency_id));

drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries for update to authenticated
  using (employee_id = auth.uid() and ended_at is null and public.is_staff_of(agency_id))
  with check (employee_id = auth.uid() and public.is_staff_of(agency_id));

drop policy if exists eod_submissions_insert on public.eod_submissions;
create policy eod_submissions_insert on public.eod_submissions for insert to authenticated
  with check (employee_id = auth.uid() and public.is_staff_of(agency_id));

drop policy if exists eod_submissions_update on public.eod_submissions;
create policy eod_submissions_update on public.eod_submissions for update to authenticated
  using (
    public.is_staff_of(agency_id)
    and ((employee_id = auth.uid() and state in ('draft','needs_clarification'))
         or public.is_manager_of(agency_id))
  )
  with check (
    public.is_staff_of(agency_id)
    and ((employee_id = auth.uid() and state in ('draft','submitted'))
         or public.is_manager_of(agency_id))
  );

drop policy if exists webhook_deliveries_insert on public.webhook_deliveries;
create policy webhook_deliveries_insert on public.webhook_deliveries for insert to authenticated
  with check (public.is_staff_of(agency_id));

drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert on public.work_items for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.can_write_work(scope, organization_id));

drop policy if exists work_items_update on public.work_items;
create policy work_items_update on public.work_items for update to authenticated
  using (
    public.is_staff_of(agency_id)
    and (assigned_to = auth.uid() or public.is_manager_of(agency_id))
  )
  with check (public.is_staff_of(agency_id));

drop policy if exists work_items_delete on public.work_items;
create policy work_items_delete on public.work_items for delete to authenticated
  using (public.is_admin_of(agency_id));

drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (uploaded_by = auth.uid() and public.is_staff_of(agency_id));

drop policy if exists files_delete on public.files;
create policy files_delete on public.files for delete to authenticated
  using (public.is_staff_of(agency_id)
         and (uploaded_by = auth.uid() or public.is_manager_of(agency_id)));

/* activity_events stays update-restricted to the pin/mark columns granted in
   migration 0008; this only adds the agency test to the row check. */
drop policy if exists activity_events_update on public.activity_events;
create policy activity_events_update on public.activity_events for update to authenticated
  using (
    public.is_staff_of(agency_id)
    and ((actor_id = auth.uid() and field is null) or public.is_manager_of(agency_id))
  )
  with check (
    public.is_staff_of(agency_id)
    and ((actor_id = auth.uid() and field is null) or public.is_manager_of(agency_id))
  );
