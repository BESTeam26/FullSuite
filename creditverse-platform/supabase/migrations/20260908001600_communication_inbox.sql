-- 0193 — The central inbox: unread, direct messages, one list call, and search.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS FOR
--
-- Dee: "For this to replace external chat operationally, support per-user
-- unread/read state." (§21) — and §20's single left rail, §13's one canonical
-- DM per pair, §24's search that cannot see past RLS.
--
-- The theme is rule 14. A conversation list that asks per channel "how many
-- have I not read" is an N+1 over the whole inbox, every time the page opens.
-- `visible_channels()` answers the entire left rail in ONE call.
-- ---------------------------------------------------------------------------

-- ── Read state (§21) ────────────────────────────────────────────────────
--
-- Its own table, and `channel_members.last_read_at` is dropped rather than
-- left beside it. Read state cannot live on membership: somebody who reaches
-- a conversation through their TEAM, or through an all-hands channel, has no
-- membership row and still reads messages. Two places to store one fact is
-- how one of them goes stale (rules 2 and 6).
create table public.channel_reads (
  channel_id   uuid not null references public.channels(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index channel_reads_user_idx on public.channel_reads (user_id);

comment on table public.channel_reads is
  'Where each person has read up to. Per user, never per channel — "this conversation is read" is not a fact about the conversation (Dee, §21).';

alter table public.channel_members drop column if exists last_read_at;

alter table public.channel_reads enable row level security;
revoke all on public.channel_reads from public, anon;
grant select, insert, update on public.channel_reads to authenticated;

/* Your own row, in a channel you can see. Nobody reads anybody else's read
   state: when somebody last opened a conversation is not the business of the
   other people in it. */
create policy channel_reads_select on public.channel_reads for select to authenticated
  using (user_id = auth.uid());
create policy channel_reads_insert on public.channel_reads for insert to authenticated
  with check (user_id = auth.uid() and public.channel_visible(channel_id));
create policy channel_reads_update on public.channel_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.mark_channel_read(p_channel uuid, p_at timestamptz default now())
returns void language plpgsql security invoker set search_path = public as $function$
begin
  insert into public.channel_reads (channel_id, user_id, last_read_at)
  values (p_channel, auth.uid(), p_at)
  on conflict (channel_id, user_id) do update
    /* Never moves backwards. Opening an old conversation in a second tab must
       not resurrect messages the person has already dealt with. */
    set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at);
end;
$function$;
revoke execute on function public.mark_channel_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_channel_read(uuid, timestamptz) to authenticated;

-- ── The whole left rail, in one call (§20, rule 14) ─────────────────────
--
-- SECURITY INVOKER, deliberately: `channels_select` decides what comes back.
-- A definer here would be a second, parallel answer to "what may this person
-- see", and the second answer is always the one that is wrong.
--
-- `audit_only` is how the interface keeps §17: a row an administrator can
-- read but is not part of is labelled and grouped as Administration, never
-- mixed into their own conversations.
create or replace function public.visible_channels()
returns table (
  id uuid, organization_id uuid, agency_id uuid, partner_group_id uuid,
  partner_service_id uuid, organization_name text, partner_name text,
  service_name text, kind text, name text, display_name text, purpose text,
  open_to_scope boolean, archived_at timestamptz, shared_with_bes boolean,
  audit_only boolean, is_manager boolean, unread integer, last_message_at timestamptz
)
language sql stable security invoker set search_path = public as $function$
  select
    c.id, c.organization_id, c.agency_id, c.partner_group_id, c.partner_service_id,
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

-- ── One direct message per pair, however it is started (§13) ────────────
--
-- Dee: "Do not create a second DM row when the participants reverse who starts
-- it." So this looks for a conversation whose member set is EXACTLY the two
-- people, in either order, before it creates one.
--
-- SECURITY DEFINER because it must add the OTHER person to the channel, and
-- `channel_members_write` rightly refuses that to somebody who is not yet its
-- manager. Everything it is trusted with is checked first: both people must be
-- ACTIVE staff of the same agency, and it will not open a conversation with
-- somebody outside it.
create or replace function public.open_direct_channel(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_me     uuid := auth.uid();
  v_agency uuid;
  v_id     uuid;
begin
  if v_me is null or p_other is null or p_other = v_me then
    raise exception 'A direct message needs two different people' using errcode = 'P0001';
  end if;

  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = v_me and m.status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'Not agency staff' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.agency_memberships m
     where m.user_id = p_other and m.agency_id = v_agency and m.status = 'active'
  ) then
    raise exception 'That person is not active staff of this agency' using errcode = '42501';
  end if;

  /* Exactly these two and nobody else — a group conversation that happens to
     contain both of them is not their direct message. */
  select c.id into v_id
    from public.channels c
   where c.agency_id = v_agency and c.kind = 'direct' and c.archived_at is null
     and (select count(*) from public.channel_members m where m.channel_id = c.id) = 2
     and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = v_me)
     and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = p_other)
   order by c.created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.channels (agency_id, kind, name, created_by)
  values (v_agency, 'direct', 'Direct message', v_me)
  returning id into v_id;

  insert into public.channel_members (channel_id, user_id, is_manager)
  values (v_id, v_me, true), (v_id, p_other, true);

  return v_id;
end;
$function$;
revoke execute on function public.open_direct_channel(uuid) from public, anon;
grant execute on function public.open_direct_channel(uuid) to authenticated;

comment on function public.open_direct_channel(uuid) is
  'Find-or-create the ONE direct conversation between two people. Both are managers of it, because a private conversation has no third party to administer it (Dee, §13).';

-- ── Search that cannot see past the conversation list (§24) ─────────────
--
-- Dee: "Agent searches Partner C but has no Partner C access. Expected: no
-- Partner C channel, no message snippet, no participant leak. Search is not
-- allowed to bypass RLS."
--
-- INVOKER, so `messages_select` filters it — and narrowed further to
-- `channel_visible`, so an ordinary search returns conversations the person is
-- IN, never ones they may only inspect for administration. Reading an audited
-- conversation stays a deliberate act.
create or replace function public.search_messages(p_query text, p_limit integer default 40)
returns table (
  message_id bigint, channel_id uuid, channel_name text, author_name text,
  body_text text, created_at timestamptz
)
language sql stable security invoker set search_path = public as $function$
  select m.id, m.channel_id, c.name,
         coalesce(nullif(trim(pr.full_name), ''), pr.email),
         m.body_text, m.created_at
    from public.messages m
    join public.channels c on c.id = m.channel_id
    left join public.profiles pr on pr.id = m.author_id
   where m.deleted_at is null
     and length(trim(coalesce(p_query, ''))) >= 2
     and m.body_text ilike '%' || trim(p_query) || '%'
     and public.channel_visible(m.channel_id)
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 40), 1), 100)
$function$;
revoke execute on function public.search_messages(text, integer) from public, anon;
grant execute on function public.search_messages(text, integer) to authenticated;

comment on function public.search_messages(text, integer) is
  'Message search. INVOKER and narrowed to channel_visible, so it can only ever return less than the conversation list, never more (Dee, §24).';

create index if not exists messages_body_text_idx
  on public.messages using gin (to_tsvector('english', body_text));
