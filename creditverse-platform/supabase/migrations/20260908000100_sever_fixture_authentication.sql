-- 0178 — RELEASE BLOCKER. The security fixtures could log in to production.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ACTUALLY TRUE
--
-- Sixteen `@bes.test` accounts existed in `auth.users` with working password
-- hashes, confirmed email addresses, no ban, sixteen identity rows, and
-- twenty-two live sessions with refresh tokens. Several had genuinely signed
-- in. One of them — `bes.owner@bes.test` — held an ACTIVE agency_owner
-- membership in the real BES agency.
--
-- That is a production owner login, not a fixture. `is_fixture = true` hid it
-- from lists; it did nothing whatsoever about authentication. Dee named this
-- exactly right: hiding an account from People is not security, and a hidden
-- owner with production privileges is still a production owner.
--
-- ---------------------------------------------------------------------------
-- THE DISTINCTION THE FIX RESTS ON
--
-- The RLS matrix never signs in. It runs
--
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uuid>"}';
--
-- against a superuser connection. It needs a `profiles` row and an
-- `agency_memberships` row at those uuids. It has never needed a password, an
-- identity, a session, or the ability to authenticate — those were created by
-- the seeding script out of habit and were pure liability.
--
-- So: the DATABASE TEST RECORDS stay, and the AUTHENTICATABLE PRODUCTION USER
-- is destroyed. Membership row, yes. Login, no. That is precisely the
-- separation Dee set out.
--
-- ---------------------------------------------------------------------------
-- WHY ALL FOUR STEPS, NOT ONE
--
-- Each closes a different door, and any one alone leaves another open:
--
--   sessions and refresh tokens  — a live session outlives a password change
--   password hash               — the password grant
--   identity rows               — OAuth and email-identity linkage
--   banned_until = 'infinity'   — every remaining path, including magic link
--                                 and any future recovery flow
--
-- And a trigger, so this cannot drift back: any attempt to insert or update a
-- `@bes.test` user re-applies the ban and strips the credential, whoever does
-- it and whatever they intended.
-- ---------------------------------------------------------------------------

-- 1. Every live session and refresh token, gone.
delete from auth.refresh_tokens r
 using auth.users u where u.id::text = r.user_id and u.email like '%@bes.test';

delete from auth.sessions s
 using auth.users u where u.id = s.user_id and u.email like '%@bes.test';

-- 2. Every identity — the OAuth and email-identity linkage.
delete from auth.identities i
 using auth.users u where u.id = i.user_id and u.email like '%@bes.test';

-- 3. No credential to present, and every recovery path emptied.
update auth.users
   set encrypted_password    = null,
       banned_until          = 'infinity',
       confirmation_token    = '',
       recovery_token        = '',
       email_change_token_new = '',
       email_change_token_current = '',
       reauthentication_token = '',
       phone                 = null,
       raw_app_meta_data     = coalesce(raw_app_meta_data, '{}'::jsonb)
                                 || jsonb_build_object(
                                      'fixture', true,
                                      'login_disabled_reason',
                                      'RLS matrix fixture. Authentication severed 0178 — the matrix asserts with jwt.claims and never signs in.')
 where email like '%@bes.test';

-- 4. It cannot come back by accident.
create or replace function public.deny_fixture_authentication()
returns trigger
language plpgsql
security definer
set search_path = auth, public as $function$
begin
  if new.email like '%@bes.test' then
    /* Not an exception: raising here would break the matrix's own seeding and
       any legitimate maintenance of the row. It simply cannot end up in a
       state that permits a login. */
    new.encrypted_password := null;
    new.banned_until := 'infinity';
    new.confirmation_token := '';
    new.recovery_token := '';
  end if;
  return new;
end;
$function$;

drop trigger if exists deny_fixture_authentication on auth.users;
create trigger deny_fixture_authentication
  before insert or update on auth.users
  for each row execute function public.deny_fixture_authentication();

comment on function public.deny_fixture_authentication() is
  'A @bes.test identity cannot hold a credential or an unbanned state, however it is written. The RLS matrix needs the profile and membership ROWS, never a login — and a test fixture that can authenticate into production is a backdoor whatever it is labelled.';
