-- 0192 — Communication: access follows the canonical assignments, nothing else.
--
-- ---------------------------------------------------------------------------
-- WHAT DEE ASKED FOR, AND WHY THE OLD RULE DID NOT SATISFY IT
--
-- "Do not grant every Agency employee every Agency channel simply because they
--  are BES staff." (§6)
-- "SHARED WITH BES does NOT mean VISIBLE TO EVERY BES EMPLOYEE." (§10)
-- "Channel visibility must integrate with the same authorization architecture
--  used elsewhere... Do NOT create a separate loose chat permission model." (§7)
--
-- Where 0190/0191 fell short:
--
--   PARTNER channels were visible to ANY agent who could see the partner. So a
--   GHL implementer assigned to a partner's BES CRM work could read that
--   partner's CreditOps processing conversation. §19 says they must not.
--
--   AGENCY channels were `member OR is_admin_of`. An administrator was
--   silently a participant in every internal conversation. §17 says system
--   administration and conversation participation are different things and
--   must be labelled differently.
--
--   MEMBERSHIP could only name a PERSON. §12 requires a TEAM to be a member,
--   so that joining and leaving the team is the only thing anybody edits —
--   the same rule `partner_assignments` already follows.
--
-- ---------------------------------------------------------------------------
-- THE MODEL, IN FOUR PIECES
--
--   channel_member_of()   direct membership, OR membership of a team that is
--                         a member. One question, asked the same way for all
--                         three owner kinds.
--
--   open_to_scope         a DELIBERATE all-hands channel: everybody whose
--                         canonical scope already reaches the owner. False by
--                         default, because "everyone" as a side effect of an
--                         empty member list is exactly the shortcut §15 says
--                         not to take.
--
--   partner_service_id    §19. A conversation about ONE service engagement.
--                         Visible to whoever is assigned to the partner for
--                         that service, or to the account as a whole — never
--                         to somebody assigned only to a different service.
--
--   channel_auditable()   §17. An administrator may INSPECT; that is not the
--                         same as being in the conversation, and the interface
--                         must not present it as if it were. Writing still
--                         asks `channel_visible`, so an administrator cannot
--                         post into a conversation they were never part of.
--                         Direct messages are excluded entirely.
--
-- Nothing here is a new permission system. Every branch resolves to helpers
-- that already decide who sees a partner, an organization or a team.
-- ---------------------------------------------------------------------------

-- ── §33: a deactivated member loses access the moment they are deactivated ──
--
-- Found while implementing §33 and fixed here because it is not a
-- Communication bug — it is an authorization bug that Communication happened
-- to ask about first.
--
-- 0169 gave `agency_memberships` a `status`, and `set_agency_member_status()`
-- writes it. But `is_staff_of`, `is_manager_of` and `is_admin_of` — the three
-- functions every agency policy in the database ultimately calls — never read
-- it. A deactivated member kept every ounce of their access: work, clients,
-- partners, finance, everything. Deactivating somebody did nothing at all.
--
-- All nine live memberships are active, so nobody loses anything today. What
-- changes is that deactivating somebody now means something.
create or replace function public.is_staff_of(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
     where user_id = auth.uid() and agency_id = p_agency and status = 'active'
  )
$function$;

create or replace function public.is_manager_of(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
     where user_id = auth.uid() and agency_id = p_agency and status = 'active'
       and role in ('agency_owner', 'agency_admin', 'agency_manager')
  )
$function$;

create or replace function public.is_admin_of(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
     where user_id = auth.uid() and agency_id = p_agency and status = 'active'
       and role in ('agency_owner', 'agency_admin')
  )
$function$;

comment on function public.is_staff_of(uuid) is
  'Active membership of this agency. `status` is read here rather than in each policy, so deactivating somebody removes their access everywhere at once instead of everywhere somebody remembered (0192, Dee §33).';

-- ── A TEAM can be a member of a conversation (§12) ──────────────────────
--
-- Its own table rather than a nullable column on `channel_members`, whose
-- primary key is (channel_id, user_id) and whose read state is per person. A
-- team does not have a last-read time.
create table public.channel_teams (
  channel_id uuid not null references public.channels(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  added_at   timestamptz not null default now(),
  primary key (channel_id, team_id)
);
create index channel_teams_team_idx on public.channel_teams (team_id);

comment on table public.channel_teams is
  'A team in a conversation. Joining the team grants it and leaving takes it away, with no per-channel cleanup — the same inheritance `partner_assignments` uses (Dee, §12, §32).';

-- ── Two new facts about a channel ───────────────────────────────────────
alter table public.channels
  add column if not exists open_to_scope boolean not null default false,
  add column if not exists partner_service_id uuid references public.partner_services(id) on delete set null;

comment on column public.channels.open_to_scope is
  'A DELIBERATE all-hands conversation: everybody whose canonical scope already reaches its owner. False by default — "everybody" must be chosen, never inherited from an empty member list (Dee, §15).';
comment on column public.channels.partner_service_id is
  'Scopes a partner conversation to ONE service engagement. The CreditOps processing channel is not the GHL implementation channel, and the teams working them are not the same people (Dee, §19).';

create index channels_partner_service_idx on public.channels (partner_service_id)
  where partner_service_id is not null;

/* Existing rows keep the behaviour they had this morning. Partner channels
   were visible to every assigned agent, so they become open_to_scope; agency
   and organization channels already required membership, so they stay. A
   migration that quietly narrows live access is a migration that breaks
   somebody's Monday. */
update public.channels set open_to_scope = true
 where partner_group_id is not null and open_to_scope = false;

/* A service-scoped conversation must belong to the partner it scopes. */
alter table public.channels drop constraint if exists channels_service_belongs_to_partner;
alter table public.channels
  add constraint channels_service_belongs_to_partner check (
    partner_service_id is null or partner_group_id is not null
  );

-- ── Membership, asked once ──────────────────────────────────────────────
create or replace function public.channel_member_of(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channel_members m
     where m.channel_id = p_channel and m.user_id = auth.uid()
  )
  or exists (
    select 1
      from public.channel_teams ct
      join public.team_memberships tm on tm.team_id = ct.team_id
      join public.teams t on t.id = ct.team_id
     where ct.channel_id = p_channel
       and tm.user_id = auth.uid()
       and t.archived_at is null
  )
$function$;
revoke execute on function public.channel_member_of(uuid) from public, anon;
grant execute on function public.channel_member_of(uuid) to authenticated;

-- ── Service scope (§19) ─────────────────────────────────────────────────
--
-- Unscoped channels pass, because "do not force every Partner channel to be
-- service-specific" — some conversations are about the whole account.
create or replace function public.channel_service_ok(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select not exists (
    select 1 from public.channels c
     where c.id = p_channel and c.partner_service_id is not null
  )
  or exists (
    select 1
      from public.channels c
      join public.outsourcing_groups g on g.id = c.partner_group_id
     where c.id = p_channel
       and (
         public.is_admin_of(g.agency_id)
         or exists (
           select 1 from public.partner_assignments a
            where a.group_id = c.partner_group_id
              and a.ended_on is null
              /* Assigned to the whole account, or to THIS service. Somebody
                 running the account reads every conversation on it; somebody
                 brought in for one engagement reads that engagement's. */
              and (a.service_id is null or a.service_id = c.partner_service_id)
              and (
                a.user_id = auth.uid()
                or (a.team_id is not null and exists (
                      select 1 from public.team_memberships tm
                        join public.teams t on t.id = tm.team_id
                       where tm.team_id = a.team_id and tm.user_id = auth.uid()
                         and t.archived_at is null))
              )
         )
       )
  )
$function$;
revoke execute on function public.channel_service_ok(uuid) from public, anon;
grant execute on function public.channel_service_ok(uuid) to authenticated;

-- ── Who is IN the conversation ──────────────────────────────────────────
create or replace function public.channel_visible(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         /* ── ORGANIZATION-owned. Their isolation is untouched (§35). ──
            Their own people need channel membership; organization membership
            alone was never enough. BES reaches it ONLY through a live share,
            and even then only in scope — and if BES has narrowed it further
            with teams, only those teams (§10). Narrowing only: a team row
            here can never widen what the share already permits. */
         (
           c.organization_id is not null
           and (
             (
               public.is_org_member(c.organization_id)
               and (c.open_to_scope or public.channel_member_of(c.id))
             )
             or (
               public.channel_shared_with_bes(c.id)
               and (
                 not exists (select 1 from public.channel_teams ct where ct.channel_id = c.id)
                 or public.channel_member_of(c.id)
               )
             )
           )
         )

         /* ── BES's own. Staff status is not access (§6). An all-hands
              channel says so on the row. */
         or (
           c.agency_id is not null
           and public.is_staff_of(c.agency_id)
           and (c.open_to_scope or public.channel_member_of(c.id))
         )

         /* ── A partner conversation. Two sides of one row: the partner's own
              active contacts, and BES staff who may see that partner, are in
              scope for the service it is about, and are in it. */
         or (
           c.partner_group_id is not null
           and (
             public.is_partner_contact_of(c.partner_group_id)
             or (
               public.can_see_partner(c.partner_group_id)
               and public.channel_service_ok(c.id)
               and (c.open_to_scope or public.channel_member_of(c.id))
             )
           )
         )
       )
  )
$function$;

-- ── Administrative inspection is NOT participation (§17) ────────────────
--
-- Dee: "Separate system administration from conversation participation... Do
-- not silently insert Admin into the conversation."
--
-- So an administrator with the capability can READ an internal or partner
-- conversation — somebody has to be able to answer a compliance question, and
-- to find a channel everybody has left. They cannot POST in it, because
-- `channel_writable` asks `channel_visible` and this function is not that.
-- The interface shows these under Administration, never among "my
-- conversations".
--
-- DIRECT MESSAGES ARE EXCLUDED. Dee named private and direct conversations
-- specifically, and "unless the approved audit model specifically requires
-- it" is not an approval. If Dee later wants DM audit, it is one line and a
-- deliberate decision.
create or replace function public.channel_auditable(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select public.channel_visible(p_channel)
      or exists (
        select 1 from public.channels c
         left join public.outsourcing_groups g on g.id = c.partner_group_id
         where c.id = p_channel
           and c.kind <> 'direct'
           and public.is_admin_of(coalesce(c.agency_id, g.agency_id))
           and public.agency_can('communication.audit')
      )
$function$;
revoke execute on function public.channel_auditable(uuid) from public, anon;
grant execute on function public.channel_auditable(uuid) to authenticated;

comment on function public.channel_auditable(uuid) is
  'Read for administration, which is not the same as being in the conversation. Writing asks channel_visible, so this can never put an administrator into an exchange they were not part of. Direct messages are excluded (Dee, §17).';

insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('communication.audit', 'Communication', 'Inspect any conversation',
   'Read internal and partner conversations for administration and compliance. Does NOT allow posting in them, and never covers direct messages.',
   true, 150),
  ('communication.manage', 'Communication', 'Manage conversations',
   'Create channels, and add or remove their people and teams.', true, 151)
on conflict (key) do nothing;

/* Off for everybody but owner and admin, who hold every ordinary capability
   by role. Managing conversations is on for managers; inspecting them is not
   a thing a manager does by default. */
insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'communication.audit',  false),
  (null, 'agency_team_lead', 'communication.audit',  false),
  (null, 'agency_agent',     'communication.audit',  false),
  (null, 'agency_manager',   'communication.manage', true),
  (null, 'agency_team_lead', 'communication.manage', false),
  (null, 'agency_agent',     'communication.manage', false)
on conflict do nothing;

-- ── Policies ────────────────────────────────────────────────────────────
revoke all on public.channel_teams from public, anon;
grant select, insert, delete on public.channel_teams to authenticated;
alter table public.channel_teams enable row level security;

/* Reading who is in a conversation you are in. Nothing more. */
create policy channel_teams_select on public.channel_teams for select to authenticated
  using (public.channel_visible(channel_id));
create policy channel_teams_insert on public.channel_teams for insert to authenticated
  with check (public.channel_manager(channel_id));
create policy channel_teams_delete on public.channel_teams for delete to authenticated
  using (public.channel_manager(channel_id));

/* Reading a channel row, and its messages, now allows administrative
   inspection. Writing does not — every write policy still asks
   `channel_writable`, which asks `channel_visible`. */
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select to authenticated
  using (public.channel_auditable(id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.channel_auditable(channel_id));

comment on table public.channels is
  'ONE canonical conversation, one owner, many authorized surfaces. A channel is never copied to appear somewhere else — the agency view, the partner portal and the organization workspace read the same row (Dee, §1, §45).';
