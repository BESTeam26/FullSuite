-- =============================================================================
-- Separation step 3 (part 1): FundingOps operational status is keyed on the
-- FUNDING FILE, not the client row.
--
-- The database already models Client → Business → Funding File → Deals; the
-- operational rows (funding_department_statuses) were keyed by client. A file is
-- the unit of funding work, so each row now names its file. client_id stays
-- for the move (existing readers), file_id becomes the operational key.
--
-- Organization members write their own clients' files and department rows
-- within the reach the client policies grant (0050's rule); BES within scope as
-- before. set_funding_department_status validates the vocabulary, upserts and
-- writes the activity event atomically as the caller.
-- =============================================================================

alter table public.funding_department_statuses
  add column if not exists file_id uuid references public.funding_files(id) on delete cascade;

-- Backfill: each client's rows attach to that client's most recent file.
update public.funding_department_statuses s
   set file_id = f.id
  from (select distinct on (client_id) id, client_id from public.funding_files order by client_id, created_at desc) f
 where s.file_id is null and f.client_id = s.client_id;

create unique index if not exists funding_department_statuses_file_dept_uq
  on public.funding_department_statuses (file_id, department) where file_id is not null;

-- Organization branch on funding files (insert by admins/managers; update within reach).
create policy funding_files_org_insert on public.funding_files for insert to authenticated
  with check (exists (select 1 from public.funding_clients c
                where c.id = funding_files.client_id and c.organization_id is not null and c.outsourcing_group_id is null
                  and public.org_has_product(c.organization_id, 'fundingOps')
                  and public.is_org_admin(c.organization_id)
                  and funding_files.agency_id = c.agency_id));
create policy funding_files_org_update on public.funding_files for update to authenticated
  using (exists (select 1 from public.funding_clients c
            where c.id = funding_files.client_id and c.organization_id is not null and c.outsourcing_group_id is null
              and public.org_has_product(c.organization_id, 'fundingOps')
              and public.org_scope_allows(c.organization_id, c.assigned_agent_id)))
  with check (exists (select 1 from public.funding_clients c where c.id = funding_files.client_id));

/** Operational vocabulary per funding department — mirrored by fundingops-domain (step 3). */
create or replace function public.fundingops_department_statuses(p_department public.funding_department)
returns text[] language sql immutable as $$
  select case p_department
    when 'Readiness Review' then array['NOT STARTED','IN REVIEW','NEEDS CLIENT ACTION','COMPLETE']
    when 'Document Review'  then array['NOT STARTED','IN PROGRESS','OUTSTANDING','COMPLETE']
    when 'Lender Matching'  then array['NOT STARTED','IN PROGRESS','COMPLETE']
    when 'Submissions'      then array['NOT STARTED','IN PROGRESS','SUBMITTED','COMPLETE']
    when 'Stipulations'     then array['NOT STARTED','OUTSTANDING','SATISFIED']
    when 'Offers'           then array['NOT STARTED','OFFER RECEIVED','ACCEPTED','DECLINED']
    when 'Funded Deals'     then array['NOT STARTED','CLOSING','FUNDED']
  end
$$;

create or replace function public.set_funding_department_status(
  p_file uuid, p_department public.funding_department, p_status text, p_assignee uuid default null, p_note text default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  f        public.funding_files%rowtype;
  c        public.funding_clients%rowtype;
  v_prev   text;
  v_status text := upper(trim(p_status));
begin
  select * into f from public.funding_files where id = p_file;
  if f.id is null then raise exception 'Funding file not visible' using errcode = '42501'; end if;
  select * into c from public.funding_clients where id = f.client_id;
  if not (v_status = any (public.fundingops_department_statuses(p_department))) then
    raise exception 'Unknown status % for %', p_status, p_department using errcode = '22023';
  end if;
  select status into v_prev from public.funding_department_statuses where file_id = p_file and department = p_department;

  insert into public.funding_department_statuses (client_id, file_id, department, status, assignee_id)
  values (f.client_id, p_file, p_department, v_status, p_assignee)
  on conflict (file_id, department) where file_id is not null
  do update set status = excluded.status, assignee_id = excluded.assignee_id, updated_at = now();

  update public.funding_files set last_activity_at = now() where id = p_file;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (f.agency_id, c.organization_id, 'funding_file', p_file::text, auth.uid(),
          'Department status', coalesce(p_note, p_department::text || ' → ' || v_status), 'department:' || p_department::text, v_prev, v_status,
          case when public.is_staff_of(f.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(f.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $$;
revoke execute on function public.set_funding_department_status(uuid, public.funding_department, text, uuid, text) from public, anon;
grant execute on function public.set_funding_department_status(uuid, public.funding_department, text, uuid, text) to authenticated;
revoke execute on function public.fundingops_department_statuses(public.funding_department) from public, anon;
grant execute on function public.fundingops_department_statuses(public.funding_department) to authenticated;
