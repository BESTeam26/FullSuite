-- 0179 — the anti-drift guard, moved out of GoTrue's write path.
--
-- ---------------------------------------------------------------------------
-- WHY THE TRIGGER FROM 0178 WAS REMOVED
--
-- 0178 put a BEFORE INSERT OR UPDATE trigger on `auth.users` so a fixture
-- could never be given a credential again. That table belongs to GoTrue, and
-- GoTrue writes to it on every sign-in — putting my logic in that path risks
-- breaking authentication for REAL users to protect fixtures that cannot
-- authenticate anyway. The wrong trade, and I made it.
--
-- The severed state does the work on its own: no password hash, no identity
-- row, no session, and banned_until = 'infinity'. There is no credential to
-- present and no path that ignores the ban.
--
-- What the trigger was for — drift — is handled by ASSERTION instead of
-- interception. This function re-applies the state and reports what it had to
-- correct. The RLS matrix calls it at bootstrap, so every security run
-- re-establishes it and would report a fixture that had regained a login.
--
-- Assertion where interception would sit in a critical path: the guarantee is
-- the same, and it cannot take production down with it.
-- ---------------------------------------------------------------------------

create or replace function public.assert_fixture_logins_disabled()
returns jsonb
language plpgsql
security definer
set search_path = auth, public as $function$
declare
  v_passwords int; v_bans int; v_identities int; v_sessions int;
begin
  with fixed as (
    update auth.users
       set encrypted_password = null
     where email like '%@bes.test' and encrypted_password is not null
    returning 1
  ) select count(*) into v_passwords from fixed;

  with fixed as (
    update auth.users
       set banned_until = 'infinity'
     where email like '%@bes.test'
       and (banned_until is null or banned_until < 'infinity'::timestamptz)
    returning 1
  ) select count(*) into v_bans from fixed;

  with fixed as (
    delete from auth.identities i using auth.users u
     where u.id = i.user_id and u.email like '%@bes.test'
    returning 1
  ) select count(*) into v_identities from fixed;

  with fixed as (
    delete from auth.sessions s using auth.users u
     where u.id = s.user_id and u.email like '%@bes.test'
    returning 1
  ) select count(*) into v_sessions from fixed;

  /* Zero everywhere is the healthy answer: nothing needed correcting. A
     non-zero is not an error — it is drift that has just been closed, and it
     is worth knowing about. */
  return jsonb_build_object(
    'passwords_cleared', v_passwords,
    'bans_applied', v_bans,
    'identities_removed', v_identities,
    'sessions_revoked', v_sessions,
    'drift_found', (v_passwords + v_bans + v_identities + v_sessions) > 0
  );
end;
$function$;
revoke execute on function public.assert_fixture_logins_disabled() from public, anon, authenticated;

comment on function public.assert_fixture_logins_disabled() is
  'Re-applies the severed state on every @bes.test identity and reports what it corrected. Run at RLS matrix bootstrap. Assertion rather than a trigger on auth.users, because logic in GoTrue''s write path can break REAL sign-ins to protect fixtures that cannot sign in anyway.';

/* A view so the state is readable without touching auth.users directly, and
   so the matrix can assert on it. Owner-only: it describes the shape of the
   authentication table and nobody else has business reading it. */
create or replace view public.fixture_login_state as
  select
    count(*)::int as fixture_identities,
    count(*) filter (where encrypted_password is not null)::int as with_password,
    count(*) filter (where banned_until is null or banned_until < now())::int as not_banned
  from auth.users where email like '%@bes.test';

revoke all on public.fixture_login_state from public, anon, authenticated;
