-- 0191 — one conversation space. Three kinds of owner, one row each.
--
-- ---------------------------------------------------------------------------
-- WHAT DEE IS ASKING FOR
--
-- "It's gonna be like GHL that has one central communication/conversation
-- space." One place where a BES agent sees everything they need to support a
-- partner and the team — replacing Slack, WhatsApp and Teams at once.
--
-- And the rule that makes it work rather than sprawl:
--
--   ONE RECORD ONLY PER CHANNEL, EVEN DMs AND PORTAL MESSAGES.
--
-- Not a copy in each view. Not a mirror kept in step. ONE row, appearing
-- wherever the people in it are entitled to see it. An agent answering a
-- partner from the BES view writes into the same channel the partner reads in
-- their portal, because there is only one conversation.
--
-- ---------------------------------------------------------------------------
-- THREE OWNERS, EXACTLY ONE PER CHANNEL
--
--   organization_id    a customer's own channel. BES reaches it only through
--                      a live share (unchanged since it was built)
--   agency_id          BES's own team channel (0190)
--   partner_group_id   a conversation with a BES Partner — what their portal
--                      contacts write in, and what an agent answers
--
-- The check is `exactly one`, the same shape `teams` and `fulfillment_clients`
-- use, because "belongs to two things" is how a row ends up visible to
-- somebody neither of them would have allowed.
-- ---------------------------------------------------------------------------

alter table public.channels
  add column if not exists partner_group_id uuid references public.outsourcing_groups(id) on delete cascade;

alter table public.channels drop constraint if exists channels_one_owner;
alter table public.channels
  add constraint channels_one_owner check (
    (case when organization_id  is not null then 1 else 0 end) +
    (case when agency_id        is not null then 1 else 0 end) +
    (case when partner_group_id is not null then 1 else 0 end) = 1
  );

create index if not exists channels_partner_idx
  on public.channels (partner_group_id) where partner_group_id is not null and archived_at is null;

comment on column public.channels.partner_group_id is
  'A conversation with a BES Partner. Their portal contacts write here and BES answers here — the SAME row, which is what stops a portal message and an agent''s reply becoming two records of one exchange.';

-- ── Who can see a channel ───────────────────────────────────────────────
create or replace function public.channel_visible(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         /* A customer's own channel. Unchanged: BES reaches it only through a
            live share, and that is the whole point of the share. */
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

         /* BES's own. Staff status alone is not access — being BES does not
            put you in every conversation. An admin sees all of them because
            somebody has to be able to find an abandoned one. */
         or (
           c.agency_id is not null
           and public.is_staff_of(c.agency_id)
           and (
             exists (select 1 from public.channel_members m
                      where m.channel_id = c.id and m.user_id = auth.uid())
             or public.is_admin_of(c.agency_id)
           )
         )

         /* A partner conversation. Two sides of one row:
              the partner's own activated contacts, and
              BES staff who may see that partner at all. */
         or (
           c.partner_group_id is not null
           and (
             public.is_partner_contact_of(c.partner_group_id)
             or public.can_see_partner(c.partner_group_id)
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
         /* A partner contact is never a manager of the conversation: who may
            join a BES↔partner channel is BES's decision, the same way portal
            access itself is. */
         or (c.partner_group_id is not null and public.can_see_partner(c.partner_group_id))
       )
  )
  or exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         (c.organization_id is not null and public.is_org_admin(c.organization_id))
         or (c.agency_id is not null and public.is_admin_of(c.agency_id))
         or (c.partner_group_id is not null and exists (
               select 1 from public.outsourcing_groups g
                where g.id = c.partner_group_id and public.is_admin_of(g.agency_id)))
       )
  )
$function$;

-- ── Who can open one ────────────────────────────────────────────────────
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (organization_id is not null and public.is_org_member(organization_id))
      or (agency_id is not null and public.is_manager_of(agency_id))
      /* Anybody who may work the partner may open a conversation with them —
         that is ordinary account work, not an administrative act. */
      or (partner_group_id is not null and public.can_see_partner(partner_group_id))
    )
  );

-- ── Messages follow the channel, and always did ─────────────────────────
--
-- `messages` is gated on `channel_visible`, so a partner channel's messages
-- need no new policy: extending the helper extended them. Recorded here
-- because it is the kind of thing somebody checks for and does not find.
