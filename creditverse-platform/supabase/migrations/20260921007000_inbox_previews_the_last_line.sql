-- D-023: the inbox previews the last line of each conversation.
--
-- Two more columns on the one conversation summary the rail already loads —
-- who wrote last and what they wrote — so the Inbox can read
-- "JM Navales: Client already submitted the domain access details" without a
-- request per row (rule 14). One bounded subquery each, over the same
-- messages the unread count already scans. Return type changes, so the
-- function is dropped and recreated, as 20260913003500 did.

drop function if exists public.visible_channels();

CREATE OR REPLACE FUNCTION public.visible_channels()
 RETURNS TABLE(id uuid, organization_id uuid, agency_id uuid, partner_group_id uuid, partner_service_id uuid, partner_topic text, organization_name text, partner_name text, service_name text, kind text, name text, display_name text, direct_user_id uuid, purpose text, open_to_scope boolean, archived_at timestamp with time zone, shared_with_bes boolean, audit_only boolean, is_manager boolean, favourite boolean, can_rename boolean, unread integer, last_message_at timestamp with time zone, last_message_author text, last_message_text text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.id, c.organization_id, c.agency_id, c.partner_group_id, c.partner_service_id,
    c.partner_topic,
    o.name, g.name, ps.name, c.kind::text, c.name,
    /* A direct conversation that somebody NAMED shows that name. One that
       nobody named is described by who is in it — each person shown the
       OTHERS, first names, up to three then "+2". */
    case
      when c.kind = 'direct' and c.named_at is not null then c.name
      when c.kind = 'direct' then coalesce((
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
      ), c.name)
      else c.name
    end,
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
    public.channel_manager(c.id),
    exists (select 1 from public.channel_favourites f
             where f.channel_id = c.id and f.user_id = auth.uid()),
    /* Offered exactly where `rename_channel` would allow it: a group chat to
       any member, a channel to its managers, a DM to nobody. */
    c.archived_at is null and (
      case when c.kind = 'direct'
           then (select count(*) from public.channel_members m where m.channel_id = c.id) > 2
           else public.channel_manager(c.id) end),
    (select count(*)::int from public.messages m
      where m.channel_id = c.id and m.deleted_at is null
        and m.author_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.channel_reads r
            where r.channel_id = c.id and r.user_id = auth.uid()),
          '-infinity'::timestamptz)),
    (select max(m.created_at) from public.messages m
      where m.channel_id = c.id and m.deleted_at is null),
    /* The last line, as the inbox previews it: "JM Navales: Client already
       submitted…". First name only, like the DM label above; the text is the
       plain rendering the search index already keeps, cut to one line. */
    (select split_part(coalesce(nullif(trim(pr.full_name), ''), pr.email), ' ', 1)
       from public.messages m join public.profiles pr on pr.id = m.author_id
      where m.channel_id = c.id and m.deleted_at is null
      order by m.created_at desc limit 1),
    (select left(regexp_replace(m.body_text, '\s+', ' ', 'g'), 140)
       from public.messages m
      where m.channel_id = c.id and m.deleted_at is null
      order by m.created_at desc limit 1)
    from public.channels c
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.partner_group_id
    left join public.partner_services ps on ps.id = c.partner_service_id
   where public.channel_visible(c.id) or public.channel_auditable(c.id)
$function$;

revoke execute on function public.visible_channels() from public, anon;
grant execute on function public.visible_channels() to authenticated;
comment on function public.visible_channels() is
  'Every conversation this person may see or audit, with unread count, last activity and the last line (author + text). The rail, the Inbox and the partner portal all read this one summary.';
