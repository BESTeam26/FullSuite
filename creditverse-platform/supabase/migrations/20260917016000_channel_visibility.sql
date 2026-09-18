-- Public or private, and a switch to say which.
--
-- Dee, 2026-09-17: "I wanna have the capability to set the channel in private
-- and in public, private is locked and will be hidden automatically, public
-- will be automatically available and joined by all BES team member."
--
-- Both behaviours already exist and are what `open_to_scope` means:
--
--   PUBLIC  (open_to_scope = true)  — `channel_visible` passes for anyone the
--           agency scope covers, so every active BES person is in it without a
--           membership row, and out of it the moment they are deactivated.
--   PRIVATE (open_to_scope = false) — the same check falls through to
--           `channel_member_of`, so it is not merely hidden from the rail: it
--           is not selectable, not readable and not searchable to anyone who
--           is not named on it.
--
-- What was missing is the switch. A channel's audience was fixed at the moment
-- somebody created it and there was no way to change it afterwards.
--
-- ── WHY A TRIGGER AND NOT ONLY A FUNCTION ─────────────────────────────────
--
-- `channels_update` already lets any channel manager update the row, so an RPC
-- alone would be a suggestion: a manager could PATCH `open_to_scope` straight
-- through PostgREST and skip every rule below. The rules therefore live in a
-- trigger, which is the only place they cannot be routed around. The function
-- exists for the audit columns and for one honest error message.

-- ── Who changed it, and when ──────────────────────────────────────────────
alter table public.channels
  add column if not exists visibility_changed_at timestamptz,
  add column if not exists visibility_changed_by uuid references public.profiles(id);

comment on column public.channels.visibility_changed_at is
  'When this conversation was last made public or private. Null means it is still as it was created.';

-- ── The rules, where they cannot be skipped ───────────────────────────────
create or replace function public.channels_guard_visibility()
returns trigger language plpgsql set search_path = public as $function$
begin
  if new.open_to_scope is not distinct from old.open_to_scope then
    return new;
  end if;

  /* A default channel exists FOR everyone. Making General Discussion,
     Announcements or Great Results private would hide the one place the whole
     team is meant to share, and it would do it silently. */
  if old.system_key is not null and new.open_to_scope = false then
    raise exception 'This is a default channel — every BES person is meant to be in it, so it cannot be made private.'
      using errcode = 'P0001';
  end if;

  /* A group chat IS its people: the same people always reach the same
     conversation, and there is nothing to open it to. "Public group chat" is
     a channel nobody named. */
  if old.kind = 'direct' and new.open_to_scope = true then
    raise exception 'A direct message or group chat is its people. Make a channel instead.'
      using errcode = 'P0001';
  end if;

  /* Turning a public channel private is how a room gets lost: a public channel
     has no member rows, so the moment it stops being public there may be
     nobody left who can see it — including whoever just changed it. Refused
     here rather than left to the caller to remember. */
  if new.open_to_scope = false
     and not exists (select 1 from public.channel_members m
                      where m.channel_id = old.id and m.is_manager) then
    raise exception 'Name at least one person as a manager before making this private, or nobody will be able to open it.'
      using errcode = 'P0001';
  end if;

  new.visibility_changed_at := now();
  new.visibility_changed_by := coalesce(auth.uid(), new.visibility_changed_by);
  return new;
end;
$function$;

drop trigger if exists channels_guard_visibility on public.channels;
create trigger channels_guard_visibility before update on public.channels
  for each row execute function public.channels_guard_visibility();

-- ── The switch ────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER for one reason only: going private has to name the person
-- doing it as a manager FIRST, or the guard above correctly refuses — and
-- writing that membership row and flipping the column are two statements that
-- must not half-happen. Every authority check is still asked before anything
-- is written.
create or replace function public.set_channel_visibility(p_channel uuid, p_public boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_kind public.channel_kind;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public.channel_manager(p_channel) then
    raise exception 'Only a manager of this conversation can change who can see it'
      using errcode = '42501';
  end if;

  select kind into v_kind from public.channels where id = p_channel;
  if v_kind is null then
    raise exception 'No such conversation' using errcode = '42501';
  end if;

  /* Going private: make sure somebody is left holding it. The actor is a
     manager of it by the check above, so naming them is a record of what is
     already true, not a new grant. */
  if p_public = false then
    insert into public.channel_members (channel_id, user_id, is_manager)
    values (p_channel, v_me, true)
    on conflict (channel_id, user_id) do update set is_manager = true;
  end if;

  update public.channels set open_to_scope = p_public where id = p_channel;
end;
$function$;

comment on function public.set_channel_visibility(uuid, boolean) is
  'Make a conversation public (everyone at BES, no membership rows) or private (named people and teams only, and hidden from everyone else). Going private names the caller as a manager first, so a room can never be made invisible to everybody. The rules are enforced by channels_guard_visibility, which a direct update cannot skip.';

revoke all on function public.set_channel_visibility(uuid, boolean) from public, anon;
grant execute on function public.set_channel_visibility(uuid, boolean) to authenticated;
