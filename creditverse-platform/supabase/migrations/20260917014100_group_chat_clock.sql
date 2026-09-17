-- A partner group chat is a partner conversation too.
--
-- Dee, 2026-09-17: "on all partner GC and Partner Channels, use their own Time
-- Zone." The first version of `channel_timezone` only read
-- `channels.partner_group_id`, which a PARTNER CHANNEL has and a GROUP CHAT
-- does not — `open_group_conversation` creates a plain agency-scoped `direct`
-- row whose membership is the only record of who is in it. So a group chat
-- with a partner in it was reading on BES's clock, which is exactly the half
-- of the rule that was asked for and missing.
--
-- The membership answers it: if every partner person in the conversation
-- belongs to ONE partner, that is the partner whose clock it is. Two different
-- partners in one room has no answer — there is no single "their time" — so it
-- falls back to BES's clock rather than picking one of them arbitrarily.

create or replace function public.channel_timezone(p_channel uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    /* A partner CHANNEL says whose it is on the row itself. */
    (select g.timezone from public.outsourcing_groups g
       join public.channels c on c.partner_group_id = g.id
      where c.id = p_channel),
    /* A partner GROUP CHAT or DM says it through its membership. One partner
       among the people in the room, or no answer at all. */
    (select max(g.timezone) from public.outsourcing_groups g
      where g.id in (
        select distinct pc.group_id
          from public.channel_members m
          join public.partner_contacts pc on pc.user_id = m.user_id
         where m.channel_id = p_channel and pc.status = 'active')
      having count(*) = 1),
    /* Otherwise BES's own clock, from the one column that already defines it. */
    (select a.eod_timezone from public.agencies a
       join public.channels c on c.agency_id = a.id
      where c.id = p_channel),
    'America/New_York')
$$;

comment on function public.channel_timezone(uuid) is
  'The clock a conversation''s timestamps are read on: the partner''s for a partner channel, group chat or DM, the agency''s otherwise. Two partners in one room has no single answer, so it stays on the agency''s. Never the reader''s own.';

revoke all on function public.channel_timezone(uuid) from public, anon;
grant execute on function public.channel_timezone(uuid) to authenticated;
