-- 0180 — refuse cleanly, instead of erroring.
--
-- 0178 set `encrypted_password = null` on every fixture. That does prevent a
-- login — no token is ever issued — but GoTrue cannot compare a password
-- against a NULL hash, so the attempt comes back as
--
--     HTTP 500  "Database error querying schema"
--
-- A refusal, but by failure rather than by decision. Two problems with that:
-- a 500 is indistinguishable from the service being broken, and a refusal
-- nobody can read is a refusal nobody can verify.
--
-- Instead: a well-formed bcrypt hash of a value generated here and never
-- stored anywhere. Two random uuids concatenated, hashed with a fresh salt,
-- and the plaintext discarded the moment the statement ends. No password can
-- match it because no password was ever chosen — and GoTrue now takes its
-- ordinary path and answers 400 "Invalid login credentials".
--
-- `banned_until = 'infinity'` stays underneath it. The hash makes the refusal
-- clean; the ban is what makes it unconditional, covering magic link, OTP and
-- any recovery flow that never looks at a password at all.
create extension if not exists pgcrypto with schema extensions;

update auth.users
   set encrypted_password = extensions.crypt(
         gen_random_uuid()::text || gen_random_uuid()::text,
         extensions.gen_salt('bf')
       )
 where email like '%@bes.test';

-- The assertion guard follows suit: an absent hash is now the drift to fix,
-- not the desired state.
create or replace function public.assert_fixture_logins_disabled()
returns jsonb
language plpgsql
security definer
set search_path = auth, public, extensions as $function$
declare
  v_passwords int; v_bans int; v_identities int; v_sessions int;
begin
  /* An unmatchable hash, not NULL: NULL makes GoTrue error instead of
     refusing. Regenerated for any fixture whose hash is missing. */
  with fixed as (
    update auth.users
       set encrypted_password = extensions.crypt(
             gen_random_uuid()::text || gen_random_uuid()::text,
             extensions.gen_salt('bf'))
     where email like '%@bes.test' and encrypted_password is null
    returning 1
  ) select count(*) into v_passwords from fixed;

  with fixed as (
    update auth.users set banned_until = 'infinity'
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

  return jsonb_build_object(
    'passwords_replaced', v_passwords,
    'bans_applied', v_bans,
    'identities_removed', v_identities,
    'sessions_revoked', v_sessions,
    'drift_found', (v_passwords + v_bans + v_identities + v_sessions) > 0
  );
end;
$function$;
revoke execute on function public.assert_fixture_logins_disabled() from public, anon, authenticated;

/* The view now reports what actually matters: not whether a hash exists, but
   whether anything is unbanned or still holds an identity or a session. */
create or replace view public.fixture_login_state as
  select
    count(*)::int as fixture_identities,
    0::int as with_password,
    count(*) filter (where banned_until is null or banned_until < now())::int as not_banned,
    (select count(*)::int from auth.identities i join auth.users u2 on u2.id = i.user_id
      where u2.email like '%@bes.test') as identity_rows,
    (select count(*)::int from auth.sessions s join auth.users u3 on u3.id = s.user_id
      where u3.email like '%@bes.test') as live_sessions
  from auth.users where email like '%@bes.test';
revoke all on public.fixture_login_state from public, anon, authenticated;
