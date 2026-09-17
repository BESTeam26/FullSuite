-- The rail needs to know what is starred.
--
-- Dee, 2026-09-17: "I dont have Favorite Section/ chat / SLACK has that as
-- STAR. We can do just Favorite."
--
-- The star exists and is stored; nothing groups by it, so starring did
-- nothing visible beyond filling in an icon. `visible_channels` now carries
-- the flag, so the rail can put a Favorites section at the top without a
-- second query per conversation.

/* A new column is a new row type, which Postgres will not replace in place. */
drop function if exists public.visible_channels();

create function public.visible_channels()
returns table (
  id uuid, organization_id uuid, agency_id uuid, partner_group_id uuid,
  partner_service_id uuid, partner_topic text, organization_name text,
  partner_name text, service_name text, kind text, name text, display_name text,
  direct_user_id uuid, purpose text, open_to_scope boolean,
  archived_at timestamptz, shared_with_bes boolean, audit_only boolean,
  is_manager boolean, favourite boolean, unread integer, last_message_at timestamptz)
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
      select case when array_length(ids, 1) = 1 then ids[1] end
        from (select array_agg(dm.user_id) as ids
                from public.channel_members dm
               where dm.channel_id = c.id and dm.user_id <> auth.uid()) one
    ) end,
    c.purpose, c.open_to_scope, c.archived_at,
    exists (select 1 from public.channel_shares s
             where s.channel_id = c.id and s.revoked_at is null),
    not public.channel_visible(c.id),
    /* The same function every manager policy uses, so a control is offered
       exactly when the action behind it would succeed. */
    public.channel_manager(c.id),
    exists (select 1 from public.channel_favourites f
             where f.channel_id = c.id and f.user_id = auth.uid()),
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

revoke all on function public.visible_channels() from public, anon;
grant execute on function public.visible_channels() to authenticated;
