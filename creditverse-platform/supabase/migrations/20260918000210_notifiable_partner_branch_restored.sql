-- Correcting what 000200 actually applied.
--
-- 000200 rewrote `channel_notifiable` by retyping it, and lost two things from
-- the partner-assignment branch on the way:
--
--   · the SERVICE SCOPE — `c.partner_service_id is null or a.service_id is
--     null or a.service_id = c.partner_service_id` — so a colleague on a
--     different engagement with the same partner would have been notified
--     about a conversation scoped away from them;
--   · assignment BY TEAM. Only `a.user_id = p_user` survived, so every person
--     assigned to a partner through their team — which is how most BES
--     assignments are made — would have stopped being notified about that
--     partner's conversations entirely.
--
-- It also invented a `channel_service_ok(c.id)` call that was never in the
-- function.
--
-- 000200's file now carries the correct body, so a fresh database is right the
-- first time; this migration exists because the remote had already applied the
-- wrong one, and an applied migration is never edited into re-running. Same
-- body, `create or replace`, so running both in order is harmless.
--
-- The lesson, written down because this is the third time: a long function is
-- CHANGED by taking its current text and editing one branch, never by reading
-- it and typing it out again. A read that scrolls off the end looks complete.

create or replace function public.channel_notifiable(p_channel uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         /* Named on it, or on a live team that is — and, either way, STILL a
            live principal of whoever owns the conversation. Without the second
            half a deactivated person kept being counted, listed and notified
            about conversations they could no longer open (Dee, 2026-09-18). */
         (
           (
             /* Named on it. */
             exists (select 1 from public.channel_members m
                      where m.channel_id = c.id and m.user_id = p_user)

             /* Or on a live team that is. */
             or exists (select 1 from public.channel_teams ct
                          join public.team_memberships tm on tm.team_id = ct.team_id
                          join public.teams t on t.id = ct.team_id
                         where ct.channel_id = c.id and tm.user_id = p_user
                           and t.archived_at is null)
           )
           and public.channel_member_still_active(c.id, p_user)
         )

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
