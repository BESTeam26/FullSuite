-- 0206 — Mentions, for all three kinds of conversation.
--
-- ---------------------------------------------------------------------------
-- A LATENT BLOCKER, FOUND BEFORE ANYBODY HIT IT
--
-- `notify_message_mentions` was written when a channel could only belong to an
-- organization, and it still opens with:
--
--     from public.channels c join public.organizations o on o.id = c.organization_id
--
-- An INNER join. For a BES internal channel or a partner conversation there is
-- no organization, so it matches nothing and `v_agency` stays NULL — and
-- `notifications.agency_id` is NOT NULL. The insert raises 23502, and because
-- this is an AFTER INSERT trigger on `messages`, IT TAKES THE MESSAGE WITH IT.
--
-- Nobody has hit it because the loop only runs when the message body actually
-- contains a mention, and the composer does not emit mention marks yet. The
-- first @ in #general would have refused the message with an error about a
-- null value in a notifications column.
--
-- Same shape as 0174 and 0196: a side effect that cannot run takes the
-- business write down with it. Three times now, which is why the matrix
-- performs these writes as real users rather than as the superuser.
--
-- ---------------------------------------------------------------------------
-- WHO MAY BE NOTIFIED (§27)
--
-- Dee: "Mention creates notification/unread emphasis but does not grant access
-- to the channel. Mentioning somebody who cannot access the channel must NOT
-- automatically bypass RLS."
--
-- `channel_notifiable(channel, user)` answers that for a NAMED person, which
-- `channel_visible` cannot do — it asks about `auth.uid()` all the way down.
-- It is deliberately NARROWER than visibility rather than a second copy of it:
-- direct membership, team membership, or an all-hands channel of the agency
-- they actively belong to. Somebody who can see a conversation through a route
-- this does not model gets no notification, which is a missed ping. The
-- opposite mistake would be a leak, and the two are not worth trading.
-- ---------------------------------------------------------------------------

create or replace function public.channel_notifiable(p_channel uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         /* Named on it. */
         exists (select 1 from public.channel_members m
                  where m.channel_id = c.id and m.user_id = p_user)
         /* Or on a live team that is. */
         or exists (select 1 from public.channel_teams ct
                      join public.team_memberships tm on tm.team_id = ct.team_id
                      join public.teams t on t.id = ct.team_id
                     where ct.channel_id = c.id and tm.user_id = p_user
                       and t.archived_at is null)
         /* Or it is an all-hands BES channel and they are active staff. */
         or (c.open_to_scope and c.agency_id is not null
             and exists (select 1 from public.agency_memberships am
                          where am.user_id = p_user and am.agency_id = c.agency_id
                            and am.status = 'active'))
         /* Or it is an all-hands channel of the organization they belong to. */
         or (c.open_to_scope and c.organization_id is not null
             and exists (select 1 from public.org_memberships om
                          where om.user_id = p_user and om.organization_id = c.organization_id))
       )
  )
$function$;
revoke execute on function public.channel_notifiable(uuid, uuid) from public, anon;
grant execute on function public.channel_notifiable(uuid, uuid) to authenticated;

comment on function public.channel_notifiable(uuid, uuid) is
  'Whether a NAMED person may be told about a message in this channel. Deliberately narrower than `channel_visible`, never wider: a missed notification is an annoyance, and the opposite mistake is a leak (Dee, §27).';

create or replace function public.notify_message_mentions()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_target uuid;
  v_org    uuid;
  v_agency uuid;
  v_name   text;
begin
  /* LEFT joins, and the agency taken from whichever owner the channel has.
     An agency channel has it directly; an organization channel through its
     organization; a partner conversation through the partner. */
  select c.organization_id,
         coalesce(c.agency_id, o.agency_id, g.agency_id),
         c.name
    into v_org, v_agency, v_name
    from public.channels c
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.partner_group_id
   where c.id = new.channel_id;

  /* No agency, no notification — and above all, no failed INSERT. A message
     is worth more than the ping about it. */
  if v_agency is null then
    return new;
  end if;

  foreach v_target in array public.mentioned_user_ids(new.body) loop
    continue when v_target = new.author_id;
    /* Named, but must still be able to reach the conversation. Naming
       somebody does not admit them to it (§27). */
    continue when not public.channel_notifiable(new.channel_id, v_target);

    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    values (v_target, new.author_id, v_agency, v_org, 'mention', 'channel', new.channel_id::text,
            v_name, 'organization_internal', 'You were mentioned', left(new.body_text, 280))
    on conflict do nothing;
  end loop;
  return new;
end;
$function$;

comment on function public.notify_message_mentions() is
  'Mentions in any of the three kinds of conversation. Resolves the agency from whichever owner the channel has, and returns early rather than raising when it cannot — an AFTER INSERT trigger that throws takes the message with it (0174, 0196, and this).';
