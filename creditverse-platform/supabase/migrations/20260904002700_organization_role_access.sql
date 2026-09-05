-- =============================================================================
-- Configurable organization role access (proposal: ARCHITECTURE_PROPOSAL_ROLE_ACCESS.md)
--
--   Product Entitlement → Organization Settings → Role/Permission → Team/Department → Assignment → User
--
-- The Permission layer becomes data. One row per (organization, role, product)
-- says which departments a role may work, which workspace views it sees,
-- whether it may log work (vs read), edit progress, or open the management
-- layer. No row = the platform default (default_role_access). Rows are written
-- only through set_/reset_organization_role_access(): organization owner/admin
-- or a BES manager, only for a product the organization is entitled to, only
-- with known departments and views, and never narrowing org_admin/org_manager.
--
-- This changes NO existing policy. Row visibility remains
--   entitlement → membership → scope → assignment → record.
-- A role-access row can only narrow what the interface offers on rows the
-- person already sees. It is never an authorization widening.
-- =============================================================================

create table public.organization_role_access (
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  role                   public.org_role not null,
  product                public.product_key not null,
  departments            text[] not null default '{}',
  views                  text[] not null default '{}',   -- '{}' = every view the organization shows
  can_log_work           boolean not null default true,
  can_edit_progress      boolean not null default false,
  can_access_management  boolean not null default false,
  updated_by             uuid references public.profiles(id) on delete set null,
  updated_at             timestamptz not null default now(),
  primary key (organization_id, role, product),
  constraint organization_role_access_product_chk check (product in ('creditOps', 'fundingOps'))
);
create trigger organization_role_access_updated_at before update on public.organization_role_access
  for each row execute function public.set_updated_at();

alter table public.organization_role_access enable row level security;
revoke all on public.organization_role_access from public, anon;
grant select on public.organization_role_access to authenticated;   -- writes go through the functions only

create policy organization_role_access_select on public.organization_role_access for select to authenticated
  using (
    public.is_org_member(organization_id)
    or public.is_manager_of(public.org_agency(organization_id))
  );

-- ---------------------------------------------------------------------------
-- The platform defaults. Mirrored by src/lib/fulfillment/role-access-defaults.ts;
-- the matrix asserts the two agree.
-- ---------------------------------------------------------------------------
create or replace function public.default_role_access(p_role public.org_role, p_product public.product_key)
returns table (departments text[], views text[], can_log_work boolean, can_edit_progress boolean, can_access_management boolean)
language sql immutable as $$
  select
    case
      when p_product = 'creditOps' then
        case p_role
          when 'org_admin' then array['Onboarding','Dispute','Support','Complaints','Bureau Calling']
          when 'org_manager' then array['Onboarding','Dispute','Support','Complaints','Bureau Calling']
          when 'credit_processor' then array['Dispute']
          when 'credit_qa' then array['Onboarding','Dispute','Support','Complaints','Bureau Calling']
          when 'credit_support' then array['Support']
          when 'credit_sales' then array['Onboarding']
          when 'credit_complaints' then array['Complaints']
          when 'credit_bureau_caller' then array['Bureau Calling']
          else '{}'::text[]
        end
      when p_product = 'fundingOps' then
        case p_role
          when 'org_admin' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'org_manager' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_admin' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_manager' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_processor' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_doc_reviewer' then array['Document Review']
          when 'funding_underwriter' then array['Readiness Review','Lender Matching']
          when 'funding_sales' then array['Offers','Funded Deals']
          when 'funding_support' then array['Stipulations']
          else '{}'::text[]
        end
      else '{}'::text[]
    end as departments,
    '{}'::text[] as views,
    -- QA reads; everyone else with departments logs work.
    (p_role <> 'credit_qa') as can_log_work,
    (p_role in ('org_admin','org_manager','funding_admin','funding_manager')) as can_edit_progress,
    (p_role in ('org_admin','org_manager','funding_admin','funding_manager')) as can_access_management
$$;

/** Workspace view ids per product — mirrored by the frontend view catalogues. */
create or replace function public.workspace_view_ids(p_product public.product_key)
returns text[] language sql immutable as $$
  select case p_product
    when 'creditOps' then array['dashboard','sops-logins','main-list','dispute-queue','onboarding-queue','support-queue','escalation-queue','complaints-queue','bureau-queue']
    when 'fundingOps' then array['dashboard','sops-logins','deal-list','readiness','documents','submissions','stipulations','offers','funded']
    else '{}'::text[] end
$$;

create or replace function public.set_organization_role_access(
  p_org uuid, p_role public.org_role, p_product public.product_key,
  p_departments text[], p_views text[],
  p_can_log_work boolean, p_can_edit_progress boolean, p_can_access_management boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agency  uuid;
  v_service public.fulfillment_service;
  v_before  jsonb;
  v_after   jsonb;
begin
  select agency_id into v_agency from public.organizations where id = p_org;
  if v_agency is null or not (public.is_manager_of(v_agency) or public.is_org_owner_admin(p_org)) then
    raise exception 'Not permitted to configure roles for this organization' using errcode = '42501';
  end if;
  if p_product not in ('creditOps', 'fundingOps') then
    raise exception 'Role access is configurable for CreditOps and FundingOps only' using errcode = '22023';
  end if;
  if not public.org_entitled(p_org, p_product::text) then
    raise exception 'This organization is not entitled to %', p_product using errcode = '42501';
  end if;
  if p_role in ('org_admin', 'org_manager') then
    raise exception 'Organization admins and managers always have full access to the organization''s own products' using errcode = '22023';
  end if;
  if (p_product = 'creditOps' and p_role::text not like 'credit\_%')
     or (p_product = 'fundingOps' and p_role::text not like 'funding\_%') then
    raise exception 'Role % does not belong to %', p_role, p_product using errcode = '22023';
  end if;
  v_service := case p_product when 'creditOps' then 'creditops'::public.fulfillment_service else 'fundingops'::public.fulfillment_service end;
  if exists (select 1 from unnest(coalesce(p_departments, '{}'::text[])) d
              where not exists (select 1 from public.production_departments pd where pd.service = v_service and pd.key = d)) then
    raise exception 'Unknown department for %', p_product using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_views, '{}'::text[])) v where not (v = any (public.workspace_view_ids(p_product)))) then
    raise exception 'Unknown workspace view for %', p_product using errcode = '22023';
  end if;

  select to_jsonb(r) into v_before from public.organization_role_access r
   where r.organization_id = p_org and r.role = p_role and r.product = p_product;

  insert into public.organization_role_access as r
    (organization_id, role, product, departments, views, can_log_work, can_edit_progress, can_access_management, updated_by)
  values (p_org, p_role, p_product, coalesce(p_departments, '{}'), coalesce(p_views, '{}'),
          coalesce(p_can_log_work, true), coalesce(p_can_edit_progress, false), coalesce(p_can_access_management, false), auth.uid())
  on conflict (organization_id, role, product) do update
    set departments = excluded.departments, views = excluded.views, can_log_work = excluded.can_log_work,
        can_edit_progress = excluded.can_edit_progress, can_access_management = excluded.can_access_management,
        updated_by = auth.uid()
  returning to_jsonb(r) into v_after;

  perform public.log_audit('organization.role_access_updated', 'organization_role_access',
                           p_org::text || ':' || p_role::text || ':' || p_product::text, p_org, v_before, v_after);
  return v_after;
end $$;

create or replace function public.reset_organization_role_access(p_org uuid, p_role public.org_role, p_product public.product_key)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
  v_before jsonb;
begin
  select agency_id into v_agency from public.organizations where id = p_org;
  if v_agency is null or not (public.is_manager_of(v_agency) or public.is_org_owner_admin(p_org)) then
    raise exception 'Not permitted to configure roles for this organization' using errcode = '42501';
  end if;
  delete from public.organization_role_access r
   where r.organization_id = p_org and r.role = p_role and r.product = p_product
  returning to_jsonb(r) into v_before;
  if v_before is not null then
    perform public.log_audit('organization.role_access_reset', 'organization_role_access',
                             p_org::text || ':' || p_role::text || ':' || p_product::text, p_org, v_before, null);
  end if;
end $$;

revoke execute on function public.default_role_access(public.org_role, public.product_key) from public, anon;
revoke execute on function public.workspace_view_ids(public.product_key) from public, anon;
revoke execute on function public.set_organization_role_access(uuid, public.org_role, public.product_key, text[], text[], boolean, boolean, boolean) from public, anon;
revoke execute on function public.reset_organization_role_access(uuid, public.org_role, public.product_key) from public, anon;
grant execute on function public.default_role_access(public.org_role, public.product_key) to authenticated;
grant execute on function public.workspace_view_ids(public.product_key) to authenticated;
grant execute on function public.set_organization_role_access(uuid, public.org_role, public.product_key, text[], text[], boolean, boolean, boolean) to authenticated;
grant execute on function public.reset_organization_role_access(uuid, public.org_role, public.product_key) to authenticated;
