-- A partner reads only what is explicitly exposed (PARTNER_PORTAL_DOCTRINE,
-- Dee 2026-10-01: "internal-only fields stay internal; partner-visible
-- fields are explicitly exposed"). Found in the portal inventory the same
-- day: a partner contact could read the FULL outsourcing_groups and
-- partner_services rows through the REST API — notes, health, the account
-- manager, the team, the processor, the contract value — because the row
-- policies granted the row and a row has every column. And a partner
-- caller of channel_mentionable / channel_roster was handed BES staff
-- email addresses, roles and team names.
--
-- Nothing is duplicated. The partner's own profile comes from a function
-- that names its columns; services already came from my_partner_services.
begin;

-- ── 1. The partner's own profile: named columns, nothing else ───────────
drop policy if exists outsourcing_groups_partner_select on public.outsourcing_groups;

create or replace function public.my_partner_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  /* The billing group, so a suspended partner can still see who they are
     and reach Billing; everything internal about them stays out. */
  select jsonb_build_object(
           'id', g.id, 'name', g.name, 'legal_business_name', g.legal_business_name, 'dba_name', g.dba_name,
           'contact_email', g.contact_email, 'phone', g.phone, 'address', g.address,
           'address_street', g.address_street, 'address_city', g.address_city, 'address_state', g.address_state, 'address_zip', g.address_zip,
           'website', g.website, 'lifecycle', g.lifecycle::text, 'started_on', g.started_on, 'timezone', g.timezone,
           'portal_access_enabled', g.portal_access_enabled, 'onboarding_completed_at', g.onboarding_completed_at,
           'access_confirmed_at', g.access_confirmed_at, 'created_at', g.created_at)
    from public.outsourcing_groups g
   where g.id = public.partner_billing_group_of_user()
$$;
revoke all on function public.my_partner_profile() from public, anon;
grant execute on function public.my_partner_profile() to authenticated;
comment on function public.my_partner_profile() is
  'The signed-in partner contact''s own company, partner-visible columns only. The one way a partner reads outsourcing_groups; staff read the table under their own policy.';

-- ── 2. Services: the partner branch leaves the table policy ─────────────
-- Partners already read services through my_partner_services (definer,
-- partner-scoped, partner-visible columns). The direct branch returned the
-- processor, the team, internal notes and the contract value.
drop policy if exists partner_services_select on public.partner_services;
create policy partner_services_select on public.partner_services for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.view'));

-- ── 3. A suspended partner's contact may still read their own row ───────
-- is_partner_contact_of() ends at suspension, which locked a suspended
-- partner out of the whole portal — including the Billing page that exists
-- to resolve the suspension. Your own contact row is yours.
drop policy if exists partner_contacts_select on public.partner_contacts;
create policy partner_contacts_select on public.partner_contacts for select to authenticated
  using (public.is_staff_of(agency_id) or public.is_partner_contact_of(group_id) or user_id = auth.uid());

-- ── 4. Mentions and the roster, as a partner sees them ──────────────────
-- A partner contact is offered the people the conversation can reach — by
-- name, as "BES team" or "Partner contact" — never an email address, a
-- role, or a BES team to mention.
create or replace function public.channel_mentionable(p_channel uuid)
returns table (user_id text, name text, email text, hint text, aliases text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select exists (select 1 from public.partner_contacts pc
                    where pc.user_id = auth.uid() and pc.status = 'active') as is_partner
  )
  select 'channel'::text, '@everyone'::text, null::text,
         (select 'Notify everyone here · ' || count(*) || ' ' ||
                 case when count(*) = 1 then 'person' else 'people' end
            from public.mention_group_recipients(p_channel, 'channel')),
         array['@channel', '@all', 'channel', 'all']
   where public.channel_visible(p_channel)

  union all
  select 'team:' || t.id::text, '@' || t.name, null,
         'Notify the team · ' || (
           select count(*) from public.mention_group_recipients(p_channel, 'team:' || t.id::text)
         ) || ' here',
         array['team', t.name]
    from public.teams t
   where public.channel_visible(p_channel)
     and not (select is_partner from me)
     and t.archived_at is null
     and not t.is_fixture
     and exists (select 1 from public.mention_group_recipients(p_channel, 'team:' || t.id::text))

  union all
  select p.id::text,
         coalesce(nullif(trim(p.full_name), ''), case when (select is_partner from me) then 'BES team' else p.email end),
         case when (select is_partner from me) then null else p.email end,
         case
           when (select is_partner from me) then case when am.role is not null then 'BES team' else 'Partner contact' end
           when am.role is not null then replace(initcap(replace(am.role::text, 'agency_', '')), '_', ' ')
           when pc.id is not null then 'Partner contact'
         end,
         null::text[]
    from public.profiles p
    left join public.agency_memberships am on am.user_id = p.id and am.status = 'active'
    left join public.partner_contacts pc on pc.user_id = p.id and pc.status = 'active'
   where public.channel_visible(p_channel)
     and p.is_fixture = false
     and p.id <> auth.uid()
     and public.channel_notifiable(p_channel, p.id)
   limit 200
$$;

create or replace function public.channel_roster(p_channel uuid)
returns table (kind text, id text, name text, hint text, is_manager boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select exists (select 1 from public.partner_contacts pc
                    where pc.user_id = auth.uid() and pc.status = 'active') as is_partner
  )
  select 'team'::text, t.id::text, t.name,
         (select count(*)::text || ' on this team'
            from public.team_memberships tm where tm.team_id = t.id),
         false
    from public.channel_teams ct
    join public.teams t on t.id = ct.team_id
   where ct.channel_id = p_channel
     and t.archived_at is null
     and not (select is_partner from me)
     and public.channel_visible(p_channel)

  union all

  select 'person'::text, p.id::text,
         coalesce(nullif(trim(p.full_name), ''), case when (select is_partner from me) then 'BES team' else p.email end),
         case
           when (select is_partner from me) then case when am.role is not null then 'BES team' else 'Partner contact' end
           when am.role is not null then replace(initcap(replace(am.role::text, 'agency_', '')), '_', ' ')
           when pc.id is not null then 'Partner contact'
         end,
         exists (select 1 from public.channel_members m
                  where m.channel_id = p_channel and m.user_id = p.id and m.is_manager)
    from public.mention_group_recipients(p_channel, 'channel') r
    join public.profiles p on p.id = r.user_id
    left join public.agency_memberships am on am.user_id = p.id and am.status = 'active'
    left join public.partner_contacts pc on pc.user_id = p.id and pc.status = 'active'
   where public.channel_visible(p_channel) or public.channel_auditable(p_channel)
$$;

commit;
