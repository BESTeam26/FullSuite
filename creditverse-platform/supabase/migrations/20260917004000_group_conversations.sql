-- Group chats: a direct conversation with more than two people in it.
--
-- Dee, 2026-09-17, on the Communication rail: "when I click New it should give
-- me option to dm or send group chat message to create a group chat."
--
-- There was no such thing. `open_direct_channel(p_other uuid)` takes exactly
-- one other person and refuses anything else, so the only way three people
-- could talk was a channel — which is a different thing with a name, a purpose
-- and a membership list somebody administers.
--
-- ── MODELLED THE WAY SLACK DOES, AND THE WAY THE SCHEMA ALREADY ALLOWS ────
--
-- A group chat is `kind = 'direct'` with three or more members. Nothing in the
-- schema ever required a direct conversation to have exactly two — that rule
-- lived only inside `open_direct_channel`. So the rail's existing "Direct
-- messages" grouping, its unread counts, its policies and its reactions all
-- work on a group chat without a line of change.
--
-- ── SAME PEOPLE, SAME CONVERSATION ────────────────────────────────────────
--
-- Dee §13: "For the same participant set: reuse existing active Direct
-- conversation." That was written about two people and it is more important
-- with more: without it, four people who each start a chat with the same three
-- colleagues end up with four identical conversations and no way to tell which
-- one anybody replied in.
--
-- So the lookup matches the member set EXACTLY — same people, no more and no
-- fewer — before it creates anything.

create or replace function public.open_group_conversation(p_others uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me      uuid := auth.uid();
  v_agency  uuid;
  v_people  uuid[];
  v_count   int;
  v_id      uuid;
  v_outside int;
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = v_me and m.status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'Not agency staff' using errcode = '42501';
  end if;

  /* Me plus the others, deduplicated and sorted — so the same people in a
     different order are the same set, which is the whole point. */
  select array_agg(distinct x order by x) into v_people
    from unnest(coalesce(p_others, '{}'::uuid[]) || v_me) as x
   where x is not null;

  v_count := coalesce(array_length(v_people, 1), 0);
  if v_count < 2 then
    raise exception 'A conversation needs at least two people' using errcode = '22023';
  end if;
  /* Above this a channel is the right tool: it has a name, a purpose and
     somebody who administers the membership. A 30-person "group chat" is a
     channel nobody named. */
  if v_count > 12 then
    raise exception 'That is % people — create a channel instead', v_count using errcode = '22023';
  end if;

  /* Everybody must be active staff of the same agency. Counted rather than
     looped so one query answers for the whole set. */
  select count(*) into v_outside
    from unnest(v_people) as u(id)
   where not exists (
     select 1 from public.agency_memberships m
      where m.user_id = u.id and m.agency_id = v_agency and m.status = 'active');
  if v_outside > 0 then
    raise exception '% of those people are not active staff of this agency', v_outside
      using errcode = '42501';
  end if;

  /* Two people is a direct message, and `open_direct_channel` already owns
     that — including its own reuse rule. Delegating rather than restating it
     is what stops the two drifting apart. */
  if v_count = 2 then
    return public.open_direct_channel((select x from unnest(v_people) as x where x <> v_me limit 1));
  end if;

  /* Exactly this set. A conversation that contains these people AND somebody
     else is a different conversation. */
  select c.id into v_id
    from public.channels c
   where c.agency_id = v_agency and c.kind = 'direct' and c.archived_at is null
     and (select array_agg(distinct m.user_id order by m.user_id)
            from public.channel_members m where m.channel_id = c.id) = v_people
   order by c.created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.channels (agency_id, kind, name, created_by)
  values (v_agency, 'direct', 'Group message', v_me)
  returning id into v_id;

  /* Everybody is a manager of their own group chat: there is no owner of a
     conversation you were all in from the start. */
  insert into public.channel_members (channel_id, user_id, is_manager)
  select v_id, u.id, true from unnest(v_people) as u(id);

  return v_id;
end $$;

comment on function public.open_group_conversation(uuid[]) is
  'Opens the group chat for exactly this set of people, creating it only if it does not exist. Two people delegates to open_direct_channel. Above twelve it refuses and says to make a channel — a group chat nobody named is a channel nobody named.';

revoke all on function public.open_group_conversation(uuid[]) from public, anon;
grant execute on function public.open_group_conversation(uuid[]) to authenticated;

-- ── A group chat needs a name that says who is in it ──────────────────────
--
-- `visible_channels` named a direct conversation after "the other person",
-- with `limit 1`. For two people that is right. For five it shows one name and
-- hides four, so two different group chats can look identical in the rail.

create or replace function public.visible_channels()
returns table (
  id uuid, organization_id uuid, agency_id uuid, partner_group_id uuid,
  partner_service_id uuid, partner_topic text, organization_name text,
  partner_name text, service_name text, kind text, name text, display_name text,
  direct_user_id uuid, purpose text, open_to_scope boolean,
  archived_at timestamptz, shared_with_bes boolean, audit_only boolean,
  is_manager boolean, unread integer, last_message_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id, c.organization_id, c.agency_id, c.partner_group_id, c.partner_service_id,
    c.partner_topic,
    o.name, g.name, ps.name, c.kind::text, c.name,
    /* A direct conversation has no name that is right for everybody in it, so
       each person is shown the OTHERS. Derived per caller, never stored.
       First names, because "Rowell Christian Pena, Allyssa Cruz, James Ivan
       Lazo" does not fit a rail and says no more than "Rowell, Allyssa,
       James". Four or more becomes "A, B, C +2". */
    case when c.kind = 'direct' then coalesce((
      select case
        when count(*) = 0 then c.name
        when count(*) <= 3 then string_agg(who, ', ' order by who)
        else string_agg(who, ', ' order by who)
               filter (where rn <= 3) || ' +' || (count(*) - 3)
      end
        from (
          select split_part(coalesce(nullif(trim(pr.full_name), ''), pr.email), ' ', 1) as who,
                 row_number() over (order by coalesce(nullif(trim(pr.full_name), ''), pr.email)) as rn
            from public.channel_members dm
            join public.profiles pr on pr.id = dm.user_id
           where dm.channel_id = c.id and dm.user_id <> auth.uid()
        ) others
    ), c.name) else c.name end,
    /* Only meaningful when there is exactly ONE other person — it is what the
       rail hangs an avatar on, and a group has no single face. */
    case when c.kind = 'direct' then (
      /* `min()` has no uuid form, so the set is collected and read — the
         guard is that there must be exactly one for it to mean anything. */
      select case when array_length(ids, 1) = 1 then ids[1] end
        from (select array_agg(dm.user_id) as ids
                from public.channel_members dm
               where dm.channel_id = c.id and dm.user_id <> auth.uid()) one
    ) end,
    c.purpose, c.open_to_scope, c.archived_at,
    exists (select 1 from public.channel_shares s
             where s.channel_id = c.id and s.revoked_at is null),
    not public.channel_visible(c.id),
    exists (select 1 from public.channel_members m
             where m.channel_id = c.id and m.user_id = auth.uid() and m.is_manager),
    (select count(*)::int from public.messages m
      where m.channel_id = c.id and m.deleted_at is null
        and m.author_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.channel_reads r
            where r.channel_id = c.id and r.user_id = auth.uid()),
          '-infinity'::timestamptz)),
    (select max(m.created_at) from public.messages m
      where m.channel_id = c.id and m.deleted_at is null)
    from public.channels c
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.partner_group_id
    left join public.partner_services ps on ps.id = c.partner_service_id
   where public.channel_visible(c.id) or public.channel_auditable(c.id)
$$;

comment on function public.visible_channels() is
  'Every conversation this caller may see, named from their own chair. A direct conversation is named after the OTHER people in it — one name for a DM, up to three plus a count for a group chat.';

revoke all on function public.visible_channels() from public, anon;
grant execute on function public.visible_channels() to authenticated;
