-- The rooms BES actually works in.
--
-- Dee, 2026-09-17: "Add Default Great Results Channel for BES Internal. This is
-- for all team's Great Results Reporting. Then Channel for each teams: Client
-- Success Team, Dispute Team, Complaints & Mailing Team, CRM Team, BES Admin,
-- BES Managers/TL Room. I will add the team members there."
--
-- Two different kinds of room, and the difference is who is in them:
--
--   GREAT RESULTS is for ALL teams, so it is open to scope — every active BES
--   person is in it because they are active BES staff, and nobody is in it
--   once they are not. There is no membership list to keep tidy, which is the
--   same rule General Discussion and Announcements already follow. It gets a
--   `system_key`: Dee called it the DEFAULT channel, and a default is one that
--   cannot be archived away by accident. The key is the identity, not the
--   label, so it can still be renamed.
--
--   THE SIX TEAM ROOMS are membership rooms — "I will add the team members
--   there" is the whole specification. They are created with Dee as manager
--   and nobody else, because a room with no members and no manager is one
--   nobody can see or add anybody to.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
--
-- Four of the six match a team that already exists (CreditOps Client Success /
-- Support, CreditOps Dispute Processing, CreditOps Complaints & Mailing, CRM),
-- and `channel_member_of` already resolves through `channel_teams` — so wiring
-- a room to its team would keep membership correct by itself as people join
-- and leave. That is a better answer than a hand-kept list, and it is still
-- Dee's to make: who may read a room is an authorization decision, and Dee
-- said they would add the people. The rooms are left unlinked and the option
-- is reported rather than taken.

-- ── A third default is allowed to exist ───────────────────────────────────
--
-- `system_key` is constrained to a list, which is the right shape — it stops a
-- typo from inventing a default nothing knows about — and it means adding one
-- is a deliberate schema change rather than an insert.
alter table public.channels drop constraint if exists channels_system_key_check;
alter table public.channels
  add constraint channels_system_key_check
  check (system_key is null
         or system_key in ('general_discussion', 'announcements_updates', 'great_results'));

-- ── Great Results: everyone, always ───────────────────────────────────────
do $$
declare
  a record;
  v_owner uuid;
begin
  for a in select id from public.agencies loop
    /* The real owner, never a fixture: this row decides who created a
       permanent channel, and a test account must not be the answer. */
    select m.user_id into v_owner
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.agency_id = a.id and m.is_owner and m.status = 'active'
       and coalesce(p.is_fixture, false) = false
     order by m.created_at limit 1;

    if exists (select 1 from public.channels
                where agency_id = a.id and system_key = 'great_results') then
      continue;
    end if;

    /* Adopt an equivalent channel somebody already made rather than stand a
       second one beside it — the same §7 reconciliation the other defaults
       use. Only an UNKEYED agency channel, and adoption changes nothing but
       the key and the scope, so no messages move. */
    update public.channels
       set system_key = 'great_results', open_to_scope = true
     where id = (select id from public.channels
                  where agency_id = a.id and system_key is null and archived_at is null
                    and lower(trim(name)) in ('great results', 'great results reporting')
                  order by created_at limit 1);
    if found then
      continue;
    end if;

    insert into public.channels (agency_id, kind, name, purpose, created_by, open_to_scope, system_key)
    values (a.id, 'topic', 'Great Results',
            'Great Results reporting from every BES team.', v_owner, true, 'great_results');
  end loop;
end $$;

-- ── The six team rooms ────────────────────────────────────────────────────
do $$
declare
  a record;
  r record;
  v_owner uuid;
  v_id uuid;
begin
  for a in select id from public.agencies loop
    select m.user_id into v_owner
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.agency_id = a.id and m.is_owner and m.status = 'active'
       and coalesce(p.is_fixture, false) = false
     order by m.created_at limit 1;
    /* No real owner means no manager, and a room nobody can manage is worse
       than no room. A fixture-only agency is skipped rather than seeded. */
    continue when v_owner is null;

    for r in
      select * from (values
        ('Client Success Team',       'Client Success and Support.'),
        ('Dispute Team',              'Dispute processing.'),
        ('Complaints & Mailing Team', 'Complaints handling and mailing.'),
        ('CRM Team',                  'CRM and GHL build work.'),
        ('BES Admin',                 'BES administration.'),
        ('BES Managers / TL Room',    'Managers and team leads.')
      ) as t(name, purpose)
    loop
      /* Idempotent on the NAME, because a team room has no system key to be
         idempotent on — it is an ordinary channel Dee may rename or archive
         like any other. Matched case-insensitively and including archived
         ones: re-running this must not resurrect a room Dee closed. */
      if exists (select 1 from public.channels c
                  where c.agency_id = a.id
                    and lower(trim(c.name)) = lower(r.name)) then
        continue;
      end if;

      insert into public.channels (agency_id, kind, name, purpose, created_by, open_to_scope)
      values (a.id, 'department', r.name, r.purpose, v_owner, false)
      returning id into v_id;

      /* The creator manages it, or the room exists and nobody can add anybody
         to it — the same circularity `create_agency_channel` exists to avoid. */
      insert into public.channel_members (channel_id, user_id, is_manager)
      values (v_id, v_owner, true)
      on conflict do nothing;
    end loop;
  end loop;
end $$;

-- ── The refusal message named two channels; there are three ───────────────
create or replace function public.protect_system_channels()
returns trigger language plpgsql set search_path = public as $function$
begin
  if old.system_key is not null then
    if new.system_key is distinct from old.system_key then
      raise exception 'A default channel keeps its identity' using errcode = 'P0001';
    end if;
    if new.archived_at is not null and old.archived_at is null then
      raise exception 'This is a default channel. Every active agency has it, so it cannot be archived.'
        using errcode = 'P0001';
    end if;
    /* Renaming is allowed — the KEY is the identity, not the label (§6). */
  end if;
  return new;
end;
$function$;
