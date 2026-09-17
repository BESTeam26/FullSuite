-- Whose clock is a message stamped with?
--
-- Dee, 2026-09-17: "I wanna add the TIME in the chat record not just the date,
-- so we know the time stamp. For all internal BES, time should be EST. For
-- partners, time will follow their Time Zone on all partner GC and Partner
-- Channels, use their own Time Zone."
--
-- The rule is about the CONVERSATION, not the reader. A BES agent in Manila
-- reading #general sees Eastern, because that is the clock BES operates on and
-- the one every standup, cutoff and deadline in this product is quoted in. The
-- same agent reading a partner's channel sees the PARTNER's clock, because the
-- reason to look at a timestamp there is to know what time it was for them.
--
-- So the timezone is a property of the channel, resolved once and returned
-- with the rest of what opening a conversation needs. Deriving it in the
-- browser would be wrong twice over: the browser only knows the reader's own
-- zone, and two people would disagree about which day a message was sent.
--
-- ── WHY NOT A NEW "BES TIMEZONE" SETTING ──────────────────────────────────
--
-- `agencies.eod_timezone` already exists and already means "the clock BES
-- operates on" — it is what decides when an EOD day has closed. A second
-- column would be a second truth about one fact (rule 2), and the day they
-- disagreed, chat would say Tuesday while EOD said Monday.

-- ── A partner keeps its own clock ─────────────────────────────────────────
alter table public.outsourcing_groups
  add column if not exists timezone text not null default 'America/New_York';

comment on column public.outsourcing_groups.timezone is
  'The partner''s own clock. Timestamps in their channels, group chats and portal are shown in it. Defaults to Eastern because that is where BES''s partners are today; it is a per-partner fact, not a constant.';

/* A check constraint cannot query `pg_timezone_names`, so the validation is a
   trigger. Without it a typo — 'EST5EDT4', 'America/New York' — is accepted by
   the column and then silently ignored by `at time zone`, which is the kind of
   wrong that shows up as "the chat is an hour out" months later. */
create or replace function public.partner_timezone_must_exist()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists outsourcing_groups_timezone_valid on public.outsourcing_groups;
create trigger outsourcing_groups_timezone_valid
  before insert or update of timezone on public.outsourcing_groups
  for each row execute function public.partner_timezone_must_exist();

-- ── One place that answers "which clock" ──────────────────────────────────
create or replace function public.channel_timezone(p_channel uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    /* A partner conversation — their channels and their group chats alike,
       because `partner_group_id` is set on both. */
    (select g.timezone from public.outsourcing_groups g
       join public.channels c on c.partner_group_id = g.id
      where c.id = p_channel),
    /* Otherwise BES's own clock, from the one column that already defines it. */
    (select a.eod_timezone from public.agencies a
       join public.channels c on c.agency_id = a.id
      where c.id = p_channel),
    'America/New_York')
$$;

comment on function public.channel_timezone(uuid) is
  'The clock a conversation''s timestamps are read in: the partner''s for a partner channel or group chat, the agency''s otherwise. Never the reader''s own.';

revoke all on function public.channel_timezone(uuid) from public, anon;
grant execute on function public.channel_timezone(uuid) to authenticated;

-- ── It rides along on the call the pane already makes ─────────────────────
create or replace function public.channel_details(p_channel uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'name', case
      when c.kind = 'direct' and c.named_at is null then null
      else c.name end,
    'purpose', c.purpose,
    'kind', c.kind::text,
    'open_to_scope', c.open_to_scope,
    'created_at', c.created_at,
    'created_by', (select coalesce(nullif(trim(p.full_name), ''), p.email)
                     from public.profiles p where p.id = c.created_by),
    'archived_at', c.archived_at,
    'can_rename', c.archived_at is null and (
      case when c.kind = 'direct'
           then (select count(*) from public.channel_members m where m.channel_id = c.id) > 2
           else public.channel_manager(c.id) end),
    'favourite', exists (select 1 from public.channel_favourites f
                          where f.channel_id = c.id and f.user_id = auth.uid()),
    'notifications', coalesce((select level from public.channel_notification_prefs n
                                where n.channel_id = c.id and n.user_id = auth.uid()), 'all'),
    /* Which clock every timestamp below the header is read in. Here rather
       than in a call of its own: the pane needs it to draw the very first
       message, and a round trip it has to wait for is a delay. */
    'timezone', public.channel_timezone(c.id),
    /* The tab strip's numbers, from the same call — and the member count is
       who can be reached, which is what the panel has always said. An open
       conversation has no member ROWS, so counting the table told the tab
       there was nobody in a conversation with ten people in it. */
    'files', (select count(*)::int from public.files f
               join public.messages m on m.channel_id = c.id
                and f.entity_type = 'channel_message' and f.entity_id = m.id::text
              where m.deleted_at is null),
    'pins', (select count(*)::int from public.message_pins mp
              join public.messages m on m.id = mp.message_id
             where m.channel_id = c.id and m.deleted_at is null),
    'member_count', (select count(*) from public.mention_group_recipients(c.id, 'channel')),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', m.name) order by m.name)
        from (select user_id, name from public.channel_mentionable(c.id)
               where user_id !~ '^(channel|team:)' limit 12) m
    ), '[]'::jsonb)
  )
    from public.channels c
   where c.id = p_channel
     and (public.channel_visible(c.id) or public.channel_auditable(c.id))
$$;

comment on function public.channel_details(uuid) is
  'Everything a conversation''s header, tabs, details panel and timestamps need, in ONE round trip. The member count is who can be reached, not how many rows a table has.';

revoke all on function public.channel_details(uuid) from public, anon;
grant execute on function public.channel_details(uuid) to authenticated;
