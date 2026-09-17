-- One row per mention target.
--
-- 20260917007000 offered `@channel`, `@everyone` and `@all` as three menu rows
-- because they are three words people actually type. They all carry the SAME
-- target token, `channel`, and the picker keys its list by that token — so the
-- menu rendered two rows both labelled "@channel" and one "@everyone" for a
-- query of "Cha", which is React reconciling a list with duplicate keys.
--
-- Dee saw it immediately: "Why 2 channels?"
--
-- Three rows for one thing was the mistake, not the keying. There is ONE
-- target, so there is one row. The other two words are ALIASES on it: the
-- picker searches them, so typing @everyone or @all still finds it, and what
-- gets inserted is the same single mention either way.

/* A new column means a new row type, which Postgres will not replace. */
drop function if exists public.channel_mentionable(uuid);

create function public.channel_mentionable(p_channel uuid)
returns table (user_id text, name text, email text, hint text, aliases text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  /* The group first: it is what somebody reaches for when they want everybody,
     and burying it under a person list means typing the whole word. */
  select 'channel'::text, '@channel'::text, null::text,
         (select 'Notify everyone here · ' || count(*) || ' ' ||
                 case when count(*) = 1 then 'person' else 'people' end
            from public.mention_group_recipients(p_channel, 'channel')),
         /* Same target, other words. One row, three ways to find it. */
         array['@everyone', '@all', 'everyone', 'all']
   where public.channel_visible(p_channel)

  union all
  /* Only teams that actually reach somebody HERE. A team whose members cannot
     be notified in this conversation is an option that would do nothing. */
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
  'Who and what can be mentioned here: the group targets first, then the people. ONE row per target — @everyone and @all are aliases on @channel, not rows of their own, because three rows sharing one token is three rows the picker cannot tell apart.';

revoke all on function public.channel_mentionable(uuid) from public, anon;
grant execute on function public.channel_mentionable(uuid) to authenticated;
