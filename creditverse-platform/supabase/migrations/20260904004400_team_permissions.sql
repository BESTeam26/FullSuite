-- =============================================================================
-- 0064 — Team permissions (ARCHITECTURE_PROPOSAL_TEAM_PERMISSIONS.md §2):
-- permission keys as data, role defaults, per-member overrides, one evaluator,
-- Copy Permission, invitations that can be accepted.
--
-- Writers that touch member_permissions / org_memberships / invitations run
-- with definer rights and check authorization explicitly at the top (the same
-- shape as record_lender_decision, 0058.2): the API role holds no direct
-- write grant on member_permissions, so overrides can only be made through
-- these audited functions. Reads stay policy-gated.
--
--   member_can(org, key): member override → organization's role row →
--   platform default for the role → DENY. Admins/managers of the organization
--   are always allowed. Security-relevant keys are also checked by policies /
--   functions; the interface only reads the same answer.
-- =============================================================================

create table public.permission_keys (
  key                text primary key,                      -- module.action
  module             text not null,
  label              text not null,
  description        text,
  security_relevant  boolean not null default false,
  sort               integer not null default 0
);
create table public.role_permissions (
  organization_id  uuid references public.organizations(id) on delete cascade,   -- null = platform default
  role             public.org_role not null,
  key              text not null references public.permission_keys(key) on delete cascade,
  allowed          boolean not null,
  unique nulls not distinct (organization_id, role, key)
);
create table public.member_permissions (
  membership_id  uuid not null references public.org_memberships(id) on delete cascade,
  key            text not null references public.permission_keys(key) on delete cascade,
  allowed        boolean not null,
  set_by         uuid references public.profiles(id) on delete set null,
  set_at         timestamptz not null default now(),
  reason         text,
  primary key (membership_id, key)
);

insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('creditops.clients.view',        'CreditOps',       'View clients',                     null, false, 10),
  ('creditops.clients.edit',        'CreditOps',       'Add and edit clients',             null, true,  11),
  ('creditops.reports.import',      'CreditOps',       'Import credit reports',            null, true,  12),
  ('creditops.letters.build',       'CreditOps',       'Build dispute letters',            null, false, 13),
  ('creditops.letters.approve',     'CreditOps',       'Approve dispute letters',          'The QA gate; approval is a compliance act.', true, 14),
  ('creditops.letters.templates',   'CreditOps',       'Manage the Letter Library',        null, true,  15),
  ('fundingops.files.view',         'FundingOps',      'View funding files',               null, false, 20),
  ('fundingops.files.edit',         'FundingOps',      'Edit applications and move files', null, true,  21),
  ('fundingops.documents.review',   'FundingOps',      'Review documents (dispositions)',  null, true,  22),
  ('fundingops.submissions.create', 'FundingOps',      'Submit to lenders',                null, true,  23),
  ('fundingops.offers.manage',      'FundingOps',      'Record and present offers',        null, true,  24),
  ('fundingops.funding.confirm',    'FundingOps',      'Confirm funding',                  'Creates the funded deal.', true, 25),
  ('fundingops.lenders.manage',     'FundingOps',      'Manage lenders and policy versions', null, true, 26),
  ('fundingops.commissions.view',   'FundingOps',      'View commissions',                 null, true,  27),
  ('workspaces.manage',             'Custom Workspaces','Create and configure workspaces', null, true,  30),
  ('reports.view',                  'Reports',         'View reports',                     null, false, 40),
  ('reports.export',                'Reports',         'Export reports',                   null, true,  41),
  ('team.manage',                   'Team & Settings', 'Invite and manage team members',   null, true,  50),
  ('team.permissions',              'Team & Settings', 'Edit roles and permissions',       null, true,  51),
  ('settings.manage',               'Team & Settings', 'Edit organization settings',       null, true,  52),
  ('billing.view',                  'Billing',         'View plan and invoices',           null, true,  60),
  ('billing.manage',                'Billing',         'Change plan and payment',          null, true,  61);

-- Platform defaults per role: admins/managers everything (enforced in member_can, no rows needed);
-- credit roles their module; funding roles theirs; sales roles view-only; support roles no approvals.
insert into public.role_permissions (organization_id, role, key, allowed)
select null, r.role, k.key,
  case
    when r.role in ('credit_processor','credit_qa','credit_support','credit_complaints','credit_bureau_caller') then
      k.module = 'CreditOps' and (k.key <> 'creditops.letters.approve' or r.role = 'credit_qa') and k.key <> 'creditops.letters.templates'
    when r.role = 'credit_sales' then k.key in ('creditops.clients.view','creditops.clients.edit','reports.view')
    when r.role in ('funding_processor','funding_doc_reviewer','funding_support') then
      k.module = 'FundingOps' and k.key not in ('fundingops.funding.confirm','fundingops.lenders.manage','fundingops.commissions.view')
    when r.role = 'funding_underwriter' then k.module = 'FundingOps' and k.key not in ('fundingops.funding.confirm','fundingops.commissions.view')
    when r.role = 'funding_sales' then k.key in ('fundingops.files.view','fundingops.files.edit','fundingops.commissions.view','reports.view')
    when r.role in ('funding_admin','funding_manager') then k.module in ('FundingOps','Reports')
    else false
  end
from unnest(enum_range(null::public.org_role)) as r(role)
cross join public.permission_keys k
where r.role not in ('org_admin','org_manager');

create or replace function public.member_can(p_org uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_org is null then false
    when public.is_org_admin(p_org) then true
    else coalesce(
      (select mp.allowed from public.member_permissions mp join public.org_memberships m on m.id = mp.membership_id
        where m.user_id = auth.uid() and m.organization_id = p_org and mp.key = p_key),
      (select rp.allowed from public.role_permissions rp join public.org_memberships m on m.role = rp.role
        where m.user_id = auth.uid() and m.organization_id = p_org and rp.organization_id = p_org and rp.key = p_key),
      (select rp.allowed from public.role_permissions rp join public.org_memberships m on m.role = rp.role
        where m.user_id = auth.uid() and m.organization_id = p_org and rp.organization_id is null and rp.key = p_key),
      false)
  end
$$;
/** Every key for the caller in one call — the auth context bundles this once per session (rule 14). */
create or replace function public.my_permissions(p_org uuid)
returns table (key text, allowed boolean) language sql stable security definer set search_path = public as $$
  select k.key, public.member_can(p_org, k.key) from public.permission_keys k order by k.sort
$$;

/** Set or clear one override for a member; audited with previous and new value. */
create or replace function public.set_member_permission(p_membership uuid, p_key text, p_allowed boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m public.org_memberships%rowtype; v_prev boolean;
begin
  select * into m from public.org_memberships where id = p_membership;
  if m.id is null then raise exception 'Membership not found' using errcode = '42501'; end if;
  if not (public.is_org_owner_admin(m.organization_id) or public.is_manager_of(public.org_agency(m.organization_id))) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if m.user_id = auth.uid() then raise exception 'You cannot change your own permissions' using errcode = '42501'; end if;
  if not exists (select 1 from public.permission_keys where key = p_key) then raise exception 'Unknown permission %', p_key using errcode = '22023'; end if;
  select allowed into v_prev from public.member_permissions where membership_id = p_membership and key = p_key;
  if p_allowed is null then
    delete from public.member_permissions where membership_id = p_membership and key = p_key;
  else
    insert into public.member_permissions (membership_id, key, allowed, set_by, reason) values (p_membership, p_key, p_allowed, auth.uid(), p_reason)
    on conflict (membership_id, key) do update set allowed = excluded.allowed, set_by = auth.uid(), set_at = now(), reason = excluded.reason;
  end if;
  perform public.log_audit('organization.member_permission_set', 'org_membership', p_membership::text, m.organization_id,
          jsonb_build_object('key', p_key, 'allowed', v_prev), jsonb_build_object('key', p_key, 'allowed', p_allowed, 'reason', p_reason));
end $$;

/** Copy Permission: role and overrides from one member to another, audited; scope (assigned_only) is copied only when asked. */
create or replace function public.copy_member_permissions(p_from uuid, p_to uuid, p_copy_scope boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare a public.org_memberships%rowtype; b public.org_memberships%rowtype;
begin
  select * into a from public.org_memberships where id = p_from;
  select * into b from public.org_memberships where id = p_to;
  if a.id is null or b.id is null or a.organization_id <> b.organization_id then raise exception 'Both members must be visible and in the same organization' using errcode = '42501'; end if;
  if not (public.is_org_owner_admin(b.organization_id) or public.is_manager_of(public.org_agency(b.organization_id))) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if b.user_id = auth.uid() then raise exception 'You cannot change your own permissions' using errcode = '42501'; end if;
  update public.org_memberships set role = a.role, assigned_only = case when p_copy_scope then a.assigned_only else assigned_only end where id = p_to;
  delete from public.member_permissions where membership_id = p_to;
  insert into public.member_permissions (membership_id, key, allowed, set_by, reason)
  select p_to, key, allowed, auth.uid(), 'copied from another member' from public.member_permissions where membership_id = p_from;
  perform public.log_audit('organization.member_permissions_copied', 'org_membership', p_to::text, b.organization_id,
          jsonb_build_object('role', b.role), jsonb_build_object('role', a.role, 'from', p_from, 'scope_copied', p_copy_scope));
end $$;

/** Invite: one open invitation per email per organization; seats are counted by the interface against the plan. */
create or replace function public.invite_team_member(p_org uuid, p_email citext, p_role public.org_role, p_assigned_only boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.is_org_owner_admin(p_org) or public.is_manager_of(public.org_agency(p_org))) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if exists (select 1 from public.invitations where organization_id = p_org and email = p_email and accepted_at is null and expires_at > now()) then
    raise exception 'An invitation for this email is already open' using errcode = '23505';
  end if;
  insert into public.invitations (email, kind, organization_id, org_role, invited_by, agency_id)
  values (p_email, 'organization', p_org, p_role, auth.uid(), public.org_agency(p_org)) returning id into v_id;
  perform public.log_audit('organization.member_invited', 'invitation', v_id::text, p_org, null,
          jsonb_build_object('email', p_email, 'role', p_role, 'assigned_only', p_assigned_only));
  return v_id;
end $$;

/** Accept: the caller's own email must match; creates the membership and stamps the invitation. */
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.invitations%rowtype; v_email citext; v_id uuid;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into i from public.invitations where token = p_token;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then raise exception 'This invitation is not open' using errcode = '22023'; end if;
  if i.email <> v_email then raise exception 'This invitation was sent to a different email address' using errcode = '42501'; end if;
  if i.kind <> 'organization' then raise exception 'Only organization invitations are accepted here' using errcode = '22023'; end if;
  insert into public.org_memberships (user_id, organization_id, role, assigned_only)
  values (auth.uid(), i.organization_id, i.org_role, true)
  on conflict (user_id, organization_id) do update set role = excluded.role
  returning id into v_id;
  update public.invitations set accepted_at = now() where id = i.id;
  perform public.log_audit('organization.invitation_accepted', 'org_membership', v_id::text, i.organization_id, null,
          jsonb_build_object('role', i.org_role));
  return v_id;
end $$;

alter table public.permission_keys    enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.member_permissions enable row level security;
revoke all on public.permission_keys, public.role_permissions, public.member_permissions from public, anon;
grant select on public.permission_keys, public.role_permissions, public.member_permissions to authenticated;
grant insert, update, delete on public.role_permissions to authenticated;
create policy permission_keys_select on public.permission_keys for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (organization_id is null or public.is_org_member(organization_id) or public.is_agency_staff());
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (organization_id is not null and (public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id))))
  with check (organization_id is not null and (public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id))));
create policy member_permissions_select on public.member_permissions for select to authenticated
  using (exists (select 1 from public.org_memberships m where m.id = membership_id and (m.user_id = auth.uid() or public.is_org_member(m.organization_id) or public.is_agency_staff())));

revoke execute on function public.member_can(uuid, text), public.my_permissions(uuid), public.set_member_permission(uuid, text, boolean, text),
  public.copy_member_permissions(uuid, uuid, boolean), public.invite_team_member(uuid, citext, public.org_role, boolean), public.accept_invitation(uuid) from public, anon;
grant execute on function public.member_can(uuid, text), public.my_permissions(uuid), public.set_member_permission(uuid, text, boolean, text),
  public.copy_member_permissions(uuid, uuid, boolean), public.invite_team_member(uuid, citext, public.org_role, boolean), public.accept_invitation(uuid) to authenticated;
