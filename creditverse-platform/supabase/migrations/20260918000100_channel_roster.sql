-- The Members tab was showing the mention picker.
--
-- Dee, 2026-09-18, on BES Managers / TL Room: "Do not automatically add the
-- teams on all Channel Unless it's their team."
--
-- Nothing was added. `channel_teams` holds exactly one row in the whole
-- database, on a different conversation — no team has ever been attached to
-- any of the new rooms. What the Members tab rendered was
-- `channel_mentionable`, on the reasoning that it "IS the member list with
-- names on it". It is not, and the difference is the whole bug:
--
--   channel_mentionable answers WHAT CAN I TYPE AFTER AN @ HERE. So it offers
--   @everyone, and it offers @CRM Team whenever even one person in the room
--   happens to be on the CRM team — which is useful when you are writing, and
--   reads as "the CRM team was added to this channel" when it is drawn as a
--   roster. It also leaves YOU out, because you cannot mention yourself, so
--   the tab said "Members 4" above a list of three.
--
-- A roster is a different question, so it gets its own function:
--
--   PEOPLE  everyone the conversation can actually reach, including you —
--           the same source as the count above the list, so the two can never
--           disagree.
--   TEAMS   only teams genuinely ON the conversation (`channel_teams`), which
--           is a deliberate act by a manager and the only thing that means a
--           team is in a room.

create or replace function public.channel_roster(p_channel uuid)
returns table (kind text, id text, name text, hint text, is_manager boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  /* Teams first, and only the ones somebody put here on purpose. */
  select 'team'::text, t.id::text, t.name,
         (select count(*)::text || ' on this team'
            from public.team_memberships tm where tm.team_id = t.id),
         false
    from public.channel_teams ct
    join public.teams t on t.id = ct.team_id
   where ct.channel_id = p_channel
     and t.archived_at is null
     and public.channel_visible(p_channel)

  union all

  /* Then the people. `mention_group_recipients` rather than `channel_members`:
     an open conversation has no member rows at all, and this is the same
     function the count uses. */
  select 'person'::text, p.id::text,
         coalesce(nullif(trim(p.full_name), ''), p.email),
         case
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

comment on function public.channel_roster(uuid) is
  'Who is in a conversation: every person it can reach (including you), and only the teams actually attached to it. Deliberately NOT channel_mentionable — that answers what you may type after an @, which offers @everyone and any team with one person here, and leaves you out.';

revoke all on function public.channel_roster(uuid) from public, anon;
grant execute on function public.channel_roster(uuid) to authenticated;
