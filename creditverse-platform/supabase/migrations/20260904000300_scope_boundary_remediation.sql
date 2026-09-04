-- =============================================================================
-- Phase 2 remediation — close the boundary around the scoped records
--
-- An independent adversarial review of migration 0021 (real users' JWTs, every
-- probe rolled back) confirmed the model on the three tables it was applied to
-- and failed it as a system boundary. The parent records were scoped; their
-- satellites were not. `bes.restricted` — assigned nothing — read 53 department
-- statuses, 94 activity events, 3 funding files and 5 customer businesses, and
-- could blind-UPDATE or DELETE every department status, deal and funding file.
-- Two escalation paths existed. Staff could INSERT into records they could not
-- read. Each finding below names the review item it closes.
--
-- Principle applied throughout: **a child follows its parent.** Where a table
-- hangs off a scoped record, its policy asks whether the caller can see that
-- record — an EXISTS that runs under the caller's own RLS — rather than
-- restating scope. One rule, evaluated once, inherited everywhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Helpers
-- -----------------------------------------------------------------------------

-- Can the caller see the record an activity event or file hangs off?
-- SECURITY INVOKER on purpose: the EXISTS must run under the caller's RLS so the
-- parent's scope is what answers. Entity types with no scoped parent keep the
-- visibility rule alone. (Findings 3, 6, 14)
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    else true
  end
$$;

-- Any live engagement with this organization, for any service. Used where a
-- record is organization-level rather than service-level (businesses, work
-- items with no division). Staff status alone is never access. (Findings 4, 5)
create or replace function public.bes_engaged_with(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_org is not null and exists (
    select 1 from public.fulfillment_engagements e
     where e.organization_id = p_org
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
       and public.is_staff_of(e.agency_id)
  )
$$;

-- Strictly the org_admin role. `is_org_admin()` deliberately includes
-- org_manager for day-to-day administration; membership and role changes are
-- not day-to-day. (Finding 9)
create or replace function public.is_org_owner_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_org is not null and exists (
    select 1 from public.org_memberships
     where user_id = auth.uid() and organization_id = p_org and role = 'org_admin'
  )
$$;

-- The agency that owns an organization. Several child tables carry no
-- agency_id of their own.
create or replace function public.org_agency(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select agency_id from public.organizations where id = p_org
$$;

-- production_logs.division_id is text. Cast only known service labels.
create or replace function public.to_service(p text)
returns public.fulfillment_service language sql immutable as $$
  select case when p in ('creditops','fundingops','bes_crm','talentops') then p::public.fulfillment_service end
$$;

-- Supervision follows the roster, but only for LIVE teams the agency owns. An
-- organization admin could otherwise add a BES agent to an organization team
-- and hand them agency work through the lead clause; an archived team could
-- keep granting reach after it was retired. (Findings 8, 13)
create or replace function public.is_team_lead_of(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_team is not null and exists (
    select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
     where tm.team_id = p_team and tm.user_id = auth.uid() and tm.is_lead
       and t.archived_at is null
  )
$$;

create or replace function public.in_scope(
  p_agency   uuid,
  p_division public.fulfillment_service,
  p_team     uuid,
  p_assignee uuid,
  p_creator  uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select
    (p_assignee is not null and p_assignee = auth.uid())
    or coalesce((
      select case m.scope
        when 'agency'     then true
        when 'division'   then p_division is not null and p_division = m.scope_division
        when 'department' then p_team is not null and exists (
                                 select 1 from public.teams t
                                  where t.id = p_team and t.agency_id = p_agency and t.archived_at is null
                                    and t.department_id = m.scope_department_id)
        when 'team'       then p_team is not null and exists (
                                 select 1 from public.team_memberships tm
                                   join public.teams t on t.id = tm.team_id
                                  where tm.team_id = p_team and tm.user_id = auth.uid()
                                    and t.agency_id = p_agency and t.archived_at is null)
        when 'self'       then p_creator is not null and p_creator = auth.uid()
        else false
      end
      from public.agency_memberships m
     where m.user_id = auth.uid() and m.agency_id = p_agency
    ), false)
    -- supervision: the team must be this agency's own
    or (p_team is not null
        and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = p_agency)
        and public.is_team_lead_of(p_team))
$$;

-- Who may be assigned. Was: any staff member could enumerate any customer's
-- roster. Now: agency rosters for managers and leads; an organization's roster
-- for its own admins, or for engaged managers/leads. (Finding 10)
create or replace function public.assignable_profiles(p_scope public.work_scope, p_org uuid default null)
returns table (id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email::text, am.role::text
    from public.agency_memberships am join public.profiles p on p.id = am.user_id
   where p_scope = 'AGENCY'
     and (public.is_manager_of(am.agency_id)
          or exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                      where tm.user_id = auth.uid() and tm.is_lead and t.agency_id = am.agency_id))
  union all
  select p.id, p.full_name, p.email::text, om.role::text
    from public.org_memberships om join public.profiles p on p.id = om.user_id
   where p_scope = 'ORGANIZATION' and om.organization_id = p_org
     and (public.is_org_admin(p_org)
          or (public.bes_engaged_with(p_org) and public.is_manager_of(public.org_agency(p_org))))
$$;

-- Directory visibility. Was: `is_agency_staff()` — every staffer read every
-- profile on the platform. Now: yourself; people in your own agency; managers
-- of your agency; and people who share an organization with you. (Finding 10)
create or replace function public.shares_scope_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
    or exists (select 1 from public.agency_memberships a join public.agency_memberships b
                 on a.agency_id = b.agency_id where a.user_id = auth.uid() and b.user_id = p_user)
    or exists (select 1 from public.org_memberships a join public.org_memberships b
                 on a.organization_id = b.organization_id where a.user_id = auth.uid() and b.user_id = p_user)
    -- engaged managers may see the customer users they coordinate with
    or exists (select 1 from public.org_memberships b
                where b.user_id = p_user and public.bes_engaged_with(b.organization_id)
                  and public.is_manager_of(public.org_agency(b.organization_id)))
$$;

-- Trigger-only and seed-only functions must not be callable by clients. A
-- probe with no membership wrote an arbitrary row into audit_log through
-- log_audit(). Postgres does not check EXECUTE when a trigger fires, so
-- revoking from clients costs the triggers nothing. (Finding 12)
revoke all on function public.log_audit(text, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.audit_scope_change() from public, anon, authenticated;
revoke all on function public.work_items_derive_tenancy() from public, anon, authenticated;
revoke all on function public.dev_uuid(text) from public, anon, authenticated;

revoke all on function public.entity_visible(text, text) from public, anon;
revoke all on function public.bes_engaged_with(uuid) from public, anon;
revoke all on function public.is_org_owner_admin(uuid) from public, anon;
revoke all on function public.org_agency(uuid) from public, anon;
revoke all on function public.to_service(text) from public, anon;
grant execute on function public.entity_visible(text, text) to authenticated;
grant execute on function public.bes_engaged_with(uuid) to authenticated;
grant execute on function public.is_org_owner_admin(uuid) to authenticated;
grant execute on function public.org_agency(uuid) to authenticated;
grant execute on function public.to_service(text) to authenticated;

-- -----------------------------------------------------------------------------
-- B. Activity and files follow their record (Findings 3, 6, 14)
-- -----------------------------------------------------------------------------
drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events for select to authenticated
  using (public.can_view_activity(agency_id, organization_id, visibility, entity_type)
         and public.entity_visible(entity_type, entity_id));

drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_insert on public.activity_events for insert to authenticated
  with check (
    public.can_view_activity(agency_id, organization_id, visibility, entity_type)
    and public.entity_visible(entity_type, entity_id)
    and (
      (public.is_staff_of(agency_id)
        and visibility in ('bes_internal', 'shared_with_partner', 'client_visible'))
      or (organization_id is not null and public.is_org_member(organization_id)
        and visibility in ('organization_internal', 'shared_with_partner', 'client_visible'))
    )
    and actor_id = auth.uid()
  );

drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (
    case
      when entity_type = 'activity_event' then
        exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(public.files.entity_id))
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
    and case
      when entity_type = 'activity_event' then
        exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(public.files.entity_id))
      else public.entity_visible(entity_type, entity_id)
    end
  );

-- -----------------------------------------------------------------------------
-- C. Customer businesses need an engagement (Finding 4)
-- -----------------------------------------------------------------------------
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select to authenticated
  using (public.is_org_member(organization_id)
         or (public.bes_engaged_with(organization_id) and public.is_staff_of(public.org_agency(organization_id))));
drop policy if exists businesses_write on public.businesses;
create policy businesses_write on public.businesses for all to authenticated
  using (public.is_org_admin(organization_id)
         or (public.bes_engaged_with(organization_id) and public.is_manager_of(public.org_agency(organization_id))))
  with check (public.is_org_admin(organization_id)
         or (public.bes_engaged_with(organization_id) and public.is_manager_of(public.org_agency(organization_id))));

-- -----------------------------------------------------------------------------
-- D. Work items: engagement for organization-scope work; assignment and team
--    changes are supervisory acts (Findings 5, 6, 13)
-- -----------------------------------------------------------------------------
drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
  using (
    (public.is_staff_of(agency_id)
      and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
      and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
    or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
    or (scope = 'AGENCY' and subject_organization_id is not null and public.is_org_admin(subject_organization_id))
  );

drop policy if exists work_items_update on public.work_items;
create policy work_items_update on public.work_items for update to authenticated
  using (
    (public.is_staff_of(agency_id)
      and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
      and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
    or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
  )
  with check (
    -- the team must be a live team of this agency (or an org team of this org)
    (team_id is null or exists (select 1 from public.teams t where t.id = team_id and t.archived_at is null
                                  and (t.agency_id = agency_id or t.organization_id = organization_id)))
    -- assigning someone else is a supervisor's act
    and (assigned_to is null or assigned_to = auth.uid()
         or public.is_manager_of(agency_id) or public.is_team_lead_of(team_id)
         or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id)))
  );

drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert on public.work_items for insert to authenticated
  with check (
    (assigned_to is null or assigned_to = auth.uid()
     or public.is_manager_of(agency_id) or public.is_team_lead_of(team_id)
     or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id)))
    and (
      (scope = 'AGENCY' and public.is_staff_of(agency_id))
      or (scope = 'ORGANIZATION' and organization_id is not null
          and public.is_org_member(organization_id)
          and agency_id = public.org_agency(organization_id))
      or (scope = 'ORGANIZATION' and organization_id is not null and division is not null
          and public.is_staff_of(agency_id)
          and public.bes_may_fulfil(organization_id, null, division))
    )
  );

-- -----------------------------------------------------------------------------
-- E. Client creation is a ceiling act, not an assignment act (Finding 6)
--    `in_scope` with a NULL assignee answers only for agency/division/team/lead:
--    an assigned-only agent cannot mint a client and assign it to themselves.
-- -----------------------------------------------------------------------------
drop policy if exists fulfillment_clients_insert on public.fulfillment_clients;
create policy fulfillment_clients_insert on public.fulfillment_clients for insert to authenticated
  with check (public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
              and public.in_scope(agency_id, 'creditops', team_id, null, null)
              and (team_id is null or exists (select 1 from public.teams t where t.id = team_id and t.agency_id = agency_id and t.archived_at is null)));
drop policy if exists funding_clients_insert on public.funding_clients;
create policy funding_clients_insert on public.funding_clients for insert to authenticated
  with check (public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
              and public.in_scope(agency_id, 'fundingops', team_id, null, null)
              and (team_id is null or exists (select 1 from public.teams t where t.id = team_id and t.agency_id = agency_id and t.archived_at is null)));

drop policy if exists fulfillment_clients_update on public.fulfillment_clients;
create policy fulfillment_clients_update on public.fulfillment_clients for update to authenticated
  using (public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
         and public.in_scope(agency_id, 'creditops', team_id, assigned_agent_id, created_by))
  with check (team_id is null or exists (select 1 from public.teams t where t.id = team_id and t.agency_id = agency_id and t.archived_at is null));
drop policy if exists funding_clients_update on public.funding_clients;
create policy funding_clients_update on public.funding_clients for update to authenticated
  using (public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
         and public.in_scope(agency_id, 'fundingops', team_id, assigned_agent_id, created_by))
  with check (team_id is null or exists (select 1 from public.teams t where t.id = team_id and t.agency_id = agency_id and t.archived_at is null));

-- -----------------------------------------------------------------------------
-- F. Funding files follow their client (Findings 2, 7)
-- -----------------------------------------------------------------------------
drop policy if exists funding_files_select on public.funding_files;
create policy funding_files_select on public.funding_files for select to authenticated
  using (assigned_agent_id = auth.uid()
         or exists (select 1 from public.funding_clients c where c.id = funding_files.client_id));
drop policy if exists funding_files_insert on public.funding_files;
create policy funding_files_insert on public.funding_files for insert to authenticated
  with check (public.is_staff_of(agency_id)
              and exists (select 1 from public.funding_clients c where c.id = funding_files.client_id));
drop policy if exists funding_files_update on public.funding_files;
create policy funding_files_update on public.funding_files for update to authenticated
  using (assigned_agent_id = auth.uid()
         or exists (select 1 from public.funding_clients c where c.id = funding_files.client_id))
  with check (exists (select 1 from public.funding_clients c where c.id = funding_files.client_id));

-- -----------------------------------------------------------------------------
-- G. Production: only on a client you can see; managers within their division
--    (Findings 6, 11)
-- -----------------------------------------------------------------------------
drop policy if exists production_logs_insert on public.production_logs;
create policy production_logs_insert on public.production_logs for insert to authenticated
  with check (employee_id = auth.uid() and public.is_staff_of(agency_id)
              and (client_id is null or exists (select 1 from public.fulfillment_clients c where c.id = production_logs.client_id)));
drop policy if exists production_logs_select on public.production_logs;
create policy production_logs_select on public.production_logs for select to authenticated
  using (public.is_staff_of(agency_id)
         and (employee_id = auth.uid()
              or (public.is_manager_of(agency_id) and public.in_scope(agency_id, public.to_service(division_id), null, null, null))));
drop policy if exists production_logs_update on public.production_logs;
create policy production_logs_update on public.production_logs for update to authenticated
  using (public.is_manager_of(agency_id) and public.in_scope(agency_id, public.to_service(division_id), null, null, null))
  with check (public.is_manager_of(agency_id) and public.in_scope(agency_id, public.to_service(division_id), null, null, null));

-- -----------------------------------------------------------------------------
-- H. Rosters and roles: no escalation paths (Findings 8, 9, 13)
-- -----------------------------------------------------------------------------
drop policy if exists team_memberships_select on public.team_memberships;
create policy team_memberships_select on public.team_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_team_lead_of(team_id)
    -- a member may see who else is on their team
    or exists (select 1 from public.team_memberships me where me.team_id = team_memberships.team_id and me.user_id = auth.uid())
    or exists (select 1 from public.teams t where t.id = team_id and (
         (t.agency_id is not null and public.is_manager_of(t.agency_id))
         or (t.organization_id is not null and public.is_org_admin(t.organization_id))))
  );

drop policy if exists team_memberships_write on public.team_memberships;
create policy team_memberships_write on public.team_memberships for all to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and (
           (t.agency_id is not null and public.is_admin_of(t.agency_id))
           or (t.organization_id is not null and public.is_org_owner_admin(t.organization_id)))))
  with check (
    -- the person must belong to the team's owner: no adding outsiders
    exists (select 1 from public.teams t where t.id = team_id and (
      (t.agency_id is not null and public.is_admin_of(t.agency_id)
         and exists (select 1 from public.agency_memberships am where am.user_id = team_memberships.user_id and am.agency_id = t.agency_id))
      or (t.organization_id is not null and public.is_org_owner_admin(t.organization_id)
         and exists (select 1 from public.org_memberships om where om.user_id = team_memberships.user_id and om.organization_id = t.organization_id))))
  );

-- Membership and role changes: strictly org_admin (or the engaged agency's
-- manager), and never one's own row.
drop policy if exists org_memberships_write on public.org_memberships;
create policy org_memberships_insert on public.org_memberships for insert to authenticated
  with check (public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)));
create policy org_memberships_update on public.org_memberships for update to authenticated
  using ((public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)))
         and user_id <> auth.uid())
  with check ((public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)))
         and user_id <> auth.uid());
create policy org_memberships_delete on public.org_memberships for delete to authenticated
  using ((public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)))
         and user_id <> auth.uid());

-- -----------------------------------------------------------------------------
-- I. Fixtures for the matrix: an unassigned Team A client (the "team queue"
--    the doctrine decides about) and an Ironwood client (no engagement — nobody
--    at BES may see it, positive control being Ironwood's own staff if any).
-- -----------------------------------------------------------------------------
do $$
declare v_agency uuid := 'a0000000-0000-4000-8000-000000000001'; v_iron uuid;
begin
  if not exists (select 1 from public.agencies where id = v_agency) then return; end if;
  update public.fulfillment_clients set assigned_agent_id = null
   where name = '[TEST] Dana Doyle' and agency_id = v_agency;
  select id into v_iron from public.organizations where name = '[TEST] Ironwood Self-Serve';
  if v_iron is not null then
    insert into public.fulfillment_clients (id, agency_id, name, email, mode, organization_id, auto_sync, status, round)
    values (public.dev_uuid('client ironwood no engagement'), v_agency, '[TEST] Ivan Ironwood', 'ivan.ironwood@bes.test',
            'saas_pulled', v_iron, false, 'Onboarding', 'Pre-Round')
    on conflict (id) do nothing;
  end if;
end $$;
