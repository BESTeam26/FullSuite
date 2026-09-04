-- =============================================================================
-- Team + Assignment Scope — person-level authorization for BES staff
--
-- What exists (measured, not assumed): tenant isolation and fulfillment
-- engagement gating are real, but every operational SELECT stops there. A BES
-- agent assigned nothing reads all 10 work items and all 6 attention rows,
-- because `work_items_select` is `is_staff_of(agency_id)` and
-- `fulfillment_clients_select` is `bes_may_fulfil(...)` — neither asks *which
-- person*. Workforce tables already have the right shape
-- (`employee_id = auth.uid() or is_manager_of(...)`); operational tables never
-- got it.
--
-- This adds the missing half and applies it. The concepts stay separate:
--   role        what may this person DO           agency_memberships.role
--   scope       across what boundary              agency_memberships.scope
--   assignment  what is THEIR responsibility      *.assigned_to / assigned_agent_id
--   team        which roster they belong to        team_memberships
--   division    which service a record belongs to work_items.division / table
--   engagement  may BES touch this org at all      bes_may_fulfil (unchanged)
--
-- One evaluation point, `in_scope(...)`, composed into each operational policy.
-- Team membership is the ROSTER; scope is the CEILING. Being on a team does not
-- by itself widen reads — an agent with scope 'assigned' who is also on Team A
-- still sees only assignments. That is the explicit decision, so an admin who
-- wants an agent to pick from the team queue grants scope 'team' deliberately
-- rather than query breadth deciding it for them.
--
-- Assignment always counts: whatever the ceiling, a record assigned to you is
-- yours to see and update. A team lead supervises their team regardless of
-- their own ceiling. Everything else is default deny.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Scope vocabulary
-- -----------------------------------------------------------------------------
create type public.access_scope as enum (
  'agency',      -- everything the agency may reach
  'division',    -- one service: creditops / fundingops / …
  'department',  -- one department within a division
  'team',        -- records on my teams, including the unassigned queue
  'assigned',    -- only records assigned to me           ← default: deny
  'self'         -- assigned to me, or created by me
);

-- -----------------------------------------------------------------------------
-- 2. Organizational structure — the minimum that is FK-addressable
--
-- Division needs no table: `fulfillment_service` is already the canonical
-- identity of a service, and the enum is what engagements and activity use.
-- Department does need one, because department identity is split across two
-- enums today (`fulfillment_department`, `funding_department`) and a scope
-- must point at ONE stable id, never at a label.
-- -----------------------------------------------------------------------------
create table public.departments (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  division     public.fulfillment_service not null,
  key          text not null,
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (agency_id, division, key)
);

-- One teams table for both sides. Rule 17: never a second team system. A team
-- belongs to exactly one owner — the agency (BES teams) or an organization
-- (customer teams) — and optionally to a department.
create table public.teams (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid references public.agencies(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete cascade,
  department_id    uuid references public.departments(id) on delete set null,
  name             text not null,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz,            -- archive, never delete (rule 11)
  constraint teams_one_owner check ((agency_id is null) <> (organization_id is null))
);
create index teams_agency_idx on public.teams (agency_id) where agency_id is not null;
create index teams_org_idx    on public.teams (organization_id) where organization_id is not null;

-- Join table, so a person may sit on several teams (business-valid) and a lead
-- is a property of the membership, not of the person.
create table public.team_memberships (
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  is_lead     boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_memberships_user_idx on public.team_memberships (user_id);

-- -----------------------------------------------------------------------------
-- 3. Scope on the membership
-- -----------------------------------------------------------------------------
alter table public.agency_memberships
  add column scope               public.access_scope not null default 'assigned',
  add column scope_division      public.fulfillment_service,
  add column scope_department_id uuid references public.departments(id) on delete set null;

-- 'assigned' would strand every existing user, including the owner. Backfill in
-- the same transaction. Owners and admins were agency-wide; managers were too
-- (`is_manager_of` already grants agency-wide escalation on production, time
-- and EOD), and narrowing a real role is a policy decision, not a migration's.
-- Team leads get 'team' and are attached to teams below; agents keep the
-- default — deny until someone widens them.
update public.agency_memberships set scope = case role
  when 'agency_owner'     then 'agency'::public.access_scope
  when 'agency_admin'     then 'agency'
  when 'agency_manager'   then 'agency'
  when 'agency_team_lead' then 'team'
  else                         'assigned'
end;

-- -----------------------------------------------------------------------------
-- 4. Records learn their team and, for work items, their division
-- -----------------------------------------------------------------------------
alter table public.work_items
  add column division public.fulfillment_service,
  add column team_id  uuid references public.teams(id) on delete set null;
alter table public.fulfillment_clients
  add column team_id  uuid references public.teams(id) on delete set null;
alter table public.funding_clients
  add column team_id  uuid references public.teams(id) on delete set null;

create index work_items_team_idx          on public.work_items (agency_id, team_id) where team_id is not null;
create index work_items_division_idx      on public.work_items (agency_id, division) where division is not null;
create index fulfillment_clients_team_idx on public.fulfillment_clients (agency_id, team_id) where team_id is not null;
create index funding_clients_team_idx     on public.funding_clients (agency_id, team_id) where team_id is not null;

-- Division from what the work is about. `project` and `support` are left NULL
-- on purpose: a division-scoped reader will not see them, an agency-scoped one
-- will — default deny rather than a guess.
update public.work_items set division = case related_type
  when 'credit_case'  then 'creditops'::public.fulfillment_service
  when 'fulfillment'  then 'creditops'
  when 'funding_deal' then 'fundingops'
  else null
end where division is null;

-- -----------------------------------------------------------------------------
-- 5. The single evaluation point
-- -----------------------------------------------------------------------------

-- Does the caller lead this team? Supervision follows the roster, not the
-- ceiling, so a lead whose own scope is 'assigned' still oversees their team.
create or replace function public.is_team_lead_of(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_team is not null and exists (
    select 1 from public.team_memberships tm
     where tm.team_id = p_team and tm.user_id = auth.uid() and tm.is_lead
  )
$$;

/**
 * May the caller reach a record with these coordinates?
 *
 *   p_agency    the record's tenant
 *   p_division  the service it belongs to (a literal for single-service tables)
 *   p_team      its owning team, if any
 *   p_assignee  who is responsible, if anyone
 *   p_creator   who created it
 *
 * Order: responsibility first, then the caller's ceiling, then supervision.
 * A caller with no membership in p_agency gets false — default deny.
 */
create or replace function public.in_scope(
  p_agency   uuid,
  p_division public.fulfillment_service,
  p_team     uuid,
  p_assignee uuid,
  p_creator  uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select
    -- 1. Responsibility always counts, whatever the ceiling.
    (p_assignee is not null and p_assignee = auth.uid())
    -- 2. The caller's scope ceiling.
    or coalesce((
      select case m.scope
        when 'agency'     then true
        when 'division'   then p_division is not null and p_division = m.scope_division
        when 'department' then p_team is not null and exists (
                                 select 1 from public.teams t
                                  where t.id = p_team and t.department_id = m.scope_department_id)
        when 'team'       then p_team is not null and exists (
                                 select 1 from public.team_memberships tm
                                  where tm.team_id = p_team and tm.user_id = auth.uid())
        when 'self'       then p_creator is not null and p_creator = auth.uid()
        else false
      end
      from public.agency_memberships m
     where m.user_id = auth.uid() and m.agency_id = p_agency
    ), false)
    -- 3. Supervision: leads see their team regardless of their own ceiling.
    or public.is_team_lead_of(p_team)
$$;

-- Organization side. `assigned_only` already existed on org_memberships but
-- nothing enforced it. Admins and managers have the whole organization;
-- everyone else with assigned_only sees only their assignments.
create or replace function public.org_scope_allows(p_org uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_org is not null and (
    public.is_org_admin(p_org)
    or exists (
      select 1 from public.org_memberships m
       where m.user_id = auth.uid() and m.organization_id = p_org
         and (not m.assigned_only or p_assignee = auth.uid())
    )
  )
$$;

revoke all on function public.is_team_lead_of(uuid) from public, anon;
revoke all on function public.in_scope(uuid, public.fulfillment_service, uuid, uuid, uuid) from public, anon;
revoke all on function public.org_scope_allows(uuid, uuid) from public, anon;
grant execute on function public.is_team_lead_of(uuid) to authenticated;
grant execute on function public.in_scope(uuid, public.fulfillment_service, uuid, uuid, uuid) to authenticated;
grant execute on function public.org_scope_allows(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Apply the conjunct. Engagement and scope answer different questions and
--    both are required: MAY BES touch this organization's data, and WHICH
--    BES person.
-- -----------------------------------------------------------------------------

drop policy if exists fulfillment_clients_select on public.fulfillment_clients;
create policy fulfillment_clients_select on public.fulfillment_clients for select to authenticated
  using (
    (public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
      and public.in_scope(agency_id, 'creditops', team_id, assigned_agent_id, created_by))
    or (public.org_has_product(organization_id, 'creditOps')
      and public.org_scope_allows(organization_id, assigned_agent_id))
  );

drop policy if exists fulfillment_clients_update on public.fulfillment_clients;
create policy fulfillment_clients_update on public.fulfillment_clients for update to authenticated
  using (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'creditops')
    and public.in_scope(agency_id, 'creditops', team_id, assigned_agent_id, created_by)
  );

drop policy if exists funding_clients_select on public.funding_clients;
create policy funding_clients_select on public.funding_clients for select to authenticated
  using (
    (public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
      and public.in_scope(agency_id, 'fundingops', team_id, assigned_agent_id, created_by))
    or (public.org_has_product(organization_id, 'fundingOps')
      and public.org_scope_allows(organization_id, assigned_agent_id))
  );

drop policy if exists funding_clients_update on public.funding_clients;
create policy funding_clients_update on public.funding_clients for update to authenticated
  using (
    public.bes_may_fulfil(organization_id, outsourcing_group_id, 'fundingops')
    and public.in_scope(agency_id, 'fundingops', team_id, assigned_agent_id, created_by)
  );

-- work_items: the old SELECT let any staff member through and the org branch
-- ran through the agency-blind `can_view_work`, whose own `is_agency_staff()`
-- would have re-opened agency-wide reads. Written out explicitly instead.
drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
  using (
    (public.is_staff_of(agency_id)
      and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
    or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
    -- done-for-you transparency: an org admin sees agency work performed FOR them
    or (scope = 'AGENCY' and subject_organization_id is not null
        and public.is_org_admin(subject_organization_id))
  );

drop policy if exists work_items_update on public.work_items;
create policy work_items_update on public.work_items for update to authenticated
  using (
    (public.is_staff_of(agency_id)
      and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
    or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
  );

-- The attention view snapshots its column list, so it must be recreated to
-- carry the new coordinates the frontend and the matrix read. Still
-- security_invoker: it inherits work_items_select exactly.
drop view if exists public.work_attention;
create view public.work_attention with (security_invoker = true) as
select
  w.*,
  case
    when w.stage in ('Blocked', 'Attention') then 'blocked'
    when w.due_at is not null and w.due_at < now() then 'overdue'
    when w.due_at is not null and w.due_at < now() + interval '4 hours' then 'sla_risk'
  end as attention_reason,
  case
    when w.due_at is null then null
    else round(extract(epoch from (w.due_at - now())) / 3600.0, 1)
  end as hours_remaining
from public.work_items w
where w.completed_at is null
  and (w.stage in ('Blocked', 'Attention')
       or (w.due_at is not null and w.due_at < now() + interval '4 hours'));
grant select on public.work_attention to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RLS on the structure itself
-- -----------------------------------------------------------------------------
alter table public.departments      enable row level security;
alter table public.teams            enable row level security;
alter table public.team_memberships enable row level security;

create policy departments_select on public.departments for select to authenticated
  using (public.is_staff_of(agency_id));
create policy departments_write on public.departments for all to authenticated
  using (public.is_admin_of(agency_id)) with check (public.is_admin_of(agency_id));

create policy teams_select on public.teams for select to authenticated
  using (
    (agency_id is not null and public.is_staff_of(agency_id))
    or (organization_id is not null and public.is_org_member(organization_id))
  );
create policy teams_write on public.teams for all to authenticated
  using (
    (agency_id is not null and public.is_admin_of(agency_id))
    or (organization_id is not null and public.is_org_admin(organization_id))
  ) with check (
    (agency_id is not null and public.is_admin_of(agency_id))
    or (organization_id is not null and public.is_org_admin(organization_id))
  );

-- You may see your own memberships and those on teams you may see. Changing a
-- roster is an admin action on the team's owner.
create policy team_memberships_select on public.team_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.teams t where t.id = team_id and (
         (t.agency_id is not null and public.is_manager_of(t.agency_id))
         or (t.organization_id is not null and public.is_org_admin(t.organization_id))))
  );
create policy team_memberships_write on public.team_memberships for all to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and (
           (t.agency_id is not null and public.is_admin_of(t.agency_id))
           or (t.organization_id is not null and public.is_org_admin(t.organization_id)))))
  with check (exists (select 1 from public.teams t where t.id = team_id and (
           (t.agency_id is not null and public.is_admin_of(t.agency_id))
           or (t.organization_id is not null and public.is_org_admin(t.organization_id)))));

grant select, insert, update, delete on public.departments, public.teams, public.team_memberships to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Audit — roster and scope changes alter who may read what (rule 10)
-- -----------------------------------------------------------------------------
create or replace function public.audit_scope_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_agency uuid; v_entity text; v_id text;
begin
  if tg_table_name = 'team_memberships' then
    select t.agency_id into v_agency from public.teams t where t.id = coalesce(new.team_id, old.team_id);
    v_entity := 'team_membership';
    v_id := coalesce(new.team_id, old.team_id)::text || ':' || coalesce(new.user_id, old.user_id)::text;
  else
    v_agency := coalesce(new.agency_id, old.agency_id);
    v_entity := 'agency_membership';
    v_id := coalesce(new.id, old.id)::text;
  end if;
  insert into public.audit_log (actor_id, agency_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), v_agency, tg_op, v_entity, v_id,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger team_memberships_audit
  after insert or update or delete on public.team_memberships
  for each row execute function public.audit_scope_change();

create trigger agency_membership_scope_audit
  after update of scope, scope_division, scope_department_id, role on public.agency_memberships
  for each row execute function public.audit_scope_change();

-- -----------------------------------------------------------------------------
-- 9. Deterministic dev fixtures (same dev_uuid pattern as migration 0019).
--    Only the BES dev agency; only [TEST] records; re-runnable.
-- -----------------------------------------------------------------------------
do $$
declare
  v_agency uuid := 'a0000000-0000-4000-8000-000000000001';
  v_dispute uuid; v_onboarding uuid; v_submissions uuid;
  v_team_a uuid := public.dev_uuid('team creditops dispute A');
  v_team_b uuid := public.dev_uuid('team creditops onboarding B');
  v_team_f uuid := public.dev_uuid('team fundingops submissions F');
  u_lead uuid; u_credit uuid; u_funding uuid; u_manager uuid;
begin
  if not exists (select 1 from public.agencies where id = v_agency) then return; end if;

  -- Departments mirror the two department enums, keyed stably.
  insert into public.departments (agency_id, division, key, name) values
    (v_agency,'creditops','onboarding','Onboarding'),
    (v_agency,'creditops','dispute','Dispute'),
    (v_agency,'creditops','support','Support'),
    (v_agency,'creditops','complaints','Complaints'),
    (v_agency,'creditops','bureau_calling','Bureau Calling'),
    (v_agency,'fundingops','readiness_review','Readiness Review'),
    (v_agency,'fundingops','document_review','Document Review'),
    (v_agency,'fundingops','lender_matching','Lender Matching'),
    (v_agency,'fundingops','submissions','Submissions'),
    (v_agency,'fundingops','stipulations','Stipulations'),
    (v_agency,'fundingops','offers','Offers'),
    (v_agency,'fundingops','funded_deals','Funded Deals')
  on conflict (agency_id, division, key) do nothing;

  select id into v_dispute     from public.departments where agency_id=v_agency and division='creditops'  and key='dispute';
  select id into v_onboarding  from public.departments where agency_id=v_agency and division='creditops'  and key='onboarding';
  select id into v_submissions from public.departments where agency_id=v_agency and division='fundingops' and key='submissions';

  insert into public.teams (id, agency_id, department_id, name) values
    (v_team_a, v_agency, v_dispute,     'CreditOps · Dispute · Team A'),
    (v_team_b, v_agency, v_onboarding,  'CreditOps · Onboarding · Team B'),
    (v_team_f, v_agency, v_submissions, 'FundingOps · Submissions · Team F')
  on conflict (id) do update set name = excluded.name, department_id = excluded.department_id;

  -- Fixture accounts, looked up by email ONLY to obtain their ids for seeding.
  select id into u_lead    from public.profiles where email = 'bes.lead@bes.test';
  select id into u_credit  from public.profiles where email = 'bes.credit@bes.test';
  select id into u_funding from public.profiles where email = 'bes.funding@bes.test';
  select id into u_manager from public.profiles where email = 'bes.manager@bes.test';

  if u_lead is not null then
    insert into public.team_memberships (team_id, user_id, is_lead) values (v_team_a, u_lead, true)
    on conflict (team_id, user_id) do update set is_lead = true;
  end if;
  if u_credit is not null then
    insert into public.team_memberships (team_id, user_id, is_lead) values (v_team_a, u_credit, false)
    on conflict do nothing;
  end if;
  if u_funding is not null then
    insert into public.team_memberships (team_id, user_id, is_lead) values (v_team_f, u_funding, false)
    on conflict do nothing;
  end if;
  -- The fixture manager demonstrates DIVISION scope. Real managers keep parity.
  if u_manager is not null then
    update public.agency_memberships set scope='division', scope_division='creditops'
     where user_id = u_manager and agency_id = v_agency;
  end if;
  -- bes.restricted: deliberately on no team, scope 'assigned', assigned nothing.

  -- Records join teams. Lakeside + Northgate → Team A; Cedar → Team B (a queue
  -- with no fixture members, so only division/agency scope reaches it).
  update public.fulfillment_clients c set team_id = v_team_a
    from public.organizations o
   where o.id = c.organization_id and o.name in ('[TEST] Lakeside Partners','[TEST] Northgate Credit Co');
  update public.fulfillment_clients c set team_id = v_team_b
    from public.organizations o
   where o.id = c.organization_id and o.name = '[TEST] Cedar Financial';
  update public.funding_clients c set team_id = v_team_f
    from public.organizations o
   where o.id = c.organization_id and o.name = '[TEST] Harbor Capital Group';
  update public.work_items w set team_id = v_team_a, division = 'creditops'
    from public.organizations o
   where o.id = w.organization_id and o.name = '[TEST] Northgate Credit Co';
  update public.work_items w set team_id = v_team_b, division = 'creditops'
    from public.organizations o
   where o.id = w.organization_id and o.name = '[TEST] Cedar Financial';
end $$;
