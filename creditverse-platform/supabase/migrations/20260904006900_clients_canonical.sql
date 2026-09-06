-- 0091 — the Client becomes an organization asset. Step 1 of 5: the record.
--
-- Dee, 2026-09-05, confirmed 2026-09-06: "move client as org asset outside the
-- CreditOps and FundingOps as it will hold all clients info and logins and
-- documents; then CreditOps and FundingOps as the actual fulfilment engine
-- only." The shape is written up in ARCHITECTURE_PROPOSAL_CLIENT_RECORD.md.
--
-- This closes the gap rule 2 has carried since the start: the same person,
-- disputing and seeking funding, is two records today — two ids, two sets of
-- contact details, two document piles, and a funding portal login the credit
-- side cannot see. Change a phone number on one and the other is stale.
--
-- Step 1 creates the record and its authorization and nothing else. Nothing
-- reads it yet, nothing is backfilled yet, no engine column is dropped. Each
-- later step is separately reversible until the last.
--
-- ---------------------------------------------------------------------------
-- The identity rules are deliberately the engines' own, unchanged:
--   • exactly one of organization_id / outsourcing_group_id (model 2 vs model
--     3, rule 16), with the same generated partner_scope_id;
--   • one email per partner, the same unique index both engines carry — the
--     same person MAY appear under two different partners (they left one
--     company for another) and that stays allowed;
--   • the CN- public id comes from the same series, so nothing already printed
--     or spoken to a client becomes wrong.
-- ---------------------------------------------------------------------------

create type public.client_status as enum ('active', 'paused', 'archived');
create type public.client_provenance as enum ('saas_pulled', 'outsourcing_only', 'diy_converted', 'ghl');

create table public.clients (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  organization_id       uuid references public.organizations(id) on delete cascade,
  outsourcing_group_id  uuid references public.outsourcing_groups(id) on delete cascade,
  mode                  public.fulfillment_mode not null,

  public_id             text not null default public.gen_public_code('CN'),

  -- Identity. Split names, because a letter to a bureau needs the legal name
  -- and a greeting needs what they are actually called — the engines' single
  -- `name` column cannot do both.
  --
  -- `first_name` is nullable and `last_name` is not, because that is the truth
  -- of the data being migrated: the engines hold one `name` field, and a name
  -- with no space in it ("Cher", "Prince", a company trading as one word) has
  -- a surname and no given name as far as we can honestly tell. The backfill
  -- flags those for review rather than inventing a first name to fill a column.
  first_name            text check (first_name is null or length(trim(first_name)) > 0),
  last_name             text not null check (length(trim(last_name)) > 0),
  preferred_name        text check (preferred_name is null or length(preferred_name) <= 60),

  /** What every screen and letter shows. Derived, so it can never disagree. */
  full_name             text generated always as (
                          trim(coalesce(first_name, '') || ' ' || last_name)
                        ) stored,

  email                 citext not null,
  phone                 text check (phone is null or length(phone) <= 40),
  date_of_birth         date,

  address_line1         text,
  address_line2         text,
  city                  text,
  state                 text check (state is null or length(state) <= 2),
  postal_code           text check (postal_code is null or length(postal_code) <= 12),

  /**
   * ONE login for this person, serving the credit portal and the funding
   * portal alike. Today FundingOps carries its own `portal_user_id`; step 4
   * moves it here and the credit portal uses the same account rather than
   * inventing a second one.
   */
  portal_user_id        uuid references public.profiles(id) on delete set null,

  status                public.client_status not null default 'active',
  provenance            public.client_provenance not null,

  /**
   * Set by the backfill when two engine records might be the same person but
   * the evidence is only a name. Nothing is merged on a name (rule 4): a human
   * confirms or splits them. Dee, 2026-09-06: the person who imported resolves
   * it, not only an administrator.
   */
  needs_review          boolean not null default false,
  review_note           text,

  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  partner_scope_id      uuid generated always as (
                          coalesce(organization_id, outsourcing_group_id)
                        ) stored,

  constraint clients_mode_scope_ck check (
    (mode = 'saas_pulled'      and organization_id is not null and outsourcing_group_id is null) or
    (mode = 'outsourcing_only' and outsourcing_group_id is not null and organization_id is null)
  )
);

create unique index clients_one_email_per_partner
  on public.clients (partner_scope_id, lower(email::text));
create unique index clients_public_id_idx on public.clients (public_id);
create index clients_org_idx    on public.clients (organization_id) where organization_id is not null;
create index clients_group_idx  on public.clients (outsourcing_group_id) where outsourcing_group_id is not null;
create index clients_portal_idx on public.clients (portal_user_id) where portal_user_id is not null;
create index clients_review_idx on public.clients (partner_scope_id) where needs_review;

create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

comment on table public.clients is
  'The canonical person an organization serves. CreditOps and FundingOps hold the WORK on this person, not the person.';

-- ---------------------------------------------------------------------------
-- The CN- series is shared. A client, a credit case and a funding record for
-- the same human carry the same code, and no two different people ever do.
-- The existing assign_client_public_id() already checks both engine tables;
-- this adds the third, and the same immutability rule.
-- ---------------------------------------------------------------------------
create or replace function public.assign_canonical_client_public_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if tg_op = 'UPDATE' then
    if new.public_id is distinct from old.public_id then
      raise exception 'public_id is immutable' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.public_id is not null
     and not exists (select 1 from public.clients x where x.public_id = new.public_id and x.id <> new.id)
     and not exists (select 1 from public.fulfillment_clients where public_id = new.public_id)
     and not exists (select 1 from public.funding_clients where public_id = new.public_id)
  then return new; end if;
  loop
    v := public.gen_public_code('CN');
    exit when not exists (select 1 from public.clients where public_id = v)
          and not exists (select 1 from public.fulfillment_clients where public_id = v)
          and not exists (select 1 from public.funding_clients where public_id = v);
  end loop;
  new.public_id := v;
  return new;
end $$;
revoke all on function public.assign_canonical_client_public_id() from public, anon, authenticated;
create trigger clients_public_id before insert or update of public_id on public.clients
  for each row execute function public.assign_canonical_client_public_id();

-- ---------------------------------------------------------------------------
-- Authorization. No new permission system (rule 3) — the same chain, one
-- helper, phrased for a record that both engines share.
--
-- Reading a client is deliberately wider than reading a credit case: somebody
-- who only works funding must be able to see who the borrower is. What stays
-- behind its own key is the *work* — the dispute round, the letters, the
-- funding file — which is unchanged and lives on the engine tables.
-- ---------------------------------------------------------------------------
create or replace function public.client_visible(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
     where c.id = p_client
       and (
         -- The person themself.
         c.portal_user_id = auth.uid()
         -- A member of the organization that owns them.
         or (c.organization_id is not null and public.is_org_member(c.organization_id))
         -- BES staff, only through a live engagement and only within scope —
         -- staff status alone is never access (rule 16).
         or (
           (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
             or public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'fundingops'))
           and public.is_staff_of(c.agency_id)
         )
       )
  )
$$;
revoke all on function public.client_visible(uuid) from public, anon;
grant execute on function public.client_visible(uuid) to authenticated;

alter table public.clients enable row level security;

create policy clients_select on public.clients for select to authenticated
  using (public.client_visible(id));

/**
 * Who may write identity and contact details.
 *
 * Either engine's "edit" key qualifies, and that is deliberate: a
 * FundingOps-only organization has no CreditOps permission keys at all, so
 * asking for `creditops.clients.edit` alone would leave it unable to record a
 * borrower. The field being written is the same field either way — one phone
 * number, one address — which is the whole point of moving it here (rule 2).
 * What stays separate is the WORK: the dispute round and the funding file each
 * keep their own key, unchanged.
 */
create or replace function public.client_writable(p_org uuid, p_group uuid, p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (p_org is not null and (
       public.member_can(p_org, 'creditops.clients.edit')
       or public.member_can(p_org, 'fundingops.files.edit')))
    or (
      (public.bes_may_fulfil(p_org, p_group, 'creditops')
        or public.bes_may_fulfil(p_org, p_group, 'fundingops'))
      and public.is_staff_of(p_agency)
    )
$$;
revoke all on function public.client_writable(uuid, uuid, uuid) from public, anon;
grant execute on function public.client_writable(uuid, uuid, uuid) to authenticated;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.client_writable(organization_id, outsourcing_group_id, agency_id));

create policy clients_update on public.clients for update to authenticated
  using (public.client_writable(organization_id, outsourcing_group_id, agency_id))
  with check (public.client_writable(organization_id, outsourcing_group_id, agency_id));

/**
 * No delete policy, on purpose. A client is archived, never removed: their
 * disputes, letters, reports and funding files are the record of work that was
 * actually done for them (rules 10 and 11).
 */

revoke all on public.clients from anon;
grant select, insert, update on public.clients to authenticated;
