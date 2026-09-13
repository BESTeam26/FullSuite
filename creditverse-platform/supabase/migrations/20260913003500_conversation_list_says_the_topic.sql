-- 0335 — the conversation list says which standing conversation it is.
--
-- 0333 made `partner_topic` the find-or-create key precisely so a rename could
-- not produce a second channel. The interface then has to group and order the
-- four the same way — and if it recognises them by NAME, the rename it was
-- protected from in the database defeats it in the menu instead.
--
-- The return signature changes, so the function is dropped and recreated
-- rather than replaced: `create or replace function` cannot change a
-- `returns table`.
drop function if exists public.visible_channels();

create function public.visible_channels()
returns table (
  id uuid, organization_id uuid, agency_id uuid, partner_group_id uuid,
  partner_service_id uuid, partner_topic text, organization_name text, partner_name text,
  service_name text, kind text, name text, display_name text, purpose text,
  open_to_scope boolean, archived_at timestamptz, shared_with_bes boolean,
  audit_only boolean, is_manager boolean, unread integer, last_message_at timestamptz
)
language sql stable security invoker set search_path = public as $function$
  select
    c.id, c.organization_id, c.agency_id, c.partner_group_id, c.partner_service_id,
    c.partner_topic,
    o.name, g.name, ps.name, c.kind::text, c.name,
    /* A direct message has no name that is right for both people in it, so
       each side is shown the OTHER one. Derived per caller, never stored. */
    case when c.kind = 'direct' then coalesce((
      select coalesce(nullif(trim(pr.full_name), ''), pr.email)
        from public.channel_members dm
        join public.profiles pr on pr.id = dm.user_id
       where dm.channel_id = c.id and dm.user_id <> auth.uid()
       limit 1
    ), c.name) else c.name end,
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
$function$;
revoke execute on function public.visible_channels() from public, anon;
grant execute on function public.visible_channels() to authenticated;

comment on function public.visible_channels() is
  'The entire conversation list with unread counts in ONE call. INVOKER so channels_select stays the only answer to who may see what (rule 14, Dee §20/§21).';
