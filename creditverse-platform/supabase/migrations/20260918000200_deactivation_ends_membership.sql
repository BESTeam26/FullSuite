-- Deactivating somebody has to end their conversations too.
--
-- Dee, 2026-09-18: "once we deactivate the agent, team member, they will be
-- automatically removed from all channels and all access revoke."
--
-- ── WHAT WAS ALREADY TRUE ─────────────────────────────────────────────────
--
-- Access was already revoked, completely and immediately. `channel_visible`
-- asks `is_staff_of`, which reads `agency_memberships.status` in ONE place —
-- measured on a real deactivated account, their rail went from twelve
-- conversations to zero and no message in any of them was readable.
--
-- ── WHAT WAS NOT ──────────────────────────────────────────────────────────
--
-- `channel_notifiable` has six branches. Four of them check that the person is
-- still an active principal. The two that decide MEMBERSHIP — "named on it"
-- and "on a live team that is" — never did. So a deactivated person:
--
--   · was still counted in "Members · N", because the count is
--     `mention_group_recipients`, which asks this function
--   · was still listed on the roster and offered by the mention picker
--   · and was still NOTIFIED — by @everyone, by their team, or by name —
--     about conversations they could no longer open
--
-- Measured, not assumed: a deactivated member still came back from
-- `mention_group_recipients` for a private room.
--
-- That is the opposite of what this function's own comment promises — "no
-- wider than channel_visible" — and it is the visible half of what Dee is
-- describing. A membership row is not access on its own, but it was still
-- speaking for somebody who had left.
--
-- ── WHY THE ROW IS KEPT ───────────────────────────────────────────────────
--
-- Deleting every `channel_members` row on deactivation would also work, and it
-- is not reversible: somebody back from leave would have to be re-added to
-- fifteen rooms by hand, and the record of who was in a conversation would be
-- gone (rule 11 — prefer a status transition where history matters). The row
-- stays and stops counting, which is the same shape as `is_staff_of`: one
-- predicate decides, everywhere at once, rather than a cleanup somebody has to
-- remember to run.

/* Mirrors `channel_visible`'s requirement of the CHANNEL'S OWNER exactly, so
   this can never make somebody notifiable who could not read the message they
   are being notified about. */
create or replace function public.channel_member_still_active(p_channel uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.channels c
     where c.id = p_channel
       and (
         /* BES's own — channels, topics and group chats alike. */
         (c.agency_id is not null and exists (
            select 1 from public.agency_memberships am
             where am.user_id = p_user and am.agency_id = c.agency_id
               and am.status = 'active'))

         /* A customer organization's. */
         or (c.organization_id is not null and exists (
            select 1 from public.org_memberships om
             where om.user_id = p_user and om.organization_id = c.organization_id))

         /* A partner conversation has two live sides: the partner's own active
            contacts, and BES staff. A suspended contact or a suspended partner
            ends the first, exactly as it does everywhere else (0159). */
         or (c.partner_group_id is not null and (
              exists (select 1 from public.partner_contacts pc
                        join public.outsourcing_groups g on g.id = pc.group_id
                       where pc.user_id = p_user and pc.group_id = c.partner_group_id
                         and pc.status = 'active'
                         and g.lifecycle not in ('suspended', 'archived'))
              or exists (select 1 from public.agency_memberships am
                           join public.outsourcing_groups g on g.agency_id = am.agency_id
                          where g.id = c.partner_group_id and am.user_id = p_user
                            and am.status = 'active')))
       )
  )
$function$;

comment on function public.channel_member_still_active(uuid, uuid) is
  'Whether a named member of a conversation is still a live principal of whoever owns it. Deactivate somebody and every count, roster, mention picker and notification stops including them, without deleting the record that they were there.';

revoke all on function public.channel_member_still_active(uuid, uuid) from public, anon;
grant execute on function public.channel_member_still_active(uuid, uuid) to authenticated;

-- ── The two branches that were missing the check ──────────────────────────
--
-- Built by taking the CURRENT definition verbatim and wrapping one branch,
-- rather than retyping it. Rewriting a long function from a read of it is how
-- the partner-assignment path — service scoping, and assignment by TEAM
-- rather than by person — gets quietly dropped, which is exactly what the
-- first draft of this migration did.
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

comment on function public.channel_notifiable(uuid, uuid) is
  'Whether a NAMED person may be told about a message in this channel. Deliberately no wider than `channel_visible`: a missed notification is an annoyance and the opposite mistake is a leak. The membership branches ask `channel_member_still_active`, so deactivating somebody stops them being counted, listed, mentioned or notified everywhere at once (Dee, 2026-09-18).';
