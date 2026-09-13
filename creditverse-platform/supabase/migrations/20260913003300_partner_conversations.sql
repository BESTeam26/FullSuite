-- 0333 — the partner can start the conversation.
--
-- ---------------------------------------------------------------------------
-- WHAT DEE ASKED FOR
--
--   "DMs and channels — general, creditops, marketing, support. Channels are
--    shown only when they are relevant to the partner's active services...
--    and the partner must be able to start the first conversation."
--
-- Today they cannot. `channels_insert` lets a partner conversation be opened
-- only by somebody who `can_see_partner` — BES staff. So the portal's Messages
-- page says "your BES contact will open one", and until an agent remembers to,
-- a partner with a question has nowhere to put it. That is the wrong way round
-- for the one screen whose entire job is being reachable.
--
-- ---------------------------------------------------------------------------
-- STILL ONE RECORD PER CONVERSATION (0191)
--
-- Nothing here creates a portal-only message store. A topic channel opened
-- from the portal is the SAME `channels` row an agent answers in, found or
-- created by the same function whichever side presses the button — which is
-- why the find-or-create key is a column and not the channel's name. An
-- administrator renaming "Support" to "Billing questions" must not cause the
-- next portal visit to open a second one.
--
-- ---------------------------------------------------------------------------
-- WHAT IS AUTHORIZATION HERE, AND WHAT IS ONLY RELEVANCE
--
-- The database decides WHO MAY TALK TO WHOM. It does not decide which of the
-- four topics is worth offering a particular partner — that depends on which
-- services are live, it is a product judgement, and it lives in
-- `src/lib/portal/portal-conversations.ts` where it can be read and tested.
--
-- The split is deliberate: a marketing channel opened for a partner who buys
-- no marketing is untidy, not a leak. The boundary that IS security — a
-- partner contact reaching only their own partner's conversations, and a
-- direct message reaching only its two people — is below, in policy.
-- ---------------------------------------------------------------------------

-- ── The find-or-create key ──────────────────────────────────────────────
alter table public.channels
  add column if not exists partner_topic text
    check (partner_topic is null or partner_topic in ('general', 'creditops', 'marketing', 'support'));

comment on column public.channels.partner_topic is
  'Which standing partner conversation this is. The find-or-create key, so renaming a channel cannot produce a second one; null for every channel that is not one of the four.';

alter table public.channels drop constraint if exists channels_topic_belongs_to_partner;
alter table public.channels
  add constraint channels_topic_belongs_to_partner check (
    partner_topic is null or partner_group_id is not null
  );

/* One per partner per topic, and an archived one does not block a new one. */
create unique index if not exists channels_partner_topic_idx
  on public.channels (partner_group_id, partner_topic)
  where partner_topic is not null and archived_at is null;

/* The conversation 0191 already opens for a partner IS their general one.
   Claiming it here is what stops the first portal visit opening a second. */
update public.channels c set partner_topic = 'general'
 where c.partner_group_id is not null
   and c.partner_topic is null
   and c.partner_service_id is null
   and c.kind = 'general'
   and c.archived_at is null
   and not exists (
     select 1 from public.channels o
      where o.partner_group_id = c.partner_group_id
        and o.partner_topic = 'general' and o.archived_at is null
   );

-- ── A direct message is not the whole partner's to read ─────────────────
--
-- A partner channel is visible to every ACTIVE contact of that partner and to
-- BES staff in scope. That is right for a topic conversation and wrong for a
-- direct one: a contact writing privately to their processor is not writing to
-- their colleagues. So a partner-owned DIRECT channel requires membership on
-- BOTH sides.
--
-- This can narrow nothing that exists: `kind = 'direct'` on a partner channel
-- is created for the first time by this migration's own function, below.
create or replace function public.channel_visible(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         /* ── ORGANIZATION-owned. Their isolation is untouched (§35). ── */
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

         /* ── BES's own. Staff status is not access (§6). */
         or (
           c.agency_id is not null
           and public.is_staff_of(c.agency_id)
           and (c.open_to_scope or public.channel_member_of(c.id))
         )

         /* ── A partner conversation. Two sides of one row: the partner's own
              active contacts, and BES staff who may see that partner, are in
              scope for the service it is about, and are in it.

              A DIRECT one adds membership to both sides — the only difference
              from the rule that was here before 0333. */
         or (
           c.partner_group_id is not null
           and (c.kind <> 'direct' or public.channel_member_of(c.id))
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

comment on function public.channel_visible(uuid) is
  'The one answer to who is in a conversation. A partner DIRECT message is the exception to "every active contact reads their partner''s channels": it reaches its two members and nobody else (0333).';

-- ── Opening a standing topic conversation ───────────────────────────────
--
-- SECURITY DEFINER because a partner contact may not insert into `channels` —
-- and should not be able to insert an arbitrary one. Everything this is
-- trusted with is checked first: the caller belongs to the partner (either
-- side), and the topic is one of the four.
create or replace function public.partner_topic_channel(p_group uuid, p_topic text)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_me    uuid := auth.uid();
  v_id    uuid;
  v_label text;
  v_why   text;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (public.is_partner_contact_of(p_group) or public.can_see_partner(p_group)) then
    raise exception 'Not your partner' using errcode = '42501';
  end if;

  select l.label, l.why into v_label, v_why from (values
    ('general',   'General',   'Anything about the account'),
    ('creditops', 'CreditOps', 'Client processing, disputes and results'),
    ('marketing', 'Marketing', 'Content, campaigns and approvals'),
    ('support',   'Support',   'Access, billing and anything that is not working')
  ) as l(topic, label, why) where l.topic = p_topic;
  if v_label is null then
    raise exception 'Unknown conversation topic' using errcode = 'P0001';
  end if;

  select c.id into v_id from public.channels c
   where c.partner_group_id = p_group and c.partner_topic = p_topic and c.archived_at is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.channels (partner_group_id, partner_topic, kind, name, purpose, created_by, open_to_scope)
  values (
    p_group, p_topic,
    /* 'general' is a kind as well as a topic, the way 0191 already created it;
       the other three are ordinary topic channels. */
    case when p_topic = 'general' then 'general'::public.channel_kind else 'topic'::public.channel_kind end,
    v_label, v_why, v_me,
    /* Everybody assigned to the partner is in it without being added one at a
       time — the same choice 0191 made for the whole-partner conversation. */
    true
  )
  returning id into v_id;
  return v_id;
end;
$function$;
revoke execute on function public.partner_topic_channel(uuid, text) from public, anon;
grant execute on function public.partner_topic_channel(uuid, text) to authenticated;

comment on function public.partner_topic_channel(uuid, text) is
  'Find-or-create one of a partner''s four standing conversations, pressed from either side and landing in the SAME row (Dee: the partner must be able to start the first conversation).';

-- ── Opening a direct message with the account team ──────────────────────
--
-- Who a partner contact may write to privately is not "any BES employee": it
-- is the people NAMED on their account. A live `partner_assignments` row with
-- a user is exactly that fact, already maintained, and it ends by itself when
-- somebody leaves the account.
create or replace function public.partner_direct_channel(p_group uuid, p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null or p_other is null or p_other = v_me then
    raise exception 'A direct message needs two different people' using errcode = 'P0001';
  end if;

  if public.is_partner_contact_of(p_group) then
    /* The partner's side: only somebody with a live named assignment to this
       account. Not every agent, and not an ended one. */
    if not exists (
      select 1 from public.partner_assignments a
       where a.group_id = p_group and a.user_id = p_other and a.ended_on is null
    ) then
      raise exception 'That person is not on your BES team' using errcode = '42501';
    end if;
  elsif public.can_see_partner(p_group) then
    /* BES's side: only an active contact of that partner. */
    if not exists (
      select 1 from public.partner_contacts pc
       where pc.group_id = p_group and pc.user_id = p_other and pc.status = 'active'
    ) then
      raise exception 'That person is not an active contact of this partner' using errcode = '42501';
    end if;
  else
    raise exception 'Not your partner' using errcode = '42501';
  end if;

  /* Exactly these two and nobody else, so it is found again from either side
     rather than opened twice (§13). */
  select c.id into v_id from public.channels c
   where c.partner_group_id = p_group and c.kind = 'direct' and c.archived_at is null
     and (select count(*) from public.channel_members m where m.channel_id = c.id) = 2
     and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = v_me)
     and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = p_other)
   order by c.created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.channels (partner_group_id, kind, name, created_by, open_to_scope)
  values (p_group, 'direct', 'Direct message', v_me, false)
  returning id into v_id;

  insert into public.channel_members (channel_id, user_id, is_manager)
  values (v_id, v_me, true), (v_id, p_other, true);

  return v_id;
end;
$function$;
revoke execute on function public.partner_direct_channel(uuid, uuid) from public, anon;
grant execute on function public.partner_direct_channel(uuid, uuid) to authenticated;

comment on function public.partner_direct_channel(uuid, uuid) is
  'Find-or-create the ONE private conversation between a partner contact and a named member of their BES account team. Both are members; nobody else is, and channel_visible keeps it that way.';

-- ── Who the partner may write to ────────────────────────────────────────
--
-- The partner-safe projection of the account team: a name, and what they do
-- here. Not their email, not their team structure, not their other partners —
-- the same whitelist discipline as every other portal read.
create or replace function public.my_partner_team()
returns table (user_id uuid, name text, role_label text, is_primary boolean)
language sql stable security definer set search_path = public as $function$
  select p.id,
         coalesce(nullif(trim(p.full_name), ''), 'BES'),
         nullif(trim(coalesce(
           max(a.assignment_role) filter (where a.assignment_role is not null), '')), ''),
         bool_or(a.is_primary)
    from public.partner_assignments a
    join public.profiles p on p.id = a.user_id
   where a.group_id = public.partner_group_of_user()
     and a.user_id is not null
     and a.ended_on is null
     and coalesce(p.is_fixture, false) = false
   group by p.id, p.full_name
   order by bool_or(a.is_primary) desc, 2
$function$;
revoke execute on function public.my_partner_team() from public, anon;
grant execute on function public.my_partner_team() to authenticated;

comment on function public.my_partner_team() is
  'The BES people named on the caller''s own account, for the portal''s "message someone" list. Returns nothing to anybody who is not an active partner contact, because partner_group_of_user() returns nothing.';
