-- ── The partner record ───────────────────────────────────────────────────
alter table public.outsourcing_groups
  /* Company name is OPTIONAL. `name` (what we call them) plus a contact email
     are the whole requirement; a sole trader has no company name to give. */
  alter column partner_name drop not null,
  add column if not exists phone           text,
  add column if not exists address         text,
  add column if not exists notes           text,
  add column if not exists primary_contact text,
  add column if not exists service         text,
  add column if not exists archived_at     timestamptz,
  add column if not exists created_by      uuid references public.profiles(id) on delete set null;

comment on column public.outsourcing_groups.partner_name is
  'The partner''s company name, when they have one. Optional: name and contact email are the only requirements.';
comment on column public.outsourcing_groups.archived_at is
  'Archived partners drop out of active views and keep every record they ever had. Nothing about them is deleted.';

-- ── People at a partner, and their portal access ─────────────────────────
create table public.partner_contacts (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.outsourcing_groups(id) on delete cascade,
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  full_name    text not null check (length(trim(full_name)) between 1 and 120),
  email        citext not null,
  phone        text,
  is_primary   boolean not null default false,
  /** Set once they activate. Until then the contact exists and cannot sign in. */
  user_id      uuid references public.profiles(id) on delete set null,
  status       text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  invited_at   timestamptz,
  activated_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (group_id, email)
);
create index partner_contacts_group_idx on public.partner_contacts (group_id) where status <> 'archived';
create unique index partner_contacts_user_idx on public.partner_contacts (user_id) where user_id is not null;
create trigger partner_contacts_updated_at before update on public.partner_contacts
  for each row execute function public.set_updated_at();

comment on table public.partner_contacts is
  'A person at a BES Partner. This row IS their portal boundary — no organization, no tenant, no entitlement surface. They see their own partner and nothing else.';

-- ── Which partner is the caller? ─────────────────────────────────────────
--
-- SECURITY DEFINER so a partner can resolve their own group without being able
-- to read the contacts table at large. A suspended or archived contact resolves
-- to nothing, which is what removes their access everywhere at once rather than
-- in each screen separately.
create or replace function public.partner_group_of_user()
returns uuid language sql stable security definer set search_path = public as $$
  select c.group_id
    from public.partner_contacts c
    join public.outsourcing_groups g on g.id = c.group_id
   where c.user_id = auth.uid()
     and c.status = 'active'
     and g.status <> 'Suspended'
     and g.archived_at is null
   limit 1
$$;
revoke execute on function public.partner_group_of_user() from public, anon;
grant execute on function public.partner_group_of_user() to authenticated;

create or replace function public.is_partner_contact_of(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_group is not null and p_group = public.partner_group_of_user()
$$;
revoke execute on function public.is_partner_contact_of(uuid) from public, anon;
grant execute on function public.is_partner_contact_of(uuid) to authenticated;

comment on function public.partner_group_of_user() is
  'The partner the caller belongs to, or NULL. Returns nothing for a suspended contact or a suspended/archived partner, so access ends in one place rather than screen by screen.';

-- ── Who may see a partner ────────────────────────────────────────────────
alter table public.partner_contacts enable row level security;
revoke all on public.partner_contacts from public, anon;
grant select, insert, update on public.partner_contacts to authenticated;

/* Agency staff manage contacts. A partner contact may read the people at their
   own partner and nothing else — deliberately not update: changing who has
   access to a partner is BES's decision, not the partner's. */
create policy partner_contacts_select on public.partner_contacts for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_partner_contact_of(group_id));
create policy partner_contacts_insert on public.partner_contacts for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.is_agency_manager_or_above());
create policy partner_contacts_update on public.partner_contacts for update to authenticated
  using (public.is_staff_of(agency_id) and public.is_agency_manager_or_above())
  with check (public.is_staff_of(agency_id) and public.is_agency_manager_or_above());
-- No delete policy: a contact who has ever signed in is history (rule 11).

/* The partner record itself. Whatever the existing policies allow BES staff
   stays exactly as it was; this only adds the partner's view of themselves. */
drop policy if exists outsourcing_groups_partner_select on public.outsourcing_groups;
create policy outsourcing_groups_partner_select on public.outsourcing_groups for select to authenticated
  using (public.is_partner_contact_of(id));

-- ── Invitations can now name a partner ───────────────────────────────────
alter table public.invitations
  add column if not exists partner_group_id uuid references public.outsourcing_groups(id) on delete cascade,
  add column if not exists partner_contact_id uuid references public.partner_contacts(id) on delete cascade;

/* The existing CHECK covers agency / organization / external. A partner
   invitation is a fourth shape and needs its own, added separately so the
   original constraint keeps meaning what it meant. */
alter table public.invitations
  add constraint invitations_partner_ck check (
    partner_group_id is null or (kind = 'external' and partner_contact_id is not null)
  );

comment on column public.invitations.partner_group_id is
  'Set for a BES Partner portal invitation. The partner is the boundary — no organization is involved, and none is created.';

-- ── What a partner may see of the work ───────────────────────────────────
--
-- Only what BES explicitly marked shared. Association is not publication
-- (rule 16): a file or a note touching a partner's engagement does not become
-- theirs to read because it mentions them.
drop policy if exists files_partner_select on public.files;
create policy files_partner_select on public.files for select to authenticated
  using (
    entity_type = 'partner'
    and entity_id = public.partner_group_of_user()::text
  );

drop policy if exists activity_partner_select on public.activity_events;
create policy activity_partner_select on public.activity_events for select to authenticated
  using (
    entity_type = 'partner'
    and entity_id = public.partner_group_of_user()::text
    and visibility = 'shared_with_partner'
  );
