-- @channel, @everyone, @all, and @a-team.
--
-- Dee, 2026-09-17: "add the capability to mention everyone, all, or channel,
-- or certain team. so everyone from that team will be notified."
--
-- ── MODELLED AS A MENTION, NOT AS A NEW THING ─────────────────────────────
--
-- A mention is already a node carrying `userId` and `label`, already extracted
-- by `mentioned_user_ids`, already notified by `notify_message_recipients` and
-- already gated by `channel_notifiable` so that naming somebody does not admit
-- them to a conversation they cannot reach (§27).
--
-- A group mention is the same node with a TOKEN in place of the uuid:
--
--   channel       everybody who can be notified in this conversation
--   team:<uuid>   everybody on that team who can be notified here
--
-- `@everyone` and `@all` are the same reach as `@channel` and resolve to the
-- same token — three words people actually type for one idea, rather than
-- three subtly different behaviours nobody can remember.
--
-- Because the uuid regex in `mentioned_user_ids` and `message_mentions` only
-- matches uuids, an old build simply ignores these: a group mention degrades
-- to plain text rather than notifying the wrong people.
--
-- ── THE GATE IS UNCHANGED, AND THAT IS THE POINT ──────────────────────────
--
-- Expansion happens INSIDE the notifier, and every expanded recipient still
-- passes `channel_notifiable`. @channel cannot reach further than the
-- conversation, and @a-team cannot pull somebody into a conversation they are
-- not entitled to — it only notifies the intersection.

create or replace function public.mentioned_group_targets(p_body jsonb)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  with recursive nodes(node) as (
    select p_body
    union all
    select child
      from nodes,
           lateral jsonb_array_elements(
             case when jsonb_typeof(nodes.node -> 'content') = 'array'
                  then nodes.node -> 'content' else '[]'::jsonb end
           ) as child
  )
  select coalesce(array_agg(distinct token), '{}'::text[])
    from (
      select node -> 'attrs' ->> 'userId' as token
        from nodes
       where node ->> 'type' = 'mention'
         and (node -> 'attrs' ->> 'userId' = 'channel'
              or node -> 'attrs' ->> 'userId' ~
                 '^team:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    ) found
$$;

comment on function public.mentioned_group_targets(jsonb) is
  'The group tokens in a message body: `channel`, and `team:<uuid>`. Deliberately separate from mentioned_user_ids, whose uuid check means an older build ignores these rather than mis-notifying.';

/* Who a token reaches, in this conversation. One function so the notifier and
   anything that later wants to PREVIEW the reach cannot disagree about it. */
create or replace function public.mention_group_recipients(p_channel uuid, p_token text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id
    from public.profiles p
   where p.is_fixture = false
     and (
       /* Everybody the conversation can notify. */
       (p_token = 'channel')
       /* Or that team's active members — and still only those the
          conversation can notify. A team mention does not widen access. */
       or (p_token like 'team:%' and exists (
             select 1 from public.team_memberships tm
              where tm.team_id = substring(p_token from 6)::uuid
                and tm.user_id = p.id))
     )
     and public.channel_notifiable(p_channel, p.id)
$$;

comment on function public.mention_group_recipients(uuid, text) is
  'Who a group mention actually reaches. Every recipient still passes channel_notifiable, so @channel cannot reach past the conversation and @a-team cannot pull somebody into one they are not entitled to.';

revoke all on function public.mention_group_recipients(uuid, text) from public, anon;
grant execute on function public.mention_group_recipients(uuid, text) to authenticated;

-- ── The menu offers them ───────────────────────────────────────────────────

/* `user_id` becomes text, because a group target is a token rather than a
   uuid — and Postgres will not change an existing function's row type. */
drop function if exists public.channel_mentionable(uuid);

create function public.channel_mentionable(p_channel uuid)
returns table (user_id text, name text, email text, hint text)
language sql
stable
security definer
set search_path to 'public'
as $$
  /* Groups first: they are what somebody reaches for when they want everybody,
     and burying them under a person list means typing the whole word. */
  select 'channel'::text, '@channel'::text, null::text,
         (select 'Notify everyone here · ' || count(*) || ' ' ||
                 case when count(*) = 1 then 'person' else 'people' end
            from public.mention_group_recipients(p_channel, 'channel'))
   where public.channel_visible(p_channel)

  union all
  /* Same reach, two more words people actually type. Offered so the menu
     answers whichever one somebody reaches for. */
  select 'channel', '@everyone', null, 'Same as @channel'
   where public.channel_visible(p_channel)
  union all
  select 'channel', '@all', null, 'Same as @channel'
   where public.channel_visible(p_channel)

  union all
  /* Only teams that actually reach somebody HERE. A team whose members cannot
     be notified in this conversation is an option that would do nothing. */
  select 'team:' || t.id::text, '@' || t.name, null,
         'Notify the team · ' || (
           select count(*) from public.mention_group_recipients(p_channel, 'team:' || t.id::text)
         ) || ' here'
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
         end
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
  'Who and what can be mentioned here: the group tokens first, then the people. `user_id` is text because a group is a token rather than a uuid.';

revoke all on function public.channel_mentionable(uuid) from public, anon;
grant execute on function public.channel_mentionable(uuid) to authenticated;

-- ── The fan-out ────────────────────────────────────────────────────────────

create or replace function public.notify_message_recipients()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ch       record;
  v_target   uuid;
  v_token    text;
  v_mentions uuid[] := public.mentioned_user_ids(new.body);
  v_groups   text[] := public.mentioned_group_targets(new.body);
  v_label    text;
begin
  select * into v_ch from public.channel_notice(new.channel_id);

  /* No agency, no notification — and above all, no failed INSERT. An AFTER
     INSERT trigger that raises takes the message with it (0174, 0196, 0206). */
  if v_ch.agency_id is null then
    return new;
  end if;

  if v_ch.is_direct then
    select coalesce(nullif(trim(p.full_name), ''), p.email, 'Someone')
      into v_label
      from public.profiles p where p.id = new.author_id;
  else
    v_label := v_ch.label;
  end if;

  /* A group mention is expanded into the same list the named ones go through,
     so one person named twice — once by name and once by team — is notified
     once, and every recipient passes the same gate. */
  foreach v_token in array v_groups loop
    v_mentions := array(
      select distinct u from unnest(
        v_mentions || array(select user_id from public.mention_group_recipients(new.channel_id, v_token))
      ) as u);
  end loop;

  /* ── Mentions ────────────────────────────────────────────────────────── */
  foreach v_target in array v_mentions loop
    continue when v_target = new.author_id;
    /* Named, but must still be able to reach the conversation. Naming
       somebody does not admit them to it (§27). */
    continue when not public.channel_notifiable(new.channel_id, v_target);

    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    values (v_target, new.author_id, v_ch.agency_id, v_ch.organization_id, 'mention',
            'channel', new.channel_id::text, v_label, v_ch.visibility,
            'You were mentioned in ' || v_label,
            left(coalesce(new.body_text, 'a message'), 160))
    on conflict do nothing;
  end loop;

  return new;
end $$;

comment on function public.notify_message_recipients() is
  'Notifies everybody a message names, including through @channel and @a-team. Group tokens are expanded into the same list, so somebody named twice is notified once, and every recipient passes channel_notifiable.';
