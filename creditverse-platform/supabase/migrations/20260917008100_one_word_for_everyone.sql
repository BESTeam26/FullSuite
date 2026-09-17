-- One word for it: @everyone.
--
-- Dee, 2026-09-17: "Just keep @everyone, remove @all and @channel if they
-- means the same."
--
-- They do mean the same, which was the whole reason the menu looked wrong. The
-- previous fix made them one ROW with three words on it; this makes them one
-- WORD. Fewer things that mean the same thing is the better answer, and it was
-- hers.
--
-- The stored token stays `channel`. It is not user-visible — it is what
-- `mentioned_group_targets` parses and `mention_group_recipients` expands —
-- and messages already sent carry it. Renaming it would break those for the
-- sake of a string nobody reads.
--
-- `channel` and `all` survive only as hidden aliases the picker searches, so
-- somebody arriving from Slack who types @channel still finds it. They are not
-- offered, and nothing is labelled with them.

create or replace function public.channel_mentionable(p_channel uuid)
returns table (user_id text, name text, email text, hint text, aliases text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select 'channel'::text, '@everyone'::text, null::text,
         (select 'Notify everyone here · ' || count(*) || ' ' ||
                 case when count(*) = 1 then 'person' else 'people' end
            from public.mention_group_recipients(p_channel, 'channel')),
         /* Not offered, only findable — muscle memory from Slack still lands
            on the one option rather than on nothing. */
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
     and t.archived_at is null
     and not t.is_fixture
     and exists (select 1 from public.mention_group_recipients(p_channel, 'team:' || t.id::text))

  union all
  select p.id::text,
         coalesce(nullif(trim(p.full_name), ''), p.email),
         p.email,
         case
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

comment on function public.channel_mentionable(uuid) is
  'Who and what can be mentioned here. ONE row per target and one word for each: @everyone for the conversation, @<team> for a team, then the people. @channel and @all are hidden aliases so a Slack habit still finds @everyone.';

revoke all on function public.channel_mentionable(uuid) from public, anon;
grant execute on function public.channel_mentionable(uuid) to authenticated;
