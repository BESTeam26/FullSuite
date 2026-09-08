-- 0190 — BES gets its own channels. It never had any.
--
-- ---------------------------------------------------------------------------
-- NOT A REGRESSION — A GAP
--
-- Dee: "Why I lost my Communication where I can create multiple channels in my
-- agency view?" Nothing was removed. `channels.organization_id` is NOT NULL,
-- so a channel has always belonged to a CUSTOMER organization, and the
-- Channels entry lives in the organization nav group. In Agency HQ view it was
-- never there to lose.
--
-- Which is a real gap: BES's own team needs somewhere to talk — a dispute
-- channel, a CRM channel, one per partner — and the only thing standing in the
-- way was a NOT NULL.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE, AND THE ONE THING IT MUST NOT DO
--
-- Exactly one owner: an organization OR the agency, never both and never
-- neither — the same constraint `teams` and `fulfillment_clients` already use
-- for the same reason.
--
-- The thing it must not do is leak. An agency channel is BES-internal: no
-- organization member reaches it, whatever else is true of them. So the
-- visibility helper gains an agency branch that checks `is_staff_of` and
-- membership, and the ORGANIZATION branch is left exactly as it was — an
-- organization channel's rules do not change because a second kind now exists.
-- ---------------------------------------------------------------------------

alter table public.channels
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade;

alter table public.channels alter column organization_id drop not null;

alter table public.channels
  add constraint channels_one_owner
  check ((organization_id is null) <> (agency_id is null));

create index if not exists channels_agency_idx
  on public.channels (agency_id) where agency_id is not null and archived_at is null;

comment on column public.channels.agency_id is
  'Set for a BES-INTERNAL channel. Exactly one of agency_id / organization_id — an agency channel is never reachable by an organization member, whatever else is true of them.';

-- ── Who can see a channel ───────────────────────────────────────────────
create or replace function public.channel_visible(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         /* ── ORGANIZATION CHANNELS — unchanged, deliberately ──────────
            Their rules do not move because a second kind of channel now
            exists. */
         (
           c.organization_id is not null
           and (
             exists (
               select 1 from public.channel_members m
                where m.channel_id = c.id
                  and m.user_id = auth.uid()
                  and public.is_org_member(c.organization_id)
             )
             or public.channel_shared_with_bes(c.id)
           )
         )

         /* ── AGENCY CHANNELS — BES staff who are in them ──────────────
            Staff status alone is not access: being BES does not put you in
            every conversation. Membership decides, exactly as it does for an
            organization channel. An agency admin sees all of them, because
            somebody has to be able to find an abandoned one. */
         or (
           c.agency_id is not null
           and public.is_staff_of(c.agency_id)
           and (
             exists (
               select 1 from public.channel_members m
                where m.channel_id = c.id and m.user_id = auth.uid()
             )
             or public.is_admin_of(c.agency_id)
           )
         )
       )
  )
$function$;

-- ── Who can manage one ──────────────────────────────────────────────────
create or replace function public.channel_manager(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channel_members m
      join public.channels c on c.id = m.channel_id
     where m.channel_id = p_channel and m.user_id = auth.uid() and m.is_manager
       and (
         (c.organization_id is not null and public.is_org_member(c.organization_id))
         or (c.agency_id is not null and public.is_staff_of(c.agency_id))
       )
  )
  or exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         (c.organization_id is not null and public.is_org_admin(c.organization_id))
         or (c.agency_id is not null and public.is_admin_of(c.agency_id))
       )
  )
$function$;

-- ── Who can create one ──────────────────────────────────────────────────
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (organization_id is not null and public.is_org_member(organization_id))
      /* A manager and above opens a BES channel. An agent joins one; they do
         not create the company's communication structure. */
      or (agency_id is not null and public.is_manager_of(agency_id))
    )
  );

/* `entity_visible` already asks whether the channel itself is visible, so an
   agency channel's files and activity follow the same rule with no change. */
