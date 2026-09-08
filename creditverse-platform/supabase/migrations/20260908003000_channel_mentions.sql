-- 0207 — Who you can mention in a conversation, and who therefore hears about it.
--
-- ---------------------------------------------------------------------------
-- ONE LIST, TWO USES
--
-- Dee, §27: "Autocomplete only people/teams the current user is allowed to
-- reference in that context. Mention creates notification/unread emphasis but
-- does not grant access to the channel. Mentioning somebody who cannot access
-- the channel must NOT automatically bypass RLS."
--
-- The picker and the notifier must therefore agree exactly. If the picker
-- offers somebody the notifier will skip, you type a name, nothing happens,
-- and you learn not to trust mentions. So `channel_mentionable()` is built
-- from `channel_notifiable()` — the same predicate, once as a set and once as
-- a question — rather than being a second opinion about the same thing.
--
-- ---------------------------------------------------------------------------
-- A GAP IN 0206, FOUND BY ASKING WHO THE PICKER SHOULD OFFER
--
-- 0206's `channel_notifiable` handled direct membership, team membership, and
-- all-hands channels of an agency or an organization. It did NOT handle a
-- whole-partner conversation: `open_to_scope` on a PARTNER channel reaches
-- every agent assigned to that partner, and none of them was notifiable.
--
-- Which means: in the conversation with Credit by Nainoa — the one place an
-- agent most needs to pull a colleague in — @-mentioning that colleague would
-- have done nothing at all. Not an error. Nothing.
--
-- Extended below, and still deliberately no wider than visibility:
--
--   · the partner's own ACTIVE contacts, whose `partner_contacts` row is
--     their entire boundary and who lose it when suspended;
--   · BES staff with a LIVE assignment to that partner — by name or through
--     a live team — and, when the channel is scoped to one service, only an
--     assignment that is account-wide or for that same service (§19). A GHL
--     implementer still cannot be pulled into a CreditOps processing thread.
--
-- The invariant holds: `channel_notifiable` may name fewer people than
-- `channel_visible` would admit, never more. A missed ping is an annoyance;
-- the opposite mistake is a leak, and the two are not worth trading.
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

         /* Or an all-hands channel of the organization they belong to. */
         or (c.open_to_scope and c.organization_id is not null
             and exists (select 1 from public.org_memberships om
                          where om.user_id = p_user and om.organization_id = c.organization_id))

         /* Or a whole-partner conversation, from either side of it. */
         or (
           c.open_to_scope and c.partner_group_id is not null
           and (
             /* The partner's own active contact. Their row is the boundary,
                and a suspended contact or partner ends it (0159). */
             exists (
               select 1
                 from public.partner_contacts pc
                 join public.outsourcing_groups g on g.id = pc.group_id
                where pc.user_id = p_user and pc.group_id = c.partner_group_id
                  and pc.status = 'active'
                  and g.lifecycle not in ('suspended', 'archived')
             )
             /* Or BES staff who work this partner. Mirrors can_see_partner
                for a NAMED person, and respects the channel's service scope
                so a colleague on a different engagement is not reachable. */
             or exists (
               select 1
                 from public.outsourcing_groups g
                 join public.agency_memberships am
                   on am.agency_id = g.agency_id and am.user_id = p_user and am.status = 'active'
                where g.id = c.partner_group_id
                  and (
                    am.role in ('agency_owner', 'agency_admin')
                    or exists (
                      select 1 from public.partner_assignments a
                       where a.group_id = g.id
                         and a.ended_on is null
                         and (c.partner_service_id is null
                              or a.service_id is null
                              or a.service_id = c.partner_service_id)
                         and (
                           a.user_id = p_user
                           or (a.team_id is not null and exists (
                                 select 1 from public.team_memberships tm
                                   join public.teams t on t.id = tm.team_id
                                  where tm.team_id = a.team_id and tm.user_id = p_user
                                    and t.archived_at is null))
                         )
                    )
                  )
             )
           )
         )
       )
  )
$function$;

comment on function public.channel_notifiable(uuid, uuid) is
  'Whether a NAMED person may be told about a message in this channel. Deliberately no wider than `channel_visible`: a missed notification is an annoyance and the opposite mistake is a leak. Extended in 0207 to cover whole-partner conversations from both sides, which 0206 left out — @-mentioning a colleague in a partner conversation had silently done nothing (Dee, §27).';

-- ── The picker's list, from the same predicate ──────────────────────────
--
-- SECURITY DEFINER because it reads memberships across the agency, and gated
-- on `channel_visible` in its own first line: somebody who cannot see the
-- conversation gets an empty list rather than a roster. A picker that can
-- find people outside your scope tells you they exist (rule 1).
--
-- Fixture accounts are excluded the same way the workforce roster excludes
-- them: a beta tester must not be able to @-mention the matrix.
create or replace function public.channel_mentionable(p_channel uuid)
returns table (user_id uuid, name text, email text, hint text)
language sql stable security definer set search_path = public as $function$
  select p.id,
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
   order by 2
   limit 200
$function$;
revoke execute on function public.channel_mentionable(uuid) from public, anon;
grant execute on function public.channel_mentionable(uuid) to authenticated;

comment on function public.channel_mentionable(uuid) is
  'Who the "@" picker may offer in this conversation — the set form of `channel_notifiable`, so the picker and the notifier cannot disagree. Returns nothing at all to a caller who cannot see the channel (Dee, §27).';
