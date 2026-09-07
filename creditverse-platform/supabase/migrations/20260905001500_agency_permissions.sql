-- 0156 — the same permission engine, applied to the agency side.
--
-- ---------------------------------------------------------------------------
-- WHY NEW TABLES AND NOT THE EXISTING ONES
--
-- The canonical engine is already exactly the shape Dee asked for: a
-- catalogue (`permission_keys`), role defaults (`role_permissions`), per-user
-- overrides (`member_permissions`), and a resolver (`member_can`) whose
-- precedence is override → role default → global default → deny.
--
-- It cannot be reused column-for-column, and the reason is physical rather
-- than a preference: `role_permissions.role` is typed `org_role`, which has no
-- agency values in it, and `member_permissions.membership_id` references
-- `org_memberships`. An agency role and an agency membership cannot go in
-- either column.
--
-- So the CATALOGUE is shared — one list of capabilities for the whole
-- platform — and the two thin tables that key on tenancy are mirrored. Same
-- semantics, same precedence, one more resolver. Not a second engine: a second
-- tenancy through the same one.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PROTECTS
--
-- A manager runs partner operations. They do not see what BES charges that
-- partner unless somebody decides they should. That is the whole point, and it
-- is why the financial capability is a permission and not a role: two managers
-- can differ, and an owner can change their mind on Tuesday.
-- ---------------------------------------------------------------------------

-- ── Capabilities this release introduces ────────────────────────────────
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('partners.view',            'Partners', 'View partners',              'See the BES Partner list and profiles.', false, 100),
  ('partners.create',          'Partners', 'Create partners',            'Add a new BES Partner.', false, 101),
  ('partners.edit',            'Partners', 'Edit partner details',       'Change a partner''s overview and operational information.', false, 102),
  ('partners.archive',         'Partners', 'Archive or restore partners','Move a partner out of active views, and back.', true, 103),
  ('partners.contacts',        'Partners', 'Manage partner contacts',    'Add and change the people at a partner.', false, 104),
  ('partners.portal',          'Partners', 'Manage portal access',       'Invite, suspend and restore partner portal access.', true, 105),
  ('partners.clients',         'Partners', 'Manage partner clients',     'Add and manage a partner''s own end clients.', false, 106),
  ('partners.operations',      'Partners', 'Manage partner operations',  'CRM, mailing, SOP, channels and assignments.', false, 107),
  ('partners.assignments',     'Partners', 'Assign partner team',        'Set the processor, account manager and team.', false, 108),
  ('partners.files.view',      'Partners', 'View partner files',         'Open documents filed against a partner.', false, 109),
  ('partners.files.upload',    'Partners', 'Upload partner files',       'Add documents to a partner.', false, 110),
  /* The financial group. Everything a manager does NOT get by being a manager. */
  ('partners.financials.view', 'Partner finance', 'View partner financials', 'Rates, payment terms, expected and actual revenue.', true, 120),
  ('partners.financials.edit', 'Partner finance', 'Edit billing terms',      'Change what a partner is charged and how.', true, 121),
  ('partners.revenue.record',  'Partner finance', 'Record revenue',          'Enter expected and actual monthly collection.', true, 122)
on conflict (key) do nothing;

-- ── Role defaults, and per-user overrides, for agency memberships ───────
create table public.agency_role_permissions (
  agency_id uuid references public.agencies(id) on delete cascade,
  role      public.agency_role not null,
  key       text not null references public.permission_keys(key) on delete cascade,
  allowed   boolean not null,
  /* Null agency = the platform-wide default for that role. An agency row
     overrides it, exactly as `role_permissions` already works for orgs. */
  unique nulls not distinct (agency_id, role, key)
);

create table public.agency_member_permissions (
  membership_id uuid not null references public.agency_memberships(id) on delete cascade,
  key           text not null references public.permission_keys(key) on delete cascade,
  allowed       boolean not null,
  set_by        uuid references public.profiles(id) on delete set null,
  set_at        timestamptz not null default now(),
  reason        text,
  primary key (membership_id, key)
);

comment on table public.agency_member_permissions is
  'One person''s deliberate exception to their role''s defaults. `allowed = false` is an explicit DENY and beats the role default, which is what makes "this manager, not that one" possible.';

-- ── The presets ─────────────────────────────────────────────────────────
--
-- Owner and admin are not listed: `agency_can` answers true for them before it
-- reaches a table, the same way `member_can` short-circuits for an org admin.
-- Listing them would create a second place the rule lives.
insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  -- Manager: runs operations, and cannot see the money.
  (null, 'agency_manager', 'partners.view',            true),
  (null, 'agency_manager', 'partners.create',          true),
  (null, 'agency_manager', 'partners.edit',            true),
  (null, 'agency_manager', 'partners.contacts',        true),
  (null, 'agency_manager', 'partners.clients',         true),
  (null, 'agency_manager', 'partners.operations',      true),
  (null, 'agency_manager', 'partners.assignments',     true),
  (null, 'agency_manager', 'partners.files.view',      true),
  (null, 'agency_manager', 'partners.files.upload',    true),
  (null, 'agency_manager', 'partners.portal',          true),
  (null, 'agency_manager', 'partners.archive',         false),
  (null, 'agency_manager', 'partners.financials.view', false),
  (null, 'agency_manager', 'partners.financials.edit', false),
  (null, 'agency_manager', 'partners.revenue.record',  false),
  (null, 'agency_manager', 'reports.view',             true),
  -- Team lead: sees partners, changes little.
  (null, 'agency_team_lead', 'partners.view',            true),
  (null, 'agency_team_lead', 'partners.contacts',        true),
  (null, 'agency_team_lead', 'partners.clients',         true),
  (null, 'agency_team_lead', 'partners.files.view',      true),
  (null, 'agency_team_lead', 'partners.financials.view', false),
  -- Agent: their own work. Not the account.
  (null, 'agency_agent', 'partners.view',            false),
  (null, 'agency_agent', 'partners.financials.view', false)
on conflict do nothing;

-- ── The resolver ────────────────────────────────────────────────────────
--
-- Precedence, deliberately the same as `member_can` so there is one rule to
-- learn:
--
--   suspended / not a member   → deny (no membership row, nothing matches)
--   owner or admin             → allow
--   explicit per-user row      → whatever it says, INCLUDING false
--   agency's own role default  → next
--   platform role default      → next
--   nothing matched            → deny
create or replace function public.agency_can(p_key text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce((
    select case
      /* Owner and admin hold every ordinary agency capability. Owner-only
         controls are enforced where they live, not here. */
      when m.role in ('agency_owner', 'agency_admin') then true
      else coalesce(
        (select amp.allowed from public.agency_member_permissions amp
          where amp.membership_id = m.id and amp.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id = m.agency_id and arp.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id is null and arp.key = p_key),
        false)
    end
    from public.agency_memberships m
   where m.user_id = auth.uid()
   limit 1
  ), false)
$function$;
revoke execute on function public.agency_can(text) from public, anon;
grant execute on function public.agency_can(text) to authenticated;

comment on function public.agency_can(text) is
  'May the caller do this in BES Agency HQ? Owner and admin always; everyone else by explicit override, then agency role default, then platform role default, then no.';

-- ── Reading and setting them ────────────────────────────────────────────
alter table public.agency_role_permissions   enable row level security;
alter table public.agency_member_permissions enable row level security;
revoke all on public.agency_role_permissions, public.agency_member_permissions from public, anon;
grant select on public.agency_role_permissions to authenticated;
grant select on public.agency_member_permissions to authenticated;

create policy agency_role_permissions_select on public.agency_role_permissions for select to authenticated
  using (public.is_agency_staff());

/* Everyone may read their OWN permissions — a screen has to know what to
   render. Only an admin sees somebody else's. */
create policy agency_member_permissions_select on public.agency_member_permissions for select to authenticated
  using (exists (
    select 1 from public.agency_memberships m
     where m.id = agency_member_permissions.membership_id
       and (m.user_id = auth.uid() or public.is_admin_of(m.agency_id))));

/* No insert or update grant: changes go through the writer below, which is
   where the authorization and the audit trail live together. */
create or replace function public.set_agency_permission(
  p_membership uuid, p_key text, p_allowed boolean, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_role public.agency_role;
begin
  select agency_id, role into v_agency, v_role
    from public.agency_memberships where id = p_membership;
  if v_agency is null then
    raise exception 'No such membership' using errcode = '22023';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator may change access' using errcode = '42501';
  end if;
  if not exists (select 1 from public.permission_keys where key = p_key) then
    raise exception 'Unknown permission' using errcode = '22023';
  end if;
  /* An owner's or admin's access is their role, not a row. Letting somebody
     write overrides for them would create a row that `agency_can` ignores —
     a switch that appears to do something and does not. */
  if v_role in ('agency_owner', 'agency_admin') then
    raise exception 'An owner or administrator already holds every capability; change their role instead'
      using errcode = '22023';
  end if;

  insert into public.agency_member_permissions (membership_id, key, allowed, set_by, reason)
  values (p_membership, p_key, p_allowed, auth.uid(), p_reason)
  on conflict (membership_id, key) do update
    set allowed = excluded.allowed, set_by = excluded.set_by,
        set_at = now(), reason = excluded.reason;

  perform public.log_audit('agency_permission.set', 'agency_membership', p_membership::text,
                           null, p_allowed::text,
                           jsonb_build_object('key', p_key, 'reason', p_reason));
end $function$;
revoke execute on function public.set_agency_permission(uuid, text, boolean, text) from public, anon;
grant execute on function public.set_agency_permission(uuid, text, boolean, text) to authenticated;

/** Clear an override so the person falls back to their role's default. */
create or replace function public.clear_agency_permission(p_membership uuid, p_key text)
returns void language plpgsql security definer set search_path = public as $function$
declare v_agency uuid;
begin
  select agency_id into v_agency from public.agency_memberships where id = p_membership;
  if v_agency is null or not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator may change access' using errcode = '42501';
  end if;
  delete from public.agency_member_permissions where membership_id = p_membership and key = p_key;
  perform public.log_audit('agency_permission.cleared', 'agency_membership', p_membership::text,
                           null, null, jsonb_build_object('key', p_key));
end $function$;
revoke execute on function public.clear_agency_permission(uuid, text) from public, anon;
grant execute on function public.clear_agency_permission(uuid, text) to authenticated;
