-- Department-status activity for a funding file is recorded on the FUNDING
-- CLIENT record (the timeline people read), naming the file in the detail.
-- Same visibility rule, same atomicity as 0054.
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
  update public.funding_clients set last_activity_at = now() where id = f.client_id;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (f.agency_id, c.organization_id, 'funding_client', f.client_id::text, auth.uid(),
          'Department status', coalesce(p_note, f.purpose || ' · ' || p_department::text || ' → ' || v_status),
          'department:' || p_department::text || ':' || p_file::text, v_prev, v_status,
          case when public.is_staff_of(f.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(f.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $$;
