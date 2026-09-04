-- Service-aware production. See ARCHITECTURE_PROPOSAL_PRODUCTION.md for the
-- consumer checklist this was verified against. One engine; the service is a
-- first-class dimension; each service carries the subject it produces on.

----------------------------------------------------------------------
-- 1. Taxonomy as data — seeded only from vocabularies that already exist.
----------------------------------------------------------------------
create table public.production_departments (
  service  public.fulfillment_service not null,
  key      text not null check (length(trim(key)) between 1 and 40),
  label    text not null,
  position integer not null default 0,
  primary key (service, key)
);
insert into public.production_departments (service, key, label, position)
select 'creditops'::public.fulfillment_service, e, e, ord - 1 from unnest(enum_range(null::public.fulfillment_department)::text[]) with ordinality as t(e, ord)
union all
select 'fundingops'::public.fulfillment_service, e, e, ord - 1 from unnest(enum_range(null::public.funding_department)::text[]) with ordinality as t(e, ord);
alter table public.production_departments enable row level security;
revoke all on public.production_departments from public, anon;
grant select on public.production_departments to authenticated;
create policy production_departments_select on public.production_departments
  for select to authenticated using (public.is_agency_staff());

----------------------------------------------------------------------
-- 2. Columns. Policies depend on division_id, so they go first.
----------------------------------------------------------------------
drop policy if exists production_logs_insert on public.production_logs;
drop policy if exists production_logs_select on public.production_logs;
drop policy if exists production_logs_update on public.production_logs;

alter table public.production_logs
  add column service           public.fulfillment_service,
  add column department_key    text,
  add column funding_client_id uuid references public.funding_clients(id) on delete restrict,
  add column funding_deal_id   uuid references public.funding_deals(id)   on delete restrict,
  add column work_item_id      uuid references public.work_items(id)      on delete restrict;

update public.production_logs
   set service        = coalesce(public.to_service(division_id), 'creditops'),
       department_key = department::text;

alter table public.production_logs alter column service set not null;
alter table public.production_logs
  add constraint production_logs_department_fk
  foreign key (service, department_key) references public.production_departments(service, key);

-- Production history must not lose its subject (rule 11): restrict, not set null.
alter table public.production_logs drop constraint production_logs_client_id_fkey;
alter table public.production_logs
  add constraint production_logs_client_id_fkey foreign key (client_id) references public.fulfillment_clients(id) on delete restrict;

alter table public.production_logs
  add constraint production_logs_subject_matches_service check (
    case service
      when 'creditops'  then client_id is not null and funding_client_id is null and funding_deal_id is null and work_item_id is null
      when 'fundingops' then funding_client_id is not null and client_id is null and work_item_id is null
      else                   work_item_id is not null and client_id is null and funding_client_id is null and funding_deal_id is null
    end
  );

-- One truth: division_id is derived from service by the trigger below (an
-- enum→text cast is only STABLE, so a generated column is not allowed). Its
-- 'creditops' default goes: nothing may imply a service that was not stated.
alter table public.production_logs alter column division_id drop default;

create index production_logs_service_date_idx on public.production_logs (agency_id, service, work_date);
create index production_logs_work_item_idx on public.production_logs (work_item_id) where work_item_id is not null;
create index production_logs_funding_client_idx on public.production_logs (funding_client_id) where funding_client_id is not null;

----------------------------------------------------------------------
-- 3. Derivation: tenancy, legacy department and unit type come from the
--    subject, never from the client.
----------------------------------------------------------------------
create or replace function public.production_logs_derive_context()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid; v_org uuid; v_group uuid;
begin
  if new.service = 'creditops' then
    select c.agency_id, c.organization_id, c.outsourcing_group_id into v_agency, v_org, v_group
      from public.fulfillment_clients c where c.id = new.client_id;
    if v_agency is null then raise exception 'CreditOps production requires an existing client' using errcode = '23514'; end if;
    new.department := case
      when new.department_key is not null and new.department_key = any (enum_range(null::public.fulfillment_department)::text[])
        then new.department_key::public.fulfillment_department end;
  elsif new.service = 'fundingops' then
    select c.agency_id, c.organization_id, c.outsourcing_group_id into v_agency, v_org, v_group
      from public.funding_clients c where c.id = new.funding_client_id;
    if v_agency is null then raise exception 'FundingOps production requires an existing funding client' using errcode = '23514'; end if;
    if new.funding_deal_id is not null and not exists (
         select 1 from public.funding_deals d where d.id = new.funding_deal_id and d.client_id = new.funding_client_id) then
      raise exception 'deal belongs to another funding client' using errcode = '23514';
    end if;
    new.department := null;
  else
    select w.agency_id, coalesce(w.organization_id, w.subject_organization_id), null into v_agency, v_org, v_group
      from public.work_items w where w.id = new.work_item_id;
    if v_agency is null then raise exception 'production on a work item requires an existing work item' using errcode = '23514'; end if;
    new.department := null;
  end if;

  new.agency_id := v_agency;
  new.organization_id := v_org;
  new.outsourcing_group_id := v_group;
  new.division_id := new.service::text;   -- legacy reader compatibility; never client-set
  new.production_unit_type := coalesce(nullif(trim(new.production_unit_type), ''), new.department_key, 'Work item');
  return new;
end $$;
revoke execute on function public.production_logs_derive_context() from public, anon, authenticated;
create trigger production_logs_derive_context
  before insert or update on public.production_logs
  for each row execute function public.production_logs_derive_context();

----------------------------------------------------------------------
-- 4. Authorization, by service. Insert: the subject must be visible to the
--    caller under their own RLS. Read/void: self, or a manager within scope
--    for that service.
----------------------------------------------------------------------
create policy production_logs_insert on public.production_logs for insert to authenticated
  with check (
    employee_id = auth.uid()
    and public.is_staff_of(agency_id)
    and case service
          when 'creditops'  then public.entity_visible('fulfillment_client', client_id::text)
          when 'fundingops' then public.entity_visible('funding_client', funding_client_id::text)
          else                   public.entity_visible('work_item', work_item_id::text)
        end
  );
create policy production_logs_select on public.production_logs for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (employee_id = auth.uid()
         or (public.is_manager_of(agency_id) and public.in_scope(agency_id, service, null, null, null)))
  );
create policy production_logs_update on public.production_logs for update to authenticated
  using (public.is_manager_of(agency_id) and public.in_scope(agency_id, service, null, null, null))
  with check (public.is_manager_of(agency_id) and public.in_scope(agency_id, service, null, null, null));

----------------------------------------------------------------------
-- 5. Completion → production, exactly once, for work-item services.
--    BES staff completer only; CreditOps/FundingOps items excluded (their
--    production is logged from their own surfaces).
----------------------------------------------------------------------
create or replace function public.work_items_completion_production()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_service public.fulfillment_service;
  v_unit    text;
begin
  if new.division not in ('bes_crm', 'talentops') and new.workspace_id is null then return new; end if;
  if auth.uid() is null or not public.is_staff_of(new.agency_id) then return new; end if;

  -- A workspace item without a division is BES work under TalentOps (the only
  -- way BES reaches a workspace).
  v_service := coalesce(new.division, 'talentops');
  select t.label into v_unit from public.workspace_item_types t where t.id = new.item_type_id;

  insert into public.production_logs
    (request_id, agency_id, employee_id, service, work_item_id, production_unit_type,
     production_unit_quantity, actions, work_notes, work_date, completed_at)
  values
    (md5('work_item_completion:' || new.id::text)::uuid, new.agency_id, auth.uid(), v_service, new.id,
     coalesce(v_unit, 'Work item'), 1, array['Work item completed'], new.title, current_date, new.completed_at)
  on conflict (agency_id, request_id) where request_id is not null do nothing;
  return new;
end $$;
revoke execute on function public.work_items_completion_production() from public, anon, authenticated;
create trigger work_items_completion_production
  after update on public.work_items
  for each row
  when (new.completed_at is not null and old.completed_at is null)
  execute function public.work_items_completion_production();

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
