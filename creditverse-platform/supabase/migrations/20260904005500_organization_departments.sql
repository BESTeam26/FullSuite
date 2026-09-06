-- 0077 — Organization departments, and honest registry statuses
--
-- The Hub's People and Departments modules need a company structure that
-- belongs to the *organization*. The existing `departments` and `teams` tables
-- are the agency's own (agency_id), so they cannot answer "which department
-- does this member of Cedar Financial belong to?".
--
-- One canonical membership stays one row: a member's department is a column on
-- `org_memberships`, not a second membership table (rule 2).

create table public.organization_departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(name) between 1 and 60),
  description     text check (description is null or length(description) <= 300),
  lead_user_id    uuid references public.profiles(id) on delete set null,
  sort            integer not null default 100,
  archived_at     timestamptz,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index organization_departments_org_idx on public.organization_departments (organization_id, sort) where archived_at is null;
create trigger organization_departments_updated_at before update on public.organization_departments
  for each row execute function public.set_updated_at();

alter table public.organization_departments enable row level security;

create policy organization_departments_select on public.organization_departments for select to authenticated
  using (public.can_view_org(organization_id));

alter table public.org_memberships
  add column if not exists organization_department_id uuid references public.organization_departments(id) on delete set null,
  add column if not exists job_title text;

alter table public.org_memberships
  add constraint org_memberships_job_title_len check (job_title is null or length(job_title) <= 80);

create index if not exists org_memberships_department_idx on public.org_memberships (organization_department_id);

comment on column public.org_memberships.organization_department_id is 'Which of the organization''s own departments this member belongs to.';
comment on column public.org_memberships.job_title is 'The role title the organization gives this person; the platform role stays in `role`.';

-- ---------------------------------------------------------------------------
-- Writers: the organization's own structure, changed by its administrators.
-- ---------------------------------------------------------------------------
create or replace function public.save_organization_department(
  p_id uuid, p_org uuid, p_name text, p_description text, p_lead uuid, p_sort integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_row public.organization_departments;
  v_before jsonb;
begin
  if not public.member_can(p_org, 'team.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  -- A lead must be a member of this organization: never a name, never a guess.
  if p_lead is not null and not exists (
    select 1 from public.org_memberships m where m.organization_id = p_org and m.user_id = p_lead
  ) then
    raise exception 'the department lead must be a member of this organization' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.organization_departments (organization_id, name, description, lead_user_id, sort, created_by)
    values (p_org, p_name, nullif(p_description, ''), p_lead, coalesce(p_sort, 100), auth.uid())
    returning * into v_row;
  else
    select to_jsonb(d) into v_before from public.organization_departments d where d.id = p_id and d.organization_id = p_org;
    if v_before is null then
      raise exception 'department not found' using errcode = 'P0002';
    end if;
    update public.organization_departments
       set name = p_name, description = nullif(p_description, ''), lead_user_id = p_lead, sort = coalesce(p_sort, 100)
     where id = p_id
    returning * into v_row;
  end if;
  perform public.log_audit('organization_department.saved', 'organization_department', v_row.id::text, p_org, v_before, to_jsonb(v_row));
  return v_row.id;
end $$;
revoke all on function public.save_organization_department(uuid, uuid, text, text, uuid, integer) from public, anon;
grant execute on function public.save_organization_department(uuid, uuid, text, text, uuid, integer) to authenticated;

/* Archived, never deleted: history keeps pointing at the department a person
   was in (rule 11). Members are released from it in the same statement. */
create or replace function public.archive_organization_department(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.organization_departments;
begin
  select * into v_row from public.organization_departments where id = p_id and archived_at is null;
  if v_row.id is null then
    raise exception 'department not found' using errcode = 'P0002';
  end if;
  if not public.member_can(v_row.organization_id, 'team.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.organization_departments set archived_at = now() where id = p_id;
  update public.org_memberships set organization_department_id = null where organization_department_id = p_id;
  perform public.log_audit('organization_department.archived', 'organization_department', p_id::text, v_row.organization_id, to_jsonb(v_row), null);
end $$;
revoke all on function public.archive_organization_department(uuid) from public, anon;
grant execute on function public.archive_organization_department(uuid) to authenticated;

create or replace function public.set_member_department(p_membership uuid, p_department uuid, p_job_title text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_before jsonb;
begin
  select organization_id, to_jsonb(m) into v_org, v_before from public.org_memberships m where m.id = p_membership;
  if v_org is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if not public.member_can(v_org, 'team.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_department is not null and not exists (
    select 1 from public.organization_departments d
     where d.id = p_department and d.organization_id = v_org and d.archived_at is null
  ) then
    raise exception 'that department belongs to another organization' using errcode = '42501';
  end if;
  update public.org_memberships
     set organization_department_id = p_department,
         job_title = coalesce(nullif(p_job_title, ''), job_title)
   where id = p_membership;
  perform public.log_audit('org_membership.department_set', 'org_membership', p_membership::text, v_org,
                           v_before, jsonb_build_object('organization_department_id', p_department, 'job_title', p_job_title));
end $$;
revoke all on function public.set_member_department(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_department(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The company directory: one call for the People module. Only what a
-- colleague may see — no birth year, and a birthday only when its owner said
-- so (0073).
-- ---------------------------------------------------------------------------
create or replace function public.organization_directory(p_org uuid)
returns table (
  membership_id uuid, user_id uuid, name text, preferred_name text, email text,
  job_title text, platform_role public.org_role, department_id uuid, department_name text,
  phone text, avatar_path text, birth_month smallint, birth_day smallint, since timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)) as name,
         p.preferred_name, p.email::text,
         coalesce(m.job_title, p.title) as job_title,
         m.role, m.organization_department_id, d.name,
         p.phone, p.avatar_path,
         case when p.birthday_visible then p.birth_month end,
         case when p.birthday_visible then p.birth_day end,
         m.created_at
    from public.org_memberships m
    join public.profiles p on p.id = m.user_id
    left join public.organization_departments d on d.id = m.organization_department_id
   where m.organization_id = p_org
     and public.can_view_org(p_org)
   order by d.sort nulls last, d.name nulls last, coalesce(p.full_name, p.email::text)
$$;
revoke all on function public.organization_directory(uuid) from public, anon;
grant execute on function public.organization_directory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Registry corrections: say plainly what has a screen and what does not.
-- End of Day already exists for every person; the Hub module is the
-- company-wide view of it, which is not built. Files and the assistant page
-- are not built either. A module with no screen is 'planned', so it is never
-- offered as a toggle that does nothing (rule 12).
-- ---------------------------------------------------------------------------
update public.hub_modules set status = 'planned', backed_by = 'files + storage (company view planned)' where key = 'files';
update public.hub_modules set status = 'planned', backed_by = 'eod reports (company view planned)',
       description = 'Everyone''s daily summaries in one place.' where key = 'eod';
update public.hub_modules set status = 'planned', backed_by = 'ai gateway (company assistant page planned)' where key = 'assistant';
update public.hub_modules set backed_by = 'organization_departments + org_memberships' where key in ('people', 'departments');

revoke all on public.organization_departments from anon;
